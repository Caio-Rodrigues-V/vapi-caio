import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from './db';
import { classificarLigacao } from './services/llmClassifier';
import { normalizePhone } from './utils/phoneValidator';
import { adminVapiHealthRouter } from './api/routes/adminVapiHealth';
import { adminMigrationsRouter } from './api/routes/adminMigrations';
import vapiWebhookRouter from './api/routes/vapiWebhook';
import { campaignsV2Router } from './api/routes/campaignsV2';
import { runPendingMigrations } from './infrastructure/database/runMigrations';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/admin', adminVapiHealthRouter);
app.use('/api/admin', adminMigrationsRouter);
app.use('/api/v2', vapiWebhookRouter);
app.use('/api/v2', campaignsV2Router);

const PORT = Number(process.env.PORT || 3000);
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/api/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok' });
});

app.post('/api/vapi/webhook', async (req: Request, res: Response) => {
  try {
    const message = req.body?.message;

    if (!message) {
      return res.status(400).json({ error: 'Missing message in body' });
    }

    const { type, call } = message;
    const callId = call?.id;

    if (!callId || !type) {
      return res.status(400).json({ error: 'Missing call id or event type' });
    }

    try {
      await pool.query(
        'INSERT INTO eventos_webhook (call_id, tipo_evento, payload) VALUES (?, ?, ?)',
        [callId, type, JSON.stringify(message)]
      );
    } catch (error: any) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(200).json({ received: true, ignored: 'duplicate' });
      }
      throw error;
    }

    if (type !== 'end-of-call-report') {
      return res.status(200).json({ received: true });
    }

    const telefone = call?.customer?.number || '';
    const transcricao = message.transcript || '';
    const mensagens = Array.isArray(message.artifact?.messages)
      ? message.artifact.messages
      : [];

    const falasCliente = mensagens
      .filter((item: any) => item.role === 'user' || item.role === 'customer')
      .map((item: any) => item.message)
      .filter(Boolean);

    if (falasCliente.length === 0 && transcricao) {
      falasCliente.push(transcricao);
    }

    const { decisao, dataAgendamento } = await classificarLigacao(
      transcricao,
      falasCliente
    );

    await pool.query(
      `INSERT INTO auditoria_chamadas
        (call_id, telefone, decisao, data_agendamento)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         telefone = VALUES(telefone),
         decisao = VALUES(decisao),
         data_agendamento = VALUES(data_agendamento)`,
      [callId, telefone, decisao, dataAgendamento || null]
    );

    const filaIdMetadata = Number(
      call?.metadata?.filaDisparoId || message?.metadata?.filaDisparoId
    );

    if (Number.isInteger(filaIdMetadata) && filaIdMetadata > 0) {
      await pool.query(
        `UPDATE fila_disparo
         SET status = 'concluido', lote_id = NULL
         WHERE id = ? AND call_id = ?`,
        [filaIdMetadata, callId]
      );
    } else {
      await pool.query(
        `UPDATE fila_disparo
         SET status = 'concluido', lote_id = NULL
         WHERE call_id = ?`,
        [callId]
      );
    }

    if (decisao === 'Agendar' && dataAgendamento) {
      const [rows]: any = await pool.query(
        'SELECT cpf, telefone FROM fila_disparo WHERE call_id = ? LIMIT 1',
        [callId]
      );

      const registroOriginal = rows[0];

      if (registroOriginal) {
        await pool.query(
          `INSERT INTO fila_disparo
            (telefone, cpf, status, proxima_tentativa_em)
           VALUES (?, ?, 'pendente', ?)`,
          [registroOriginal.telefone, registroOriginal.cpf, dataAgendamento]
        );
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const filePath = req.file.path;
  const results: any[] = [];

  fs.createReadStream(filePath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
    .on('data', (data) => results.push(data))
    .on('error', (error) => {
      console.error('Erro ao ler CSV:', error);
      fs.rmSync(filePath, { force: true });
      return res.status(400).json({ error: 'CSV inválido' });
    })
    .on('end', async () => {
      const connection = await pool.getConnection();

      try {
        let inseridos = 0;
        await connection.beginTransaction();

        for (const row of results) {
          const telefoneRaw =
            row.telefone || row.phone || row.numero || Object.values(row)[0];
          const cpfRaw = row.cpf || null;
          const phoneE164 = telefoneRaw
            ? normalizePhone(String(telefoneRaw))
            : null;

          if (!phoneE164) continue;

          await connection.query(
            `INSERT INTO fila_disparo (telefone, cpf, status)
             VALUES (?, ?, 'pendente')`,
            [phoneE164, cpfRaw]
          );
          inseridos += 1;
        }

        await connection.commit();
        return res.json({
          message: 'Arquivo processado',
          contatosValidos: inseridos,
        });
      } catch (error) {
        await connection.rollback();
        console.error(error);
        return res.status(500).json({ error: 'Erro ao salvar no banco' });
      } finally {
        connection.release();
        fs.rmSync(filePath, { force: true });
      }
    });
});

app.get('/api/calls', async (_req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT
        f.id,
        f.telefone,
        f.cpf,
        f.status,
        f.call_id,
        f.tentativas,
        a.decisao,
        a.data_agendamento,
        a.criado_em AS finalizado_em,
        f.atualizado_em AS data
      FROM fila_disparo f
      LEFT JOIN auditoria_chamadas a ON a.call_id = f.call_id
      ORDER BY f.atualizado_em DESC
      LIMIT 100
    `);

    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar chamadas' });
  }
});

app.post('/api/worker/start', (req: Request, res: Response) => {
  const configuredToken = process.env.WORKER_TRIGGER_TOKEN;
  const providedToken = req.header('x-worker-token');

  if (!configuredToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const { execFile } = require('child_process');
  const tsxBinary = require.resolve('tsx/cli');

  execFile(
    process.execPath,
    [tsxBinary, 'src/workers/campaignDispatcher.ts'],
    { cwd: process.cwd() },
    (error: Error | null, stdout: string, stderr: string) => {
      if (error) console.error('Erro no dispatcher de campanhas:', error);
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
    }
  );

  return res.status(202).json({ message: 'Dispatcher de campanhas acionado.' });
});

if (require.main === module) {
  runPendingMigrations()
    .then((results) => {
      console.log('Database migrations processed on startup:', results);
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to run migrations on startup:', err);
      // Still listen so the server doesn't crash completely, allowing admin route access
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    });
}

export default app;
