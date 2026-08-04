import { randomUUID } from 'crypto';
import { Router } from 'express';
import pool from '../../db';
import { ProcessVapiWebhook } from '../../application/webhooks/ProcessVapiWebhook';
import { MySqlWebhookRepository } from '../../infrastructure/mysql/MySqlWebhookRepository';

export const adminWebhookSimulationRouter = Router();
const processor = new ProcessVapiWebhook(new MySqlWebhookRepository());

function requireAdmin(req: any, res: any, next: any) {
  const expected = process.env.ADMIN_MIGRATION_TOKEN;
  const provided = req.header('x-admin-token');
  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  return next();
}

adminWebhookSimulationRouter.use(requireAdmin);

adminWebhookSimulationRouter.post('/webhooks/vapi/simulate', async (req, res) => {
  try {
    const campaignCallId = Number(req.body?.campaignCallId);
    const eventType = String(req.body?.eventType || 'status-update');
    const requestedStatus = String(req.body?.status || 'completed');

    if (!Number.isInteger(campaignCallId) || campaignCallId <= 0) {
      return res.status(400).json({ error: 'campaignCallId inválido' });
    }

    if (!['status-update', 'end-of-call-report'].includes(eventType)) {
      return res.status(400).json({ error: 'eventType inválido' });
    }

    if (!['queued', 'ringing', 'in-progress', 'answered', 'ended', 'completed', 'failed'].includes(requestedStatus)) {
      return res.status(400).json({ error: 'status inválido' });
    }

    const [rows]: any = await pool.execute(
      `SELECT id, provider_call_id, customer_number, metadata
       FROM campaign_calls WHERE id = ? LIMIT 1`,
      [campaignCallId],
    );
    const callRow = rows[0];
    if (!callRow) return res.status(404).json({ error: 'campaign_call não encontrado' });

    const providerCallId = String(callRow.provider_call_id || `simulated-${campaignCallId}`);
    const now = new Date();
    const startedAt = new Date(now.getTime() - 45_000).toISOString();
    const endedAt = now.toISOString();
    const eventId = String(req.body?.eventId || `simulation:${campaignCallId}:${eventType}:${randomUUID()}`);
    const transcript = String(req.body?.transcript || 'Cliente não confirmou acordo nem solicitou retorno.');

    const payload = {
      message: {
        id: eventId,
        type: eventType,
        status: requestedStatus,
        transcript,
        durationSeconds: 45,
        endedReason: String(req.body?.endedReason || 'simulated-end'),
        recordingUrl: String(req.body?.recordingUrl || 'https://example.invalid/simulated-recording.mp3'),
        call: {
          id: providerCallId,
          status: requestedStatus,
          startedAt,
          endedAt,
          endedReason: String(req.body?.endedReason || 'simulated-end'),
          customer: { number: callRow.customer_number },
          metadata: {
            campaignCallId,
            simulation: true,
          },
        },
        artifact: {
          transcript,
          recordingUrl: String(req.body?.recordingUrl || 'https://example.invalid/simulated-recording.mp3'),
          messages: [{ role: 'customer', message: transcript }],
        },
      },
    };

    const result = await processor.execute(payload);
    return res.json({
      ok: true,
      campaignCallId,
      providerCallId,
      eventId,
      eventType,
      simulatedStatus: requestedStatus,
      result,
    });
  } catch (error) {
    console.error('[admin-webhook-simulation] error:', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return res.status(500).json({ error: message });
  }
});
