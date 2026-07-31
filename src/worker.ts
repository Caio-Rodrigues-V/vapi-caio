import pool from './db';
import axios from 'axios';
import { verificarDebito } from './services/ddmService';
import { normalizePhone } from './utils/phoneValidator';

// Limite de concorrência e retries
const BATCH_SIZE = 5; // Ajuste conforme o plano da Vapi
const MAX_TRIES = 5;
const WAIT_BETWEEN_TRIES_MS = 5000; // 5 segundos

// Horário legal (8h - 20h dias úteis)
function isHorarioLegal(): boolean {
  const agora = new Date();
  const dia = agora.getDay();
  const hora = agora.getHours();
  // Domingo = 0, Sábado = 6
  if (dia === 0 || dia === 6) return false;
  if (hora < 8 || hora >= 20) return false;
  return true;
}

async function processarLote() {
  console.log('Iniciando processamento da fila...');

  if (!isHorarioLegal()) {
    console.log('Fora do horário legal. O worker será encerrado.');
    process.exit(0);
  }

  const loteId = `lote_${Date.now()}`;

  try {
    const connection = await pool.getConnection();

    // UPDATE ... LIMIT atômico para reservar o lote
    // Pegamos pendentes ou falhas que ainda não atingiram o maxTries
    // E que proxima_tentativa_em seja <= AGORA
    const [updateResult]: any = await connection.query(
      `UPDATE fila_disparo 
       SET status = 'em_progresso', lote_id = ? 
       WHERE (status = 'pendente' OR status = 'falha') 
         AND tentativas < ? 
         AND proxima_tentativa_em <= CURRENT_TIMESTAMP
         AND sem_debito = FALSE
       LIMIT ?`,
      [loteId, MAX_TRIES, BATCH_SIZE]
    );

    if (updateResult.affectedRows === 0) {
      console.log('Nenhum registro na fila para processar no momento.');
      connection.release();
      process.exit(0);
    }

    // Busca os registros que acabamos de reservar
    const [registros]: any = await connection.query(
      `SELECT * FROM fila_disparo WHERE lote_id = ?`,
      [loteId]
    );

    for (const registro of registros) {
      await processarRegistro(registro, connection);
    }

    connection.release();
    console.log(`Lote ${loteId} processado com sucesso.`);
    process.exit(0);

  } catch (error) {
    console.error('Erro ao processar lote:', error);
    process.exit(1);
  }
}

async function processarRegistro(registro: any, connection: any) {
  const { id, telefone, cpf, tentativas } = registro;
  console.log(`\nProcessando ID: ${id} | Fone: ${telefone} | CPF: ${cpf}`);

  const phoneE164 = normalizePhone(telefone);
  if (!phoneE164) {
    console.log(`Telefone inválido: ${telefone}. Marcando como falha final.`);
    await connection.query(
      `UPDATE fila_disparo SET status = 'falha', tentativas = ? WHERE id = ?`,
      [MAX_TRIES, id] // Seta max tries pra não tentar de novo
    );
    return;
  }

  // 1. Gate Sem Débito
  if (cpf) {
    const temDebito = await verificarDebito(cpf);
    if (!temDebito) {
      console.log(`CPF ${cpf} não possui débito. Pulando.`);
      await connection.query(
        `UPDATE fila_disparo SET status = 'concluido', sem_debito = TRUE WHERE id = ?`,
        [id]
      );
      return;
    }
  }

  // 2. Disparar Vapi
  try {
    const response = await axios.post(
      'https://api.vapi.ai/call/phone',
      {
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        assistantId: process.env.VAPI_ASSISTANT_ID,
        customer: {
          number: phoneE164,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Chamada iniciada com sucesso na Vapi. Call ID: ${response.data.id}`);
    
    // Status atualizado para concluído na fila (o webhook cuidará da classificação depois)
    await connection.query(
      `UPDATE fila_disparo SET status = 'concluido', tentativas = tentativas + 1 WHERE id = ?`,
      [id]
    );
  } catch (error: any) {
    console.error(`Falha ao disparar Vapi para ID ${id}:`, error.response?.data || error.message);
    
    // Calcula o backoff (simples, apenas adiciona o waitBetweenTries base)
    const proximaTentativa = new Date(Date.now() + WAIT_BETWEEN_TRIES_MS);

    await connection.query(
      `UPDATE fila_disparo SET status = 'falha', tentativas = tentativas + 1, proxima_tentativa_em = ? WHERE id = ?`,
      [proximaTentativa, id]
    );
  }
}

// Inicia o Worker
processarLote();
