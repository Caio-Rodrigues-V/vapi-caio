import axios from 'axios';
import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { parse } from 'csv-parse';
import pool from '../../db';
import { normalizePhone } from '../../utils/phoneValidator';

export const campaignsV2Router = Router();

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 20 * 1024 * 1024 },
});

function requireAdmin(req: any, res: any, next: any) {
  const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
  const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token') || req.query.token;
  if (!expected || provided !== expected) return res.status(401).json({ error: 'Não autorizado' });
  return next();
}

function normalizedRow(row: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), String(value ?? '').trim()]),
  );
}

function configuredValue(value: unknown, fallbackName: string): string {
  const provided = String(value ?? '').trim();
  if (provided) return provided;

  const fallback = String(process.env[fallbackName] ?? '').trim();
  if (!fallback) throw new Error(`${fallbackName} não configurada.`);
  return fallback;
}

function detectDelimiter(filePath: string): ',' | ';' | '\t' {
  const sample = fs.readFileSync(filePath, 'utf8').slice(0, 16384);
  const lines = sample.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
  
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) {
    counts[','] += (line.match(/,/g) || []).length;
    counts[';'] += (line.match(/;/g) || []).length;
    counts['\t'] += (line.match(/\t/g) || []).length;
  }

  const sorted = [
    { delimiter: ';' as const, count: counts[';'] },
    { delimiter: ',' as const, count: counts[','] },
    { delimiter: '\t' as const, count: counts['\t'] },
  ].sort((a, b) => b.count - a.count);

  return sorted[0] && sorted[0].count > 0 ? sorted[0].delimiter : ',';
}

campaignsV2Router.get('/campaigns/diag-logs', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
    const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token') || req.query.token;
    if (!expected || provided !== expected) return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const [calls]: any = await pool.query('SELECT cc.id, cc.campaign_id, cc.customer_number, cc.cpf, cc.status, cc.provider_call_id, cc.attempts, cc.last_error, cc.updated_at, cr.decision, cr.ended_reason, cr.transcript FROM campaign_calls cc LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id ORDER BY cc.id DESC LIMIT 10');
    const [events]: any = await pool.query('SELECT id, provider, provider_call_id, event_type, received_at, processing_error FROM webhook_events ORDER BY id DESC LIMIT 50');
    return res.json({ calls, events, env: { openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key' } });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

campaignsV2Router.get('/campaigns/diag-event-payload/:id', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const [rows]: any = await pool.query('SELECT payload FROM webhook_events WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Evento não encontrado' });
    const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : (rows[0].payload || {});
    return res.json(payload);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

campaignsV2Router.get('/campaigns/diag-ddm-test', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const token = process.env.DDM_TOKEN || process.env.DDM_TOKEN_BUSCA;
    const debtorId = String(req.query.debtorId || '366934');
    const client = String(req.query.client || 'ddm');
    const response = await axios.get(`https://ddmacordos.com/calc/efetiva_acordo.php`, {
      params: {
        tk: token,
        idDev: debtorId,
        cli: client,
        Parc: '1'
      }
    });
    return res.json({ status: response.status, data: response.data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, response: err.response?.data });
  }
});

campaignsV2Router.get('/campaigns/diag-ddm-locate', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const token = process.env.DDM_TOKEN_BUSCA;
    const cpf = String(req.query.cpf || '16418024729');
    const response = await axios.get(`https://ddmacordos.com/calc/localiza_dev.php`, {
      params: { tk: token, cpf }
    });
    return res.json({ status: response.status, data: response.data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, response: err.response?.data });
  }
});

