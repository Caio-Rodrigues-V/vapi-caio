"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ProcessVapiWebhook_1 = require("../../application/webhooks/ProcessVapiWebhook");
const MySqlWebhookRepository_1 = require("../../infrastructure/mysql/MySqlWebhookRepository");
const router = (0, express_1.Router)();
const processor = new ProcessVapiWebhook_1.ProcessVapiWebhook(new MySqlWebhookRepository_1.MySqlWebhookRepository());
router.post('/vapi/webhook', async (req, res) => {
    try {
        const result = await processor.execute(req.body || {});
        return res.status(200).json({ received: true, ...result });
    }
    catch (error) {
        console.error('[vapi-webhook] processing error:', error);
        return res.status(500).json({ received: true, processed: false });
    }
});
exports.default = router;
//# sourceMappingURL=vapiWebhook.js.map