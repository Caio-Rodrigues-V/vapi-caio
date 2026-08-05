"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ProcessVapiWebhook_1 = require("../../application/webhooks/ProcessVapiWebhook");
const ProcessVapiToolCalls_1 = require("../../application/vapi/ProcessVapiToolCalls");
const MySqlWebhookRepository_1 = require("../../infrastructure/mysql/MySqlWebhookRepository");
const DdmDebtProvider_1 = require("../../providers/debt/DdmDebtProvider");
const router = (0, express_1.Router)();
const debts = new DdmDebtProvider_1.DdmDebtProvider({
    token: process.env.DDM_TOKEN_BUSCA || process.env.DDM_API_TOKEN || '',
    baseUrl: process.env.DDM_BASE_URL || 'https://ddmacordos.com',
    timeoutMs: Number(process.env.DDM_TIMEOUT_MS || 7000),
    maxRetries: Number(process.env.DDM_MAX_RETRIES || 3),
});
const processor = new ProcessVapiWebhook_1.ProcessVapiWebhook(new MySqlWebhookRepository_1.MySqlWebhookRepository(), debts);
router.post('/vapi/webhook', async (req, res) => {
    try {
        const payload = (req.body || {});
        const message = payload.message && typeof payload.message === 'object'
            ? payload.message
            : payload;
        const type = String(message.type || '').toLowerCase();
        if (type === 'tool-calls') {
            return res.status(200).json((0, ProcessVapiToolCalls_1.processVapiToolCalls)(payload));
        }
        if (type !== 'end-of-call-report') {
            try {
                await processor.execute(payload);
            }
            catch (err) {
                console.error('[vapi-webhook] background processing error:', err);
            }
            return res.status(200).json({});
        }
        try {
            const result = await processor.execute(payload);
            return res.status(200).json({ received: true, ...result });
        }
        catch (err) {
            console.error('[vapi-webhook] report processing error:', err);
            return res.status(200).json({ received: true, processed: false, error: String(err) });
        }
    }
    catch (error) {
        console.error('[vapi-webhook] fatal processing error:', error);
        return res.status(200).json({});
    }
});
exports.default = router;
//# sourceMappingURL=vapiWebhook.js.map