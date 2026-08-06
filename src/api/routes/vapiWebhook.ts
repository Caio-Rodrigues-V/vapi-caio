import { Router } from 'express';
import { ProcessVapiWebhook } from '../../application/webhooks/ProcessVapiWebhook';
import { processVapiToolCalls } from '../../application/vapi/ProcessVapiToolCalls';
import { MySqlWebhookRepository } from '../../infrastructure/mysql/MySqlWebhookRepository';
import { DdmDebtProvider } from '../../providers/debt/DdmDebtProvider';

const router = Router();

const debts = new DdmDebtProvider({
  token: process.env.DDM_TOKEN_BUSCA || process.env.DDM_API_TOKEN || '',
  tokenCalcula: process.env.DDM_TOKEN || '',
  baseUrl: process.env.DDM_BASE_URL || 'https://ddmacordos.com',
  timeoutMs: Number(process.env.DDM_TIMEOUT_MS || 7000),
  maxRetries: Number(process.env.DDM_MAX_RETRIES || 3),
});

const processor = new ProcessVapiWebhook(new MySqlWebhookRepository(), debts);

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

    if (type !== 'end-of-call-report') {
      // Process database writes in the background to prevent Vapi from timing out and silencing the voice agent
      processor.execute(payload).catch((err) => {
        console.error('[vapi-webhook] background processing error:', err);
      });
      return res.status(200).json({});
    }

    try {
      const result = await processor.execute(payload);
      return res.status(200).json({ received: true, ...result });
    } catch (err) {
      console.error('[vapi-webhook] report processing error:', err);
      return res.status(200).json({ received: true, processed: false, error: String(err) });
    }
  } catch (error) {
    console.error('[vapi-webhook] fatal processing error:', error);
    return res.status(200).json({});
  }
});

export default router;
