import { Router } from 'express';
import { ProcessVapiWebhook } from '../../application/webhooks/ProcessVapiWebhook';
import { MySqlWebhookRepository } from '../../infrastructure/mysql/MySqlWebhookRepository';

const router = Router();
const processor = new ProcessVapiWebhook(new MySqlWebhookRepository());

router.post('/vapi/webhook', async (req, res) => {
  try {
    const result = await processor.execute(req.body || {});
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error('[vapi-webhook] processing error:', error);
    return res.status(500).json({ received: true, processed: false });
  }
});

export default router;
