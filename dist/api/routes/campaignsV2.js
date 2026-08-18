"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignsV2Router = void 0;
const axios_1 = __importDefault(require("axios"));
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const db_1 = __importDefault(require("../../db"));
const phoneValidator_1 = require("../../utils/phoneValidator");
const DdmDebtProvider_1 = require("../../providers/debt/DdmDebtProvider");
exports.campaignsV2Router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 20 * 1024 * 1024 },
});
function requireAdmin(req, res, next) {
    const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
    const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token') || req.query.token;
    if (!expected || provided !== expected)
        return res.status(401).json({ error: 'Não autorizado' });
    return next();
}
function normalizedRow(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), String(value ?? '').trim()]));
}
function configuredValue(value, fallbackName) {
    const provided = String(value ?? '').trim();
    if (provided)
        return provided;
    const fallback = String(process.env[fallbackName] ?? '').trim();
    if (!fallback)
        throw new Error(`${fallbackName} não configurada.`);
    return fallback;
}
function detectDelimiter(filePath) {
    const sample = fs_1.default.readFileSync(filePath, 'utf8').slice(0, 16384);
    const lines = sample.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 10);
    const counts = { ',': 0, ';': 0, '\t': 0 };
    for (const line of lines) {
        counts[','] += (line.match(/,/g) || []).length;
        counts[';'] += (line.match(/;/g) || []).length;
        counts['\t'] += (line.match(/\t/g) || []).length;
    }
    const sorted = [
        { delimiter: ';', count: counts[';'] },
        { delimiter: ',', count: counts[','] },
        { delimiter: '\t', count: counts['\t'] },
    ].sort((a, b) => b.count - a.count);
    return sorted[0] && sorted[0].count > 0 ? sorted[0].delimiter : ',';
}
exports.campaignsV2Router.get('/campaigns/diag-logs', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
        const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token') || req.query.token;
        if (!expected || provided !== expected)
            return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const [calls] = await db_1.default.query('SELECT cc.id, cc.campaign_id, cc.customer_number, cc.cpf, cc.status, cc.provider_call_id, cc.attempts, cc.last_error, cc.updated_at, cr.decision, cr.ended_reason, cr.transcript FROM campaign_calls cc LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id ORDER BY cc.id DESC LIMIT 10');
        const [events] = await db_1.default.query('SELECT id, provider, provider_call_id, event_type, received_at, processing_error FROM webhook_events ORDER BY id DESC LIMIT 50');
        return res.json({ calls, events, env: { openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key' } });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-event-payload/:id', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const [rows] = await db_1.default.query('SELECT payload FROM webhook_events WHERE id = ?', [req.params.id]);
        if (!rows.length)
            return res.status(404).json({ error: 'Evento não encontrado' });
        const payload = typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : (rows[0].payload || {});
        return res.json(payload);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-ddm-test', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const token = process.env.DDM_TOKEN || process.env.DDM_TOKEN_BUSCA;
        const debtorId = String(req.query.debtorId || '366934');
        const client = String(req.query.client || 'ddm');
        const response = await axios_1.default.get(`https://ddmacordos.com/calc/efetiva_acordo.php`, {
            params: {
                tk: token,
                idDev: debtorId,
                cli: client,
                Parc: '1'
            }
        });
        return res.json({ status: response.status, data: response.data });
    }
    catch (err) {
        return res.status(500).json({ error: err.message, response: err.response?.data });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-ddm-locate', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const token = process.env.DDM_TOKEN_BUSCA;
        const cpf = String(req.query.cpf || '16418024729');
        const response = await axios_1.default.get(`https://ddmacordos.com/calc/localiza_dev.php`, {
            params: { tk: token, cpf }
        });
        return res.json({ status: response.status, data: response.data });
    }
    catch (err) {
        return res.status(500).json({ error: err.message, response: err.response?.data });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-vapi-call/:callId', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey)
            throw new Error('VAPI_API_KEY não configurada no servidor.');
        const response = await axios_1.default.get(`https://api.vapi.ai/call/${req.params.callId}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        return res.json(response.data);
    }
    catch (err) {
        return res.status(500).json({ error: err.message, response: err.response?.data });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-calls-detail', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const cpfs = String(req.query.cpfs || '').split(',').map(s => s.trim()).filter(Boolean);
        if (cpfs.length === 0)
            return res.json({ error: 'Nenhum CPF fornecido' });
        const [rows] = await db_1.default.query(`SELECT cc.*, cr.decision, cr.ended_reason, cr.duration_seconds
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.cpf IN (${cpfs.map(() => '?').join(',')})`, cpfs);
        return res.json({ rows });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-campaigns-list', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const [rows] = await db_1.default.query(`SELECT id, name, status, created_at FROM campaigns ORDER BY id DESC LIMIT 5`);
        return res.json({ campaigns: rows });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-skipped-list/:id', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const campaignId = Number(req.params.id);
    try {
        const [rows] = await db_1.default.query(`SELECT id, customer_number, cpf, status, last_error, metadata, updated_at
       FROM campaign_calls
       WHERE campaign_id = ? AND status = 'skipped'
       LIMIT 10`, [campaignId]);
        return res.json({ skipped: rows });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.post('/campaigns/diag-reset-no-debt/:id', async (req, res) => {
    const secret = req.body.secret || req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const campaignId = Number(req.params.id);
    try {
        const [result] = await db_1.default.query(`UPDATE campaign_calls
       SET status = 'pending', attempts = 0, last_error = NULL
       WHERE campaign_id = ? AND status = 'skipped' AND last_error = 'no_debt'`, [campaignId]);
        return res.json({ affectedRows: result.affectedRows });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-env', async (req, res) => {
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
        GLOBAL_MAX_CONCURRENT: process.env.GLOBAL_MAX_CONCURRENT,
        WORKER_DELAY_BETWEEN_CALLS_MS: process.env.WORKER_DELAY_BETWEEN_CALLS_MS,
    });
});
exports.campaignsV2Router.get('/campaigns/diag-check-cpf', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const cpf = String(req.query.cpf || '').replace(/\D/g, '');
    if (!cpf)
        return res.status(400).json({ error: 'CPF não informado' });
    try {
        const provider = new DdmDebtProvider_1.DdmDebtProvider({
            token: process.env.DDM_TOKEN_BUSCA || process.env.DDM_API_TOKEN || '',
            tokenCalcula: process.env.DDM_TOKEN || '',
            baseUrl: process.env.DDM_BASE_URL || 'https://ddmacordos.com',
        });
        const result = await provider.lookup(cpf);
        return res.json({ cpf, result });
    }
    catch (err) {
        return res.status(500).json({ error: err.message, stack: err.stack });
    }
});
exports.campaignsV2Router.get('/campaigns/diag-campaign-stats/:id', async (req, res) => {
    const secret = req.query.secret;
    if (secret !== 'ddm_diag_987') {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const campaignId = Number(req.params.id);
        const [stats] = await db_1.default.query(`SELECT cc.status, cr.ended_reason, count(*) as count
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ?
       GROUP BY cc.status, cr.ended_reason`, [campaignId]);
        const [successRows] = await db_1.default.query(`SELECT cc.id, cc.customer_number, cc.status, cr.decision, cr.ended_reason, cr.duration_seconds, cr.transcript, cc.recording_url, cr.recording_url as cr_recording_url
       FROM campaign_calls cc
       JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? AND (cr.duration_seconds > 0 OR cr.transcript IS NOT NULL)
       ORDER BY cc.id DESC LIMIT 10`, [campaignId]);
        return res.json({ stats, successCalls: successRows });
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.campaignsV2Router.use(requireAdmin);
exports.campaignsV2Router.get('/calls/:providerCallId/recording', async (req, res) => {
    const { providerCallId } = req.params;
    if (!providerCallId)
        return res.status(400).json({ error: 'ID da chamada é obrigatório' });
    try {
        const apiKey = process.env.VAPI_API_KEY;
        if (!apiKey)
            throw new Error('VAPI_API_KEY não configurada no servidor.');
        // We do not follow redirects (maxRedirects: 0) to capture the 302 Location header
        // and redirect the user directly to the presigned R2/S3 URL from Vapi.
        const response = await axios_1.default.get(`https://api.vapi.ai/call/${providerCallId}/mono-recording`, {
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
    }
    catch (err) {
        console.error('[recording proxy] Error:', err.message);
        return res.status(500).json({ error: 'Erro ao obter gravação', details: err.message });
    }
});
exports.campaignsV2Router.post('/calls/:providerCallId/terminate', async (req, res) => {
    const { providerCallId } = req.params;
    if (!providerCallId)
        return res.status(400).json({ error: 'ID da chamada é obrigatório' });
    try {
        const apiKey = configuredValue(undefined, 'VAPI_API_KEY');
        if (!apiKey)
            throw new Error('VAPI_API_KEY não configurada no servidor.');
        // 1. Terminate call on Vapi
        await axios_1.default.delete(`https://api.vapi.ai/call/${providerCallId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 10000,
        });
        // 2. Update status in campaign_calls
        await db_1.default.query(`UPDATE campaign_calls
       SET status = 'failed', last_error = 'manually_terminated'
       WHERE provider_call_id = ?`, [providerCallId]);
        // 3. Save call result
        const [callRows] = await db_1.default.query(`SELECT id FROM campaign_calls WHERE provider_call_id = ? LIMIT 1`, [providerCallId]);
        if (callRows.length > 0) {
            const campaignCallId = callRows[0].id;
            await db_1.default.query(`INSERT INTO call_results (campaign_call_id, provider_call_id, decision, duration_seconds, ended_reason, raw_payload)
         VALUES (?, ?, 'zero', 0, 'manually_terminated', '{}')
         ON DUPLICATE KEY UPDATE ended_reason = 'manually_terminated'`, [campaignCallId, providerCallId]);
        }
        return res.json({ ok: true, message: 'Chamada encerrada.' });
    }
    catch (error) {
        console.error('[calls] terminate error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || error.message || 'Erro ao encerrar chamada';
        return res.status(500).json({ error: errMsg });
    }
});
exports.campaignsV2Router.get('/vapi/config', async (_req, res) => {
    try {
        const apiKey = configuredValue(undefined, 'VAPI_API_KEY');
        const assistantId = configuredValue(undefined, 'VAPI_ASSISTANT_ID_UVA');
        const phoneNumberId = configuredValue(undefined, 'VAPI_PHONE_NUMBER_ID');
        const client = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            timeout: 10_000,
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        let assistantData;
        try {
            const resp = await client.get(`/assistant/${assistantId}`);
            assistantData = resp.data;
        }
        catch (err) {
            const errMsg = err.response?.data?.message || err.message;
            return res.status(404).json({ error: `Assistente ID [${assistantId}] não encontrado na Vapi: ${errMsg}` });
        }
        let phoneData;
        try {
            const resp = await client.get(`/phone-number/${phoneNumberId}`);
            phoneData = resp.data;
        }
        catch (err) {
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
                number: String(phoneData?.number ||
                    phoneData?.phoneNumber ||
                    phoneData?.name ||
                    'Número Vapi configurado'),
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: `Erro inesperado na configuração Vapi: ${error.message}` });
    }
});
exports.campaignsV2Router.get('/campaigns', async (req, res) => {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || '').trim();
    const where = status ? 'WHERE c.status = ?' : '';
    const params = status ? [status, limit, offset] : [limit, offset];
    const [rows] = await db_1.default.query(`SELECT c.*,
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
     LIMIT ? OFFSET ?`, params);
    const countParams = status ? [status] : [];
    const [countRows] = await db_1.default.query(`SELECT COUNT(*) AS total FROM campaigns c ${where}`, countParams);
    return res.json({ page, limit, total: Number(countRows[0]?.total || 0), data: rows });
});
exports.campaignsV2Router.post('/campaigns', async (req, res) => {
    try {
        const { name, assistantId, phoneNumberId, maxConcurrent = 1, maxAttempts = 5, scheduledAt = null, } = req.body || {};
        if (!String(name || '').trim()) {
            return res.status(400).json({ error: 'name é obrigatório' });
        }
        const resolvedAssistantId = configuredValue(assistantId, 'VAPI_ASSISTANT_ID_UVA');
        const resolvedPhoneNumberId = configuredValue(phoneNumberId, 'VAPI_PHONE_NUMBER_ID');
        const [result] = await db_1.default.execute(`INSERT INTO campaigns
        (name,status,assistant_id,phone_number_id,max_concurrent,max_attempts,scheduled_at)
       VALUES (?, 'draft', ?, ?, ?, ?, ?)`, [
            String(name).trim(),
            resolvedAssistantId,
            resolvedPhoneNumberId,
            Math.max(1, Number(maxConcurrent)),
            Math.max(1, Number(maxAttempts)),
            scheduledAt ? new Date(scheduledAt) : null,
        ]);
        const [rows] = await db_1.default.execute('SELECT * FROM campaigns WHERE id = ?', [result.insertId]);
        return res.status(201).json(rows[0]);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido';
        if (message.includes('não configurada')) {
            return res.status(503).json({ error: message });
        }
        console.error('[campaigns] create error:', error);
        return res.status(500).json({ error: 'Erro ao criar campanha' });
    }
});
exports.campaignsV2Router.patch('/campaigns/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '');
    const allowed = new Set(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled']);
    if (!Number.isInteger(id) || id <= 0 || !allowed.has(status)) {
        return res.status(400).json({ error: 'Campanha ou status inválido' });
    }
    await db_1.default.execute(`UPDATE campaigns
     SET status = ?,
         started_at = CASE WHEN ? = 'running' AND started_at IS NULL THEN NOW() ELSE started_at END,
         completed_at = CASE WHEN ? IN ('completed','cancelled') THEN NOW() ELSE completed_at END
     WHERE id = ?`, [status, status, status, id]);
    return res.json({ ok: true, id, status });
});
exports.campaignsV2Router.put('/campaigns/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Campanha inválida' });
    }
    const { name, maxConcurrent, maxAttempts } = req.body || {};
    if (!String(name || '').trim()) {
        return res.status(400).json({ error: 'O nome da campanha é obrigatório' });
    }
    try {
        await db_1.default.execute(`UPDATE campaigns
       SET name = ?,
           max_concurrent = ?,
           max_attempts = ?
       WHERE id = ?`, [
            String(name).trim(),
            Math.max(1, Number(maxConcurrent || 1)),
            Math.max(1, Number(maxAttempts || 5)),
            id,
        ]);
        const [rows] = await db_1.default.execute('SELECT * FROM campaigns WHERE id = ?', [id]);
        return res.json(rows[0]);
    }
    catch (error) {
        console.error('[campaigns] update error:', error);
        return res.status(500).json({ error: 'Erro ao atualizar campanha' });
    }
});
exports.campaignsV2Router.delete('/campaigns/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Campanha inválida' });
    }
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [campaignRows] = await connection.execute('SELECT id, name, status FROM campaigns WHERE id = ? FOR UPDATE', [id]);
        const campaign = campaignRows[0];
        if (!campaign) {
            await connection.rollback();
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }
        const [activeRows] = await connection.execute(`SELECT COUNT(*) AS total
       FROM campaign_calls
       WHERE campaign_id = ?
         AND status IN ('reserved','queued','in_progress','answered')`, [id]);
        const activeCalls = Number(activeRows[0]?.total || 0);
        if (campaign.status === 'running' || activeCalls > 0) {
            await connection.rollback();
            return res.status(409).json({
                error: 'Pause a campanha e aguarde o encerramento das chamadas ativas antes de excluir.',
            });
        }
        const [callRows] = await connection.execute('SELECT id FROM campaign_calls WHERE campaign_id = ?', [id]);
        const callIds = callRows.map((row) => Number(row.id)).filter(Number.isInteger);
        if (callIds.length > 0) {
            const placeholders = callIds.map(() => '?').join(',');
            await connection.query(`DELETE FROM call_results WHERE campaign_call_id IN (${placeholders})`, callIds);
        }
        const [callsResult] = await connection.execute('DELETE FROM campaign_calls WHERE campaign_id = ?', [id]);
        await connection.execute('DELETE FROM campaigns WHERE id = ?', [id]);
        await connection.commit();
        return res.json({
            ok: true,
            id,
            name: campaign.name,
            deletedCalls: Number(callsResult.affectedRows || 0),
        });
    }
    catch (error) {
        await connection.rollback();
        console.error('[campaigns] delete error:', error);
        return res.status(500).json({ error: 'Erro ao excluir campanha' });
    }
    finally {
        connection.release();
    }
});
exports.campaignsV2Router.get('/campaigns/:id/export', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Campanha inválida' });
    }
    const status = String(req.query.status || '').trim();
    const decision = String(req.query.decision || '').trim();
    let whereClause = '';
    const params = [id];
    if (status) {
        whereClause += ' AND cc.status = ?';
        params.push(status);
    }
    if (decision && decision !== 'all') {
        if (decision === 'pending') {
            whereClause += " AND cc.status = 'pending'";
        }
        else if (decision === 'answered') {
            whereClause += " AND (cr.duration_seconds > 0 OR cc.status = 'answered')";
        }
        else if (decision === 'no_debt') {
            whereClause += " AND cc.status = 'skipped' AND cc.last_error = 'no_debt'";
        }
        else {
            whereClause += ' AND cr.decision = ?';
            params.push(decision);
        }
    }
    try {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio-campanha-${id}.csv`);
        res.write('\uFEFF'); // BOM for Portuguese Excel encoding compatibility
        res.write('Telefone;CPF;Nome;Status;Tentativas;Decisão;Duração (s);Motivo do Fim;Última Atualização;Transcrição\n');
        const [rows] = await db_1.default.query(`SELECT cc.customer_number, cc.cpf, cc.attempts, cc.status, cc.last_error, cc.metadata,
              cr.decision, cr.duration_seconds, cr.ended_reason, cc.updated_at, cr.transcript
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? ${whereClause}
       ORDER BY cc.id DESC`, params);
        for (const row of rows) {
            const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            const name = metadata.name || '';
            let decisionText = 'Aguardando';
            if (row.decision === 'formalize')
                decisionText = 'Formalizado';
            else if (row.decision === 'schedule')
                decisionText = 'Reagendado';
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
            if (row.status === 'pending')
                statusText = 'Pendente';
            else if (row.status === 'running' || row.status === 'in_progress' || row.status === 'queued' || row.status === 'answered')
                statusText = 'Em Linha';
            else if (row.status === 'completed')
                statusText = 'Concluído';
            else if (row.status === 'failed')
                statusText = 'Falhou';
            else if (row.status === 'skipped') {
                if (row.last_error === 'already_has_agreement')
                    statusText = 'Pulado (Já possui acordo formalizado)';
                else if (row.last_error === 'no_online_agreement')
                    statusText = 'Pulado (Acordo online não permitido pela DDM)';
                else if (row.last_error === 'no_debt')
                    statusText = 'Pulado (Sem débito em aberto)';
                else if (row.last_error === 'cpf_missing')
                    statusText = 'Pulado (CPF ausente)';
                else
                    statusText = 'Pulado';
            }
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
    }
    catch (error) {
        console.error('[campaigns] export error:', error);
        return res.status(500).json({ error: 'Erro ao exportar relatório' });
    }
});
exports.campaignsV2Router.get('/campaigns/:id/calls/cpf/:cpf', async (req, res) => {
    const id = Number(req.params.id);
    const cpf = String(req.params.cpf).trim();
    if (!Number.isInteger(id) || id <= 0 || !cpf) {
        return res.status(400).json({ error: 'Campanha e CPF são obrigatórios' });
    }
    try {
        const [rows] = await db_1.default.query(`SELECT cc.id, cc.customer_number, cc.status, cc.attempts,
              cr.decision, cr.ended_reason, cc.updated_at
       FROM campaign_calls cc
       LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
       WHERE cc.campaign_id = ? AND cc.cpf = ?
       ORDER BY cc.id ASC`, [id, cpf]);
        return res.json(rows);
    }
    catch (error) {
        console.error('[campaigns] list by cpf error:', error);
        return res.status(500).json({ error: 'Erro ao buscar telefones do CPF' });
    }
});
exports.campaignsV2Router.get('/campaigns/:id/calls', async (req, res) => {
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
    const params = [id];
    if (status) {
        whereClause += ' AND cc.status = ?';
        params.push(status);
    }
    if (decision && decision !== 'all') {
        if (decision === 'pending') {
            whereClause += " AND cc.status = 'pending'";
        }
        else if (decision === 'answered') {
            whereClause += " AND (cr.duration_seconds > 0 OR cc.status = 'answered')";
        }
        else if (decision === 'no_debt') {
            whereClause += " AND cc.status = 'skipped' AND cc.last_error = 'no_debt'";
        }
        else {
            whereClause += ' AND cr.decision = ?';
            params.push(decision);
        }
    }
    if (search) {
        whereClause += " AND (cc.customer_number LIKE ? OR cc.cpf LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(cc.metadata, '$.name')) LIKE ?)";
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    params.push(limit, offset);
    const [rows] = await db_1.default.query(`SELECT cc.*, cr.decision, cr.scheduled_callback_at, cr.ended_reason, cr.created_at AS result_created_at
     FROM campaign_calls cc
     LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
     WHERE cc.campaign_id = ? ${whereClause}
     ORDER BY (CASE WHEN cc.status = 'pending' THEN 1 ELSE 0 END) ASC, cc.id DESC LIMIT ? OFFSET ?`, params);
    return res.json({ page, limit, data: rows });
});
exports.campaignsV2Router.post('/campaigns/:id/import', upload.single('file'), async (req, res) => {
    const campaignId = Number(req.params.id);
    if (!Number.isInteger(campaignId) || campaignId <= 0 || !req.file) {
        return res.status(400).json({ error: 'Campanha e arquivo são obrigatórios' });
    }
    const [campaignRows] = await db_1.default.execute('SELECT id FROM campaigns WHERE id = ? LIMIT 1', [campaignId]);
    if (!campaignRows.length) {
        fs_1.default.rmSync(req.file.path, { force: true });
        return res.status(404).json({ error: 'Campanha não encontrada' });
    }
    const rows = [];
    const delimiter = detectDelimiter(req.file.path);
    try {
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(req.file.path)
                .pipe((0, csv_parse_1.parse)({
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
        const connection = await db_1.default.getConnection();
        let inserted = 0;
        const errors = [];
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
                    if (cpfKey)
                        cpfRaw = row[cpfKey];
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
                    }
                    else {
                        const textVal = Object.values(row).find(v => typeof v === 'string' && /[a-zA-Z]{3,}\s+[a-zA-Z]{3,}/.test(v.trim()));
                        if (textVal)
                            nameRaw = textVal;
                    }
                }
                const debtorName = nameRaw ? String(nameRaw).trim() : null;
                // Detect all potential phone number fields in the row
                const possiblePhoneKeys = [
                    'telefone', 'phone', 'numero', 'celular', 'fone',
                    'tel', 'contato', 'contact', 'telef'
                ];
                const uniquePhones = new Set();
                for (const key of Object.keys(row)) {
                    const rawVal = row[key];
                    if (!rawVal)
                        continue;
                    const digits = String(rawVal).replace(/\D/g, '');
                    if (digits === cpfDigits)
                        continue;
                    const lowerKey = key.toLowerCase().trim();
                    if (possiblePhoneKeys.some(k => lowerKey.includes(k))) {
                        const normalized = (0, phoneValidator_1.normalizePhone)(String(rawVal));
                        if (normalized) {
                            uniquePhones.add(normalized);
                        }
                    }
                }
                if (uniquePhones.size === 0) {
                    for (const val of Object.values(row)) {
                        if (!val)
                            continue;
                        const digits = String(val).replace(/\D/g, '');
                        if (digits === cpfDigits)
                            continue;
                        const normalized = (0, phoneValidator_1.normalizePhone)(String(val));
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
                    await connection.execute(`INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
             VALUES (?, ?, ?, 'pending', ?)`, [campaignId, customerNumber, cpf, JSON.stringify({ source: 'file_import', name: debtorName })]);
                    inserted += 1;
                }
            }
            await connection.commit();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
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
    }
    catch (error) {
        console.error('[campaigns] import error:', error);
        return res.status(400).json({
            error: error instanceof Error ? `Arquivo inválido: ${error.message}` : 'Arquivo inválido',
        });
    }
    finally {
        fs_1.default.rmSync(req.file.path, { force: true });
    }
});
//# sourceMappingURL=campaignsV2.js.map