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
exports.campaignsV2Router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 20 * 1024 * 1024 },
});
function requireAdmin(req, res, next) {
    const expected = process.env.API_AUTH_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
    const provided = req.header('authorization')?.replace(/^Bearer\s+/i, '') || req.header('x-api-token');
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
exports.campaignsV2Router.use(requireAdmin);
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
        const [assistantResponse, phoneResponse] = await Promise.all([
            client.get(`/assistant/${assistantId}`),
            client.get(`/phone-number/${phoneNumberId}`),
        ]);
        return res.json({
            operation: 'uva',
            assistant: {
                id: assistantId,
                name: String(assistantResponse.data?.name || 'Assistant UVA'),
            },
            phoneNumber: {
                id: phoneNumberId,
                number: String(phoneResponse.data?.number ||
                    phoneResponse.data?.phoneNumber ||
                    phoneResponse.data?.name ||
                    'Número Vapi configurado'),
            },
        });
    }
    catch (error) {
        const message = axios_1.default.isAxiosError(error)
            ? String(error.response?.data?.message || error.response?.data?.error || error.message)
            : error instanceof Error ? error.message : 'Erro desconhecido';
        const status = message.includes('não configurada') ? 503 : 502;
        return res.status(status).json({ error: `Não foi possível carregar a configuração UVA: ${message}` });
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
      COUNT(cc.id) AS total_calls
     FROM campaigns c
     LEFT JOIN campaign_calls cc ON cc.campaign_id = c.id
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
exports.campaignsV2Router.get('/campaigns/:id/calls', async (req, res) => {
    const id = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || '').trim();
    const whereStatus = status ? 'AND cc.status = ?' : '';
    const params = status ? [id, status, limit, offset] : [id, limit, offset];
    const [rows] = await db_1.default.query(`SELECT cc.*, cr.decision, cr.scheduled_callback_at, cr.created_at AS result_created_at
     FROM campaign_calls cc
     LEFT JOIN call_results cr ON cr.campaign_call_id = cc.id
     WHERE cc.campaign_id = ? ${whereStatus}
     ORDER BY cc.id DESC LIMIT ? OFFSET ?`, params);
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
    try {
        await new Promise((resolve, reject) => {
            fs_1.default.createReadStream(req.file.path)
                .pipe((0, csv_parse_1.parse)({ columns: true, trim: true, skip_empty_lines: true, bom: true }))
                .on('data', (row) => rows.push(normalizedRow(row)))
                .on('error', reject)
                .on('end', resolve);
        });
        const connection = await db_1.default.getConnection();
        let inserted = 0;
        let ignored = 0;
        try {
            await connection.beginTransaction();
            for (const row of rows) {
                const phoneRaw = row.telefone || row.phone || row.numero || row.celular || row.fone;
                const cpf = String(row.cpf || '').replace(/\D/g, '').padStart(11, '0');
                const customerNumber = phoneRaw ? (0, phoneValidator_1.normalizePhone)(String(phoneRaw)) : null;
                if (!customerNumber || cpf.length !== 11) {
                    ignored += 1;
                    continue;
                }
                await connection.execute(`INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
           VALUES (?, ?, ?, 'pending', ?)`, [campaignId, customerNumber, cpf, JSON.stringify({ source: 'file_import', name: row.nome || row.name || null })]);
                inserted += 1;
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
        return res.status(201).json({ campaignId, totalRows: rows.length, inserted, ignored });
    }
    finally {
        fs_1.default.rmSync(req.file.path, { force: true });
    }
});
//# sourceMappingURL=campaignsV2.js.map