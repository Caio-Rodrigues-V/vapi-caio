import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../../db';
import { CallResultInput, WebhookEventInput, WebhookRepository } from '../../core/webhooks/WebhookRepository';

export class MySqlWebhookRepository implements WebhookRepository {
  async registerEvent(input: WebhookEventInput): Promise<boolean> {
    try {
      await pool.execute(
        `INSERT INTO webhook_events
          (provider, event_id, provider_call_id, event_type, payload)
         VALUES (?, ?, ?, ?, ?)`,
        [input.provider, input.eventId, input.providerCallId, input.eventType, JSON.stringify(input.payload)],
      );
      return true;
    } catch (error: any) {
      if (error?.code === 'ER_DUP_ENTRY') return false;
      throw error;
    }
  }

  async findCampaignCallId(providerCallId: string, metadataCampaignCallId?: number): Promise<number | null> {
    if (metadataCampaignCallId && Number.isInteger(metadataCampaignCallId)) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT id FROM campaign_calls WHERE id = ? LIMIT 1',
        [metadataCampaignCallId],
      );
      if (rows[0]) return Number(rows[0].id);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM campaign_calls WHERE provider_call_id = ? LIMIT 1',
      [providerCallId],
    );
    return rows[0] ? Number(rows[0].id) : null;
  }

  async findCampaignCall(id: number): Promise<any> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, campaign_id, customer_number, cpf, status, metadata FROM campaign_calls WHERE id = ? LIMIT 1',
      [id],
    );
    if (!rows[0]) return null;
    return {
      id: Number(rows[0].id),
      campaignId: Number(rows[0].campaign_id),
      customerNumber: String(rows[0].customer_number),
      cpf: rows[0].cpf ? String(rows[0].cpf) : null,
      metadata: typeof rows[0].metadata === 'string' ? JSON.parse(rows[0].metadata || '{}') : (rows[0].metadata || {}),
    };
  }

  async markCallStatus(
    providerCallId: string,
    status: 'queued' | 'in_progress' | 'answered' | 'completed' | 'failed',
  ): Promise<void> {
    await pool.execute(
      'UPDATE campaign_calls SET status = ?, locked_at = NULL WHERE provider_call_id = ?',
      [status, providerCallId],
    );
  }

  async saveCallResult(input: CallResultInput): Promise<void> {
    await pool.execute(
      `INSERT INTO call_results
        (campaign_call_id, provider_call_id, decision, scheduled_callback_at,
         duration_seconds, recording_url, transcript, ended_reason, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         decision = VALUES(decision),
         scheduled_callback_at = VALUES(scheduled_callback_at),
         duration_seconds = VALUES(duration_seconds),
         recording_url = VALUES(recording_url),
         transcript = VALUES(transcript),
         ended_reason = VALUES(ended_reason),
         raw_payload = VALUES(raw_payload)`,
      [
        input.campaignCallId,
        input.providerCallId,
        input.decision,
        input.scheduledCallbackAt ?? null,
        input.durationSeconds ?? null,
        input.recordingUrl ?? null,
        input.transcript ?? null,
        input.endedReason ?? null,
        JSON.stringify(input.rawPayload),
      ],
    );

    await pool.execute(
      `UPDATE campaign_calls
       SET status = 'completed', duration_seconds = ?, recording_url = ?, transcript = ?,
           result_code = ?, scheduled_callback_at = ?, locked_at = NULL
       WHERE id = ?`,
      [
        input.durationSeconds ?? null,
        input.recordingUrl ?? null,
        input.transcript ?? null,
        input.decision,
        input.scheduledCallbackAt ?? null,
        input.campaignCallId,
      ],
    );
  }

  async scheduleCallbackFromCall(campaignCallId: number, scheduledAt: Date): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT campaign_id, customer_number, cpf, metadata
       FROM campaign_calls WHERE id = ? LIMIT 1`,
      [campaignCallId],
    );
    if (!rows[0]) throw new Error('Chamada original não encontrada para reagendamento.');

    const row = rows[0];
    const metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO campaign_calls
        (campaign_id, customer_number, cpf, status, next_attempt_at, metadata)
       VALUES (?, ?, ?, 'retry_scheduled', ?, ?)`,
      [
        Number(row.campaign_id),
        row.customer_number,
        row.cpf ?? null,
        scheduledAt,
        JSON.stringify({ ...metadata, scheduledFromCampaignCallId: campaignCallId }),
      ],
    );
    return result.insertId;
  }

  async markEventProcessed(provider: string, eventId: string, error: string | null = null): Promise<void> {
    await pool.execute(
      `UPDATE webhook_events
       SET processed_at = NOW(), processing_error = ?
       WHERE provider = ? AND event_id = ?`,
      [error, provider, eventId],
    );
  }
}
