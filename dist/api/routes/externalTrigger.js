"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.externalTriggerRouter = void 0;
const express_1 = require("express");
const db_1 = __importDefault(require("../../db"));
const phoneValidator_1 = require("../../utils/phoneValidator");
exports.externalTriggerRouter = (0, express_1.Router)();
function requireAuthToken(req, res, next) {
    const expectedToken = process.env.API_AUTH_TOKEN || process.env.WORKER_TRIGGER_TOKEN || process.env.ADMIN_MIGRATION_TOKEN;
    const providedToken = req.header('authorization')?.replace(/^Bearer\s+/i, '') ||
        req.header('x-api-token') ||
        req.query.token ||
        req.query.api_token ||
        req.body?.token;
    if (expectedToken && providedToken !== expectedToken) {
        return res.status(401).json({ error: 'Não autorizado. Token de API ausente ou inválido.' });
    }
    return next();
}
exports.externalTriggerRouter.use(requireAuthToken);
exports.externalTriggerRouter.get('/calls/trigger', (_req, res) => {
    return res.json({
        ok: true,
        status: 'online',
        endpoint: '/api/v2/calls/trigger',
        methodRequired: 'POST',
        message: 'Endpoint de disparo ativo. Envie uma requisição HTTP POST com o JSON do contato para efetuar a chamada.',
    });
});
exports.externalTriggerRouter.post('/calls/trigger', async (req, res) => {
    try {
        const body = req.body || {};
        const rawNumber = body.customerNumber || body.customer_number || body.telefone || body.phone;
        const rawCpf = body.cpf || body.customerCpf || body.customer_cpf || body.documento;
        const name = body.customerName || body.customer_name || body.nome || 'Cliente';
        const assistantId = body.assistantId || body.assistant_id || process.env.VAPI_ASSISTANT_ID_UVA;
        const phoneNumberId = body.phoneNumberId || body.phone_number_id || process.env.VAPI_PHONE_NUMBER_ID;
        const callbackUrl = body.callbackUrl || body.callback_url || null;
        // External IDs mapping
        const contactId = body.contactId || body.contact_id || null;
        const campaignContactId = body.campaignContactId || body.campaign_contact_id || null;
        const externalCampaignId = body.campaignId || body.campaign_id || null;
        if (!rawNumber) {
            return res.status(400).json({ error: 'customerNumber / telefone é obrigatório.' });
        }
        const phoneE164 = (0, phoneValidator_1.normalizePhone)(String(rawNumber));
        if (!phoneE164) {
            return res.status(400).json({ error: 'Número de telefone inválido para o formato E.164.' });
        }
        const cpfDigits = String(rawCpf || '').replace(/\D/g, '');
        const cpf = cpfDigits.length === 11 ? cpfDigits : null;
        // 1. Find or create an active API campaign for these calls
        const campaignName = externalCampaignId
            ? `Campanha Externa #${externalCampaignId}`
            : 'Campanha API Externa';
        const [campaignRows] = await db_1.default.query(`SELECT id FROM campaigns
       WHERE status IN ('running', 'draft', 'scheduled')
       AND assistant_id = ?
       ORDER BY id DESC LIMIT 1`, [assistantId || '']);
        let campaignId;
        if (campaignRows.length > 0) {
            campaignId = campaignRows[0].id;
        }
        else {
            const [insertCampaign] = await db_1.default.execute(`INSERT INTO campaigns (name, status, assistant_id, phone_number_id, max_concurrent, max_attempts)
         VALUES (?, 'running', ?, ?, 1, 5)`, [campaignName, assistantId || '', phoneNumberId || '']);
            campaignId = insertCampaign.insertId;
        }
        // 2. Build metadata object storing all partner external references
        const metadata = {
            name,
            contactId,
            campaignContactId,
            externalCampaignId,
            callbackUrl,
            tipoTelefonia: body.tipoTelefonia || 'vapi',
            institution: 'UVA',
            rawPayload: body,
        };
        // 3. Insert call into campaign_calls queue
        const [result] = await db_1.default.execute(`INSERT INTO campaign_calls (campaign_id, customer_number, cpf, status, metadata)
       VALUES (?, ?, ?, 'pending', ?)`, [campaignId, phoneE164, cpf, JSON.stringify(metadata)]);
        return res.status(201).json({
            ok: true,
            message: 'Chamada adicionada à fila de disparo com sucesso.',
            data: {
                callId: result.insertId,
                campaignId,
                customerNumber: phoneE164,
                cpf,
                status: 'pending',
                contactId,
                campaignContactId,
                callbackUrl,
            },
        });
    }
    catch (error) {
        console.error('[externalTrigger] error:', error);
        return res.status(500).json({ error: 'Erro ao processar disparo externo', details: error.message });
    }
});
//# sourceMappingURL=externalTrigger.js.map