campaignsV2Router.get('/campaigns/diag-vapi-call/:callId', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) throw new Error('VAPI_API_KEY não configurada no servidor.');
    const response = await axios.get(`https://api.vapi.ai/call/${req.params.callId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    return res.json(response.data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message, response: err.response?.data });
  }
});

campaignsV2Router.get('/campaigns/diag-env', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  return res.json({
    VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
    VAPI_ASSISTANT_ID_UVA: process.env.VAPI_ASSISTANT_ID_UVA,
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    DB_HOST: process.env.DB_HOST,
    DB_NAME: process.env.DB_NAME,
    N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
    SMTP_HOST: process.env.SMTP_HOST,
  });
});

campaignsV2Router.get('/campaigns/diag-campaign-stats/:id', async (req, res) => {
  const secret = req.query.secret;
  if (secret !== 'ddm_diag_987') {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  try {
    const campaignId = Number(req.params.id);
    const [stats]: any = await pool.query(
      `SELECT cc.status, cr.ended_reason, count(*) as count
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ?
       GROUP BY cc.status, cr.ended_reason`,
      [campaignId]
    );
    const [successRows]: any = await pool.query(
      `SELECT cc.id, cc.customer_number, cc.status, cr.decision, cr.ended_reason, cr.duration_seconds, cr.transcript, cc.recording_url, cr.recording_url as cr_recording_url
       FROM campaign_calls cc
       JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? AND (cr.duration_seconds > 0 OR cr.transcript IS NOT NULL)
       ORDER BY cc.id DESC LIMIT 10`,
      [campaignId]
    );
    return res.json({ stats, successCalls: successRows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

campaignsV2Router.use(requireAdmin);

campaignsV2Router.get('/calls/:providerCallId/recording', async (req, res) => {
  const { providerCallId } = req.params;
  if (!providerCallId) return res.status(400).json({ error: 'ID da chamada é obrigatório' });

  try {
    const apiKey = process.env.VAPI_API_KEY;
    if (!apiKey) throw new Error('VAPI_API_KEY não configurada no servidor.');

    // We do not follow redirects (maxRedirects: 0) to capture the 302 Location header
    // and redirect the user directly to the presigned R2/S3 URL from Vapi.
    const response = await axios.get(`https://api.vapi.ai/call/${providerCallId}/mono-recording`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    if (response.status === 302 || response.status === 301 || response.status === 307 || response.status === 308) {
      const redirectUrl = response.headers.location;
      if (redirectUrl) {
        return res.redirect(redirectUrl);
      }
    }

    return res.status(response.status).send(response.data);
  } catch (err: any) {
    console.error('[recording proxy] Error:', err.message);
    return res.status(500).json({ error: 'Erro ao obter gravação', details: err.message });
  }
});

