import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import pool from './db';
import { classificarLigacao } from './services/llmClassifier';
import { normalizePhone } from './utils/phoneValidator';
import { adminVapiHealthRouter } from './api/routes/adminVapiHealth';
import { adminMigrationsRouter } from './api/routes/adminMigrations';
import vapiWebhookRouter from './api/routes/vapiWebhook';
import { campaignsV2Router } from './api/routes/campaignsV2';
import { streamRouter } from './api/routes/stream';
import { externalTriggerRouter } from './api/routes/externalTrigger';
import { runPendingMigrations } from './infrastructure/database/runMigrations';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api/admin', adminVapiHealthRouter);
app.use('/api/admin', adminMigrationsRouter);
app.use('/api/v2', vapiWebhookRouter);
app.use('/api', vapiWebhookRouter);
app.use('/api/v2', campaignsV2Router);
app.use('/api/v2', streamRouter);
const PORT = Number(process.env.PORT || 3000);
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.get('/api/health', (_req: Request, res: Response) => {
  return res.json({ status: 'ok' });
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

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const frontendIndex = path.join(frontendDist, 'index.html');

if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDist, { index: false }));
  app.use((req: Request, res: Response, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }
    return res.sendFile(frontendIndex);
  });
}

import { runCampaignDispatcher } from './workers/campaignDispatcher';

let isDispatching = false;
function startBackgroundDispatcher() {
  console.log('[Dispatcher] Loop de disparo automático ativado (intervalo: 5s)...');
  setInterval(async () => {
    if (isDispatching) return;
    isDispatching = true;
    try {
      await runCampaignDispatcher();
    } catch (err) {
      console.error('[Dispatcher] Erro no loop de disparo:', err);
    } finally {
      isDispatching = false;
    }
  }, 5000);
}

if (require.main === module) {
  runPendingMigrations()
    .then((results) => {
      console.log('Database migrations processed on startup:', results);
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        startBackgroundDispatcher();
      });
    })
    .catch((err) => {
      console.error('Failed to run migrations on startup:', err);
      // Still listen so the server doesn't crash completely, allowing admin route access
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        startBackgroundDispatcher();
      });
    });
}

export default app;
