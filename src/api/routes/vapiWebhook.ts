import { Router } from 'express';
import { ProcessVapiWebhook } from '../../application/webhooks/ProcessVapiWebhook';
import { processVapiToolCalls } from '../../application/vapi/ProcessVapiToolCalls';
import { MySqlWebhookRepository } from '../../infrastructure/mysql/MySqlWebhookRepository';

const router = Router();
const processor = new ProcessVapiWebhook(new MySqlWebhookRepository());

router.post('/vapi/webhook', async (req, res) => {
  try {
    const payload = (req.body || {}) as Record<string, unknown>;
    const message = payload.message && typeof payload.message === 'object'
      ? payload.message as Record<string, unknown>
      : payload;
    const type = String(message.type || '').toLowerCase();

    if (type === 'tool-calls') {
      return res.status(200).json(processVapiToolCalls(payload));
    }

    const result = await processor.execute(payload);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('[vapi-webhook] processing error:', error);
    return res.status(500).json({ received: true, processed: false });
  }
});

export default router;
