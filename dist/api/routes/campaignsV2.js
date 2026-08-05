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
function detectDelimiter(filePath) {
    const sample = fs_1.default.readFileSync(filePath, 'utf8').slice(0, 8192);
    const firstLine = sample.split(/\r?\n/, 1)[0] || '';
    const candidates = [
        { delimiter: ',', count: (firstLine.match(/,/g) || []).length },
        { delimiter: ';', count: (firstLine.match(/;/g) || []).length },
        { delimiter: '\t', count: (firstLine.match(/\t/g) || []).length },
    ].sort((a, b) => b.count - a.count);
    const selected = candidates[0];
    return selected && selected.count > 0 ? selected.delimiter : ',';
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
exports.campaignsV2Router.get('/campaigns/:id/calls', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Campanha inválida' });
    }
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || '').trim();
    const whereStatus = status ? 'AND cc.status = ?' : '';
    const params = status ? [id, status, limit, offset] : [id, limit, offset];
    const [rows] = await db_1.default.query(`SELECT cc.*, cr.decision, cr.scheduled_callback_at, cr.ended_reason, cr.created_at AS result_created_at
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
                const cpfDigits = String(cpfRaw || '').replace(/\D/g, '');
                const cpf = cpfDigits.padStart(11, '0');
                if (!cpfRaw) {
                    errors.push({ line, reason: 'CPF ausente' });
                    continue;
                }
                if (cpf.length !== 11) {
                    errors.push({ line, reason: 'CPF deve possuir 11 dígitos', cpf: cpfDigits });
                    continue;
                }
                // Find Name
                let nameRaw = row.nome || row.nome_dev || row.name;
                if (!nameRaw) {
                    const nameKey = Object.keys(row).find(k => {
                        const l = k.toLowerCase();
                        return l.includes('nome') || l.includes('name');
                    });
                    if (nameKey)
                        nameRaw = row[nameKey];
                }
                const debtorName = nameRaw ? String(nameRaw).trim() : null;
                // Detect all potential phone number fields in the row
                const possiblePhoneKeys = [
                    'telefone', 'phone', 'numero', 'celular', 'fone',
                    'tel', 'contato', 'contact', 'telef'
                ];
                const uniquePhones = new Set();
                for (const key of Object.keys(row)) {
                    const lowerKey = key.toLowerCase().trim();
                    if (possiblePhoneKeys.some(k => lowerKey.includes(k))) {
                        const rawVal = row[key];
                        if (rawVal) {
                            const normalized = (0, phoneValidator_1.normalizePhone)(String(rawVal));
                            if (normalized) {
                                uniquePhones.add(normalized);
                            }
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