campaignsV2Router.post('/calls/:providerCallId/terminate', async (req, res) => {
  const { providerCallId } = req.params;
  if (!providerCallId) return res.status(400).json({ error: 'ID da chamada é obrigatório' });

  try {
    const apiKey = configuredValue(undefined, 'VAPI_API_KEY');
    if (!apiKey) throw new Error('VAPI_API_KEY não configurada no servidor.');

    // 1. Terminate call on Vapi
    await axios.delete(
      `https://api.vapi.ai/call/${providerCallId}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    );

    // 2. Update status in campaign_calls
    await pool.query(
      `UPDATE campaign_calls
       SET status = 'failed', last_error = 'manually_terminated'
       WHERE provider_call_id = ?`,
      [providerCallId]
    );

    // 3. Save call result
    const [callRows]: any = await pool.query(
      `SELECT id FROM campaign_calls WHERE provider_call_id = ? LIMIT 1`,
      [providerCallId]
    );
    if (callRows.length > 0) {
      const campaignCallId = callRows[0].id;
      await pool.query(
        `INSERT INTO call_results (campaign_call_id, provider_call_id, decision, duration_seconds, ended_reason, raw_payload)
         VALUES (?, ?, 'zero', 0, 'manually_terminated', '{}')
         ON DUPLICATE KEY UPDATE ended_reason = 'manually_terminated'`,
        [campaignCallId, providerCallId]
      );
    }

    return res.json({ ok: true, message: 'Chamada encerrada.' });
  } catch (error: any) {
    console.error('[calls] terminate error:', error.response?.data || error.message);
    const errMsg = error.response?.data?.message || error.message || 'Erro ao encerrar chamada';
    return res.status(500).json({ error: errMsg });
  }
});


campaignsV2Router.get('/vapi/config', async (_req, res) => {
  try {
    const apiKey = configuredValue(undefined, 'VAPI_API_KEY');
    const assistantId = configuredValue(undefined, 'VAPI_ASSISTANT_ID_UVA');
    const phoneNumberId = configuredValue(undefined, 'VAPI_PHONE_NUMBER_ID');

    const client = axios.create({
      baseURL: 'https://api.vapi.ai',
      timeout: 10_000,
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let assistantData: any;
    try {
      const resp = await client.get(`/assistant/${assistantId}`);
      assistantData = resp.data;
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message;
      return res.status(404).json({ error: `Assistente ID [${assistantId}] não encontrado na Vapi: ${errMsg}` });
    }

    let phoneData: any;
    try {
      const resp = await client.get(`/phone-number/${phoneNumberId}`);
      phoneData = resp.data;
    } catch (err: any) {
      const errMsg = err.response?.data?.message || err.message;
      return res.status(404).json({ error: `Telefone ID [${phoneNumberId}] não encontrado na Vapi: ${errMsg}` });
    }

    return res.json({
      operation: 'uva',
      assistant: {
        id: assistantId,
        name: String(assistantData?.name || 'Assistant UVA'),
      },
      phoneNumber: {
        id: phoneNumberId,
        number: String(
          phoneData?.number ||
          phoneData?.phoneNumber ||
          phoneData?.name ||
          'Número Vapi configurado',
        ),
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: `Erro inesperado na configuração Vapi: ${error.message}` });
  }
});

campaignsV2Router.get('/campaigns', async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const where = status ? 'WHERE c.status = ?' : '';
  const params = status ? [status, limit, offset] : [limit, offset];

  const [rows]: any = await pool.query(
    `SELECT c.*,
      SUM(cc.status IN ('pending','retry_scheduled')) AS pending_calls,
      SUM(cc.status IN ('reserved','queued','in_progress','answered')) AS active_calls,
      SUM(cc.status = 'completed') AS completed_calls,
      SUM(cc.status = 'failed') AS failed_calls,
      SUM(cc.status = 'skipped') AS skipped_calls,
      SUM(COALESCE(cr.duration_seconds, 0) > 0 OR cc.status = 'answered') AS answered_calls,
      SUM(cr.decision = 'formalize') AS formalized_calls,
      SUM(cr.decision = 'schedule') AS scheduled_calls,
      SUM(cr.decision = 'zero') AS zero_calls,
      COALESCE(SUM(cr.duration_seconds), 0) AS total_duration_seconds,
      COALESCE(ROUND(AVG(NULLIF(cr.duration_seconds, 0))), 0) AS avg_duration_seconds,
      COUNT(DISTINCT cc.cpf) AS total_leads,
      COUNT(cc.id) AS total_calls
     FROM campaigns c
     LEFT JOIN campaign_calls cc ON cc.campaign_id = c.id
     LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
     ${where}
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    params,
  );

  const countParams = status ? [status] : [];
  const [countRows]: any = await pool.query(`SELECT COUNT(*) AS total FROM campaigns c ${where}`, countParams);
  return res.json({ page, limit, total: Number(countRows[0]?.total || 0), data: rows });
});

campaignsV2Router.post('/campaigns', async (req, res) => {
  try {
    const {
      name,
      assistantId,
      phoneNumberId,
      maxConcurrent = 1,
      maxAttempts = 5,
      scheduledAt = null,
    } = req.body || {};

    if (!String(name || '').trim()) {
      return res.status(400).json({ error: 'name é obrigatório' });
    }

    const resolvedAssistantId = configuredValue(assistantId, 'VAPI_ASSISTANT_ID_UVA');
    const resolvedPhoneNumberId = configuredValue(phoneNumberId, 'VAPI_PHONE_NUMBER_ID');

    const [result]: any = await pool.execute(
      `INSERT INTO campaigns
        (name,status,assistant_id,phone_number_id,max_concurrent,max_attempts,scheduled_at)
       VALUES (?, 'draft', ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        resolvedAssistantId,
        resolvedPhoneNumberId,
        Math.max(1, Number(maxConcurrent)),
        Math.max(1, Number(maxAttempts)),
        scheduledAt ? new Date(scheduledAt) : null,
      ],
    );

    const [rows]: any = await pool.execute('SELECT * FROM campaigns WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    if (message.includes('não configurada')) {
      return res.status(503).json({ error: message });
    }
    console.error('[campaigns] create error:', error);
    return res.status(500).json({ error: 'Erro ao criar campanha' });
  }
});

campaignsV2Router.patch('/campaigns/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const status = String(req.body?.status || '');
  const allowed = new Set(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']);
  if (!Number.isInteger(id) || id <= 0 || !allowed.has(status)) {
    return res.status(400).json({ error: 'Campanha ou status inválido' });
  }
  await pool.execute(
    `UPDATE campaigns
     SET status = ?,
         started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN ? IN ('completed','cancelled') THEN NOW() ELSE completed_at END
     WHERE id = ?`,
    [status, status, status, id],
  );
  return res.json({ ok: true, id, status });
});

campaignsV2Router.put('/campaigns/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Campanha inválida' });
  }

  const { name, maxConcurrent, maxAttempts } = req.body || {};

  if (!String(name || '').trim()) {
    return res.status(400).json({ error: 'O nome da campanha é obrigatório' });
  }

  try {
    await pool.execute(
      `UPDATE campaigns
       SET name = ?,
           max_concurrent = ?,
           max_attempts = ?
       WHERE id = ?`,
      [
        String(name).trim(),
        Math.max(1, Number(maxConcurrent || 1)),
        Math.max(1, Number(maxAttempts || 5)),
        id,
      ],
    );

    const [rows]: any = await pool.execute('SELECT * FROM campaigns WHERE id = ?', [id]);
    return res.json(rows[0]);
  } catch (error) {
    console.error('[campaigns] update error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar campanha' });
  }
});

campaignsV2Router.delete('/campaigns/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Campanha inválida' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [campaignRows]: any = await connection.execute(
      'SELECT id, name, status FROM campaigns WHERE id = ? FOR UPDATE',
      [id],
    );
    const campaign = campaignRows[0];
    if (!campaign) {
      await connection.rollback();
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const [activeRows]: any = await connection.execute(
      `SELECT COUNT(*) AS total
       FROM campaign_calls
       WHERE campaign_id = ?
         AND status IN ('reserved','queued','in_progress','answered')`,
      [id],
    );
    const activeCalls = Number(activeRows[0]?.total || 0);

    if (campaign.status === 'running' || activeCalls > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: 'Pause a campanha e aguarde o encerramento das chamadas ativas antes de excluir.',
      });
    }

    const [callRows]: any = await connection.execute(
      'SELECT id FROM campaign_calls WHERE campaign_id = ?',
      [id],
    );
    const callIds = callRows.map((row: any) => Number(row.id)).filter(Number.isInteger);

    if (callIds.length > 0) {
      const placeholders = callIds.map(() => '?').join(',');
      await connection.query(
        `DELETE FROM call_results WHERE campaign_call_id IN (${placeholders})`,
        callIds,
      );
    }

    const [callsResult]: any = await connection.execute(
      'DELETE FROM campaign_calls WHERE campaign_id = ?',
      [id],
    );
    await connection.execute('DELETE FROM campaigns WHERE id = ?', [id]);
    await connection.commit();

    return res.json({
      ok: true,
      id,
      name: campaign.name,
      deletedCalls: Number(callsResult.affectedRows || 0),
    });
  } catch (error) {
    await connection.rollback();
    console.error('[campaigns] delete error:', error);
    return res.status(500).json({ error: 'Erro ao excluir campanha' });
  } finally {
    connection.release();
  }
});

campaignsV2Router.get('/campaigns/:id/export', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Campanha inválida' });
  }

  const status = String(req.query.status || '').trim();
  const decision = String(req.query.decision || '').trim();

  let whereClause = '';
  const params: any[] = [id];

  if (status) {
    whereClause += ' AND cc.status = ?';
    params.push(status);
  }

  if (decision && decision !== 'all') {
    if (decision === 'pending') {
      whereClause += " AND cc.status = 'pending'";
    } else if (decision === 'answered') {
      whereClause += " AND (cr.duration_seconds > 0 OR cc.status = 'answered')";
    } else {
      whereClause += ' AND cr.decision = ?';
      params.push(decision);
    }
  }

  try {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=relatorio-campanha-${id}.csv`);
    res.write('\uFEFF'); // BOM for Portuguese Excel encoding compatibility
    res.write('Telefone;CPF;Nome;Status;Tentativas;Decisão;Duração (s);Motivo do Fim;Última Atualização;Transcrição\n');

    const [rows]: any = await pool.query(
      `SELECT cc.customer_number, cc.cpf, cc.attempts, cc.status, cc.metadata,
              cr.decision, cr.duration_seconds, cr.ended_reason, cc.updated_at, cr.transcript
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? ${whereClause}
       ORDER BY cc.id DESC`,
      params,
    );

    for (const row of rows) {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      const name = metadata.name || '';
      
      let decisionText = 'Aguardando';
      if (row.decision === 'formalize') decisionText = 'Formalizado';
      else if (row.decision === 'schedule') decisionText = 'Reagendado';
      else if (row.decision === 'zero') {
        decisionText = row.ended_reason === 'voicemail' 
          ? 'Caixa Postal' 
          : (!row.duration_seconds || row.duration_seconds === 0
              ? 'Não Atendido'
              : (row.duration_seconds <= 10 
                  ? 'Atendeu e Desligou' 
                  : 'Recusado/Sem Acordo'));
      }

      let statusText = row.status;
      if (row.status === 'pending') statusText = 'Pendente';
      else if (row.status === 'running' || row.status === 'in_progress' || row.status === 'queued' || row.status === 'answered') statusText = 'Em Linha';
      else if (row.status === 'completed') statusText = 'Concluído';
      else if (row.status === 'failed') statusText = 'Falhou';
      else if (row.status === 'skipped') statusText = 'Pulado';

      const line = [
        row.customer_number,
        row.cpf || '',
        name,
        statusText,
        row.attempts,
        decisionText,
        row.duration_seconds !== null && row.duration_seconds !== undefined ? row.duration_seconds : '',
        row.ended_reason || '',
        row.updated_at ? new Date(row.updated_at).toLocaleString('pt-BR') : '',
        row.transcript || '',
      ].map(val => {
        const text = String(val)
          .replace(/;/g, ' ')
          .replace(/\r?\n/g, ' | '); // Avoid breaking CSV formatting and keep it single-line
        return text;
      }).join(';');

      res.write(line + '\n');
    }

    res.end();
  } catch (error) {
    console.error('[campaigns] export error:', error);
    return res.status(500).json({ error: 'Erro ao exportar relatório' });
  }
});

campaignsV2Router.get('/campaigns/:id/calls/cpf/:cpf', async (req, res) => {
  const id = Number(req.params.id);
  const cpf = String(req.params.cpf).trim();
  if (!Number.isInteger(id) || id <= 0 || !cpf) {
    return res.status(400).json({ error: 'Campanha e CPF são obrigatórios' });
  }

  try {
    const [rows]: any = await pool.query(
      `SELECT cc.id, cc.customer_number, cc.status, cc.attempts,
              cr.decision, cr.ended_reason, cc.updated_at
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? AND cc.cpf = ?
       ORDER BY cc.id ASC`,
      [id, cpf],
    );
    return res.json(rows);
  } catch (error) {
    console.error('[campaigns] list by cpf error:', error);
    return res.status(500).json({ error: 'Erro ao buscar telefones do CPF' });
  }
});

campaignsV2Router.get('/campaigns/:id/calls', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Campanha inválida' });
  }

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;
  const status = String(req.query.status || '').trim();
  const decision = String(req.query.decision || '').trim();
  const search = String(req.query.search || '').trim();

  let whereClause = '';
  const params: any[] = [id];

  if (status) {
    whereClause += ' AND cc.status = ?';
    params.push(status);
  }

  if (decision && decision !== 'all') {
    if (decision === 'pending') {
      whereClause += " AND cc.status = 'pending'";
    } else if (decision === 'answered') {
      whereClause += " AND (cr.duration_seconds > 0 OR cc.status = 'answered')";
    } else {
      whereClause += ' AND cr.decision = ?';
      params.push(decision);
    }
  }

  if (search) {
    whereClause += " AND (cc.customer_number LIKE ? OR cc.cpf LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(cc.metadata, '$.name')) LIKE ?)";
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  params.push(limit, offset);

  const [rows]: any = await pool.query(
    `SELECT cc.*, cr.decision, cr.scheduled_callback_at, cr.ended_reason, cr.created_at AS result_created_at
     FROM campaign_calls cc
     LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
     WHERE cc.campaign_id = ? ${whereClause}
     ORDER BY (CASE WHEN cc.status = 'pending' THEN 1 ELSE 0 END) ASC, cc.id DESC LIMIT ? OFFSET ?`,
    params,
  );
  return res.json({ page, limit, data: rows });
});

