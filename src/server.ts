import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from './db';
import { classificarLigacao } from './services/llmClassifier';
import { normalizePhone } from './utils/phoneValidator';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const upload = multer({ dest: 'uploads/' });

// Webhook Mínimo para receber eventos do Vapi
app.post('/api/vapi/webhook', async (req: Request, res: Response) => {
  try {
    const message = req.body?.message;

    if (!message) {
      console.warn('Webhook received without "message" in body:', req.body);
      return res.status(400).json({ error: 'Missing message in body' });
    }

    const { type, call } = message;
    
    // Garantir idempotência inserindo no banco
    if (call?.id) {
      try {
        await pool.query(
          'INSERT INTO eventos_webhook (call_id, tipo_evento, payload) VALUES (?, ?, ?)',
          [call.id, type, JSON.stringify(message)]
        );
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`[Webhook Event] Evento duplicado ignorado: Type: ${type} | Call ID: ${call.id}`);
          return res.status(200).json({ received: true, ignored: 'duplicate' });
        }
        console.error('Erro ao inserir evento no webhook', err);
      }
    }

    console.log(`[Webhook Event] Processando: Type: ${type} | Call ID: ${call?.id}`);
    
    if (type === 'end-of-call-report') {
      console.log('--- FIM DE LIGAÇÃO ---');
      const telefone = call?.customer?.number;
      
      let transcricao = '';
      let falasCliente: string[] = [];

      if (message.transcript) {
        transcricao = message.transcript;
        // O Vapi manda a transcript estruturada em message.artifact.messages, vamos assumir que extraimos daqui
        if (message.artifact && message.artifact.messages) {
          falasCliente = message.artifact.messages
            .filter((m: any) => m.role === 'user' || m.role === 'customer')
            .map((m: any) => m.message);
        } else {
          // Fallback, manda a transcrição inteira se não for estruturado
          falasCliente.push(transcricao);
        }
      }

      console.log(`Iniciando classificação LLM para call ${call?.id}...`);
      const { decisao, dataAgendamento } = await classificarLigacao(transcricao, falasCliente);
      console.log(`Classificação: ${decisao}`, dataAgendamento ? `| Data: ${dataAgendamento}` : '');

      // Salva na auditoria
      await pool.query(
        'INSERT INTO auditoria_chamadas (call_id, telefone, decisao, data_agendamento) VALUES (?, ?, ?, ?)',
        [call?.id || 'desconhecido', telefone || '', decisao, dataAgendamento || null]
      );

      // Se for Agendar, cria um novo registro na fila de disparo
      if (decisao === 'Agendar' && dataAgendamento) {
        // Encontrar o CPF original para repassar (ideal buscar na fila_disparo pelo telefone/call_id,
        // mas o Vapi não retorna o nosso ID interno a menos que mandemos nos metadados.
        // Assumindo que enviamos no customer metadata ou buscamos por telefone:
        const [rows]: any = await pool.query(
          'SELECT cpf FROM fila_disparo WHERE telefone = ? ORDER BY id DESC LIMIT 1',
          [telefone]
        );
        const cpfOriginal = rows[0]?.cpf || null;

        await pool.query(
          `INSERT INTO fila_disparo (telefone, cpf, status, proxima_tentativa_em) VALUES (?, ?, 'pendente', ?)`,
          [telefone, cpfOriginal, dataAgendamento]
        );
        console.log(`Reprogramado na fila para ${dataAgendamento}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint para upload da planilha
app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }

  const results: any[] = [];
  let inseridos = 0;

  fs.createReadStream(req.file.path)
    .pipe(parse({ columns: true, trim: true }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const connection = await pool.getConnection();
        for (const row of results) {
          // Procura coluna de telefone, assumindo 'telefone', 'phone', 'numero'
          const telefoneRaw = row.telefone || row.phone || row.numero || Object.values(row)[0];
          const cpfRaw = row.cpf || null;

          if (telefoneRaw) {
            const phoneE164 = normalizePhone(String(telefoneRaw));
            if (phoneE164) {
              await connection.query(
                `INSERT INTO fila_disparo (telefone, cpf, status) VALUES (?, ?, 'pendente')`,
                [phoneE164, cpfRaw]
              );
              inseridos++;
            }
          }
        }
        connection.release();
        fs.unlinkSync(req.file!.path); // limpar o arquivo
        return res.json({ message: 'Arquivo processado', contatosValidos: inseridos });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Erro ao salvar no banco' });
      }
    });
});

// Endpoint para buscar últimas chamadas para a tabela
app.get('/api/calls', async (req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT id, telefone, status, null as decisao, atualizado_em as data 
      FROM fila_disparo 
      ORDER BY atualizado_em DESC LIMIT 20
    `);
    // Na vida real faremos um JOIN com a tabela de auditoria para pegar a decisão.
    // Isso é só para o front não quebrar e mostrar dados reais da fila
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar chamadas' });
  }
});

// Endpoint manual para acionar o worker pelo front (para testes)
app.post('/api/worker/start', (req: Request, res: Response) => {
  const { exec } = require('child_process');
  exec('npx tsx src/worker.ts', (err: any, stdout: any, stderr: any) => {
    if (err) {
      console.error(err);
    }
    console.log(stdout);
  });
  return res.json({ message: 'Worker acionado em background.' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/api/vapi/webhook`);
});
