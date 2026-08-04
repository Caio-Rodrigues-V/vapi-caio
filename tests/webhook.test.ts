import assert from 'node:assert/strict';
import test from 'node:test';
import { ProcessVapiWebhook } from '../src/application/webhooks/ProcessVapiWebhook';
import {
  CallResultInput,
  WebhookEventInput,
  WebhookRepository,
} from '../src/core/webhooks/WebhookRepository';

class FakeWebhookRepository implements WebhookRepository {
  readonly events = new Set<string>();
  readonly statuses: Array<{ providerCallId: string; status: string }> = [];
  readonly results: CallResultInput[] = [];
  readonly processed: Array<{ provider: string; eventId: string; error: string | null }> = [];

  async registerEvent(input: WebhookEventInput): Promise<boolean> {
    const key = `${input.provider}:${input.eventId}`;
    if (this.events.has(key)) return false;
    this.events.add(key);
    return true;
  }

  async findCampaignCallId(_providerCallId: string, metadataCampaignCallId?: number): Promise<number | null> {
    return metadataCampaignCallId ?? 42;
  }

  async markCallStatus(providerCallId: string, status: 'queued' | 'in_progress' | 'answered' | 'completed' | 'failed'): Promise<void> {
    this.statuses.push({ providerCallId, status });
  }

  async saveCallResult(input: CallResultInput): Promise<void> {
    this.results.push(input);
  }

  async scheduleCallbackFromCall(): Promise<number> {
    return 99;
  }

  async markEventProcessed(provider: string, eventId: string, error: string | null = null): Promise<void> {
    this.processed.push({ provider, eventId, error });
  }
}

test('ProcessVapiWebhook atualiza status de chamada', async () => {
  const repository = new FakeWebhookRepository();
  const processor = new ProcessVapiWebhook(repository);

  const result = await processor.execute({
    message: {
      id: 'event-status-1',
      type: 'status-update',
      status: 'ringing',
      call: { id: 'call-1', status: 'ringing' },
    },
  });

  assert.deepEqual(result, { duplicate: false, processed: true });
  assert.deepEqual(repository.statuses, [{ providerCallId: 'call-1', status: 'in_progress' }]);
  assert.equal(repository.processed.length, 1);
});

test('ProcessVapiWebhook persiste resultado de encerramento e ignora duplicata', async () => {
  const repository = new FakeWebhookRepository();
  const processor = new ProcessVapiWebhook(repository);
  const payload = {
    message: {
      id: 'event-end-1',
      type: 'end-of-call-report',
      transcript: 'Cliente não confirmou acordo.',
      recordingUrl: 'https://example.invalid/recording.mp3',
      endedReason: 'customer-ended-call',
      call: {
        id: 'call-2',
        startedAt: '2026-08-04T18:00:00.000Z',
        endedAt: '2026-08-04T18:00:30.000Z',
        metadata: { campaignCallId: 77 },
      },
      artifact: {
        messages: [{ role: 'customer', message: 'Não tenho interesse.' }],
      },
    },
  };

  const first = await processor.execute(payload);
  const duplicate = await processor.execute(payload);

  assert.deepEqual(first, { duplicate: false, processed: true });
  assert.deepEqual(duplicate, { duplicate: true, processed: false });
  assert.equal(repository.results.length, 1);
  assert.equal(repository.results[0]?.campaignCallId, 77);
  assert.equal(repository.results[0]?.decision, 'zero');
  assert.equal(repository.results[0]?.durationSeconds, 30);
  assert.equal(repository.results[0]?.recordingUrl, 'https://example.invalid/recording.mp3');
  assert.equal(repository.results[0]?.endedReason, 'customer-ended-call');
}