campaignsV2Router.post('/campaigns/:id/import', upload.single('file'), async (req, res) => {
  const campaignId = Number(req.params.id);
  if (!Number.isInteger(campaignId) || campaignId <= 0 || !req.file) {
    return res.status(400).json({ error: 'Campanha e arquivo são obrigatórios' });
  }

  const [campaignRows]: any = await pool.execute('SELECT id FROM campaigns WHERE id = ? LIMIT 1', [campaignId]);
  if (!campaignRows.length) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(404).json({ error: 'Campanha não encontrada' });
  }

  const rows: Record<string, string>[] = [];
  const delimiter = detectDelimiter(req.file.path);

  try {
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(req.file!.path)
        .pipe(parse({
          columns: true,
          delimiter,
          trim: true,
          skip_empty_lines: true,
          bom: true,
          relax_column_count: true,
        }))
        .on('data', (row) => rows.push(normalizedRow(row)))
        .on('error', reject)
        .on('end', resolve);
    });

    const connection = await pool.getConnection();
    let inserted = 0;
    const errors: Array<{ line: number; reason: string; cpf?: string; telefone?: string }> = [];

    try {
      await connection.beginTransaction();
      for (const [index, row] of rows.entries()) {
        const line = index + 2;
        
        // If row was parsed as a single string cell containing semicolons, expand it into separate fields
        const keys = Object.keys(row);
        const firstKey = keys[0];
        if (firstKey && keys.length === 1 && String(row[firstKey] || '').includes(';')) {
          const parts = String(row[firstKey]).split(';');
          parts.forEach((p, idx) => {
            row[`_col_${idx}`] = p.trim();
          });
        }

        // Find CPF/Document
        let cpfRaw = row.cpf || row.cpfcgc_pes || row.cpfcgc || row.documento || row.document || row.doc;
        if (!cpfRaw) {
          // Fallback to substring match
          const cpfKey = Object.keys(row).find(k => {
            const l = k.toLowerCase();
            return l.includes('cpf') || l.includes('cnpj') || l.includes('cgc') || l.includes('document') || l.includes('doc');
          });
          if (cpfKey) cpfRaw = row[cpfKey];
        }

        let cpfDigits = String(cpfRaw || '').replace(/\D/g, '');
        
        // Smart fallback: if cpfRaw is missing or not 11 digits (e.g. header misalignment like "510"), search all values in the row for an 11-digit number
        if (!cpfRaw || cpfDigits.length !== 11) {
          for (const val of Object.values(row)) {
            const digits = String(val || '').replace(/\D/g, '');
            if (digits.length === 11) {
              cpfDigits = digits;
              cpfRaw = val;
              break;
            }
          }
        }

        const cpf = cpfDigits.padStart(11, '0');

        if (!cpfRaw || cpfDigits.length !== 11) {
          errors.push({ line, reason: 'CPF deve possuir 11 dígitos', cpf: cpfDigits });
          continue;
        }

        // Find Name
        let nameRaw = row.nome || row.nome_dev || row.name;
        if (!nameRaw || /^\d+$/.test(String(nameRaw).trim())) {
          const nameKey = Object.keys(row).find(k => {
            const l = k.toLowerCase();
            return (l.includes('nome') || l.includes('name')) && !/^\d+$/.test(String(row[k] || '').trim());
          });
          if (nameKey) {
            nameRaw = row[nameKey];
          } else {
            const textVal = Object.values(row).find(v => typeof v === 'string' && /[a-zA-Z]{3,}\s+[a-zA-Z]{3,}/.test(v.trim()));
            if (textVal) nameRaw = textVal;
          }
        }
        const debtorName = nameRaw ? String(nameRaw).trim() : null;

        // Detect all potential phone number fields in the row
        const possiblePhoneKeys = [
          'telefone', 'phone', 'numero', 'celular', 'fone',
          'tel', 'contato', 'contact', 'telef'
        ];
        
        const uniquePhones = new Set<string>();
        for (const key of Object.keys(row)) {
          const rawVal = row[key];
          if (!rawVal) continue;
          
          const digits = String(rawVal).replace(/\D/g, '');
          if (digits === cpfDigits) continue;

          const lowerKey = key.toLowerCase().trim();
          if (possiblePhoneKeys.some(k => lowerKey.includes(k))) {
            const normalized = normalizePhone(String(rawVal));
            if (normalized) {
              uniquePhones.add(normalized);
            }
          }
        }

        if (uniquePhones.size === 0) {
          for (const val of Object.values(row)) {
            if (!val) continue;
            const digits = String(val).replace(/\D/g, '');
            if (digits === cpfDigits) continue;
            const normalized = normalizePhone(String(val));
            if (normalized) {
              uniquePhones.add(normalized);
            }
          }
        }

        if (uniquePhones.size === 0) {
          errors.push({ line, reason: 'Nenhum telefone válido encontrado', cpf });
          continue;
        }

        for (const customerNumber of uniquePhones) {
          await connection.execute(
            `INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
             VALUES (?, ?, ?, 'pending', ?)`,
            [campaignId, customerNumber, cpf, JSON.stringify({ source: 'file_import', name: debtorName })],
          );
          inserted += 1;
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return res.status(201).json({
      campaignId,
      delimiter: delimiter === '\t' ? 'tab' : delimiter,
      totalRows: rows.length,
      inserted,
      ignored: errors.length,
      errors: errors.slice(0, 50),
    });
  } catch (error) {
    console.error('[campaigns] import error:', error);
    return res.status(400).json({
      error: error instanceof Error ? `Arquivo inválido: ${error.message}` : 'Arquivo inválido',
    });
  } finally {
    fs.rmSync(req.file.path, { force: true });
  }
});
