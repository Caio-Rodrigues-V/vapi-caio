export type WebhookEventInput = {
  provider: string;
  eventId: string;
  providerCallId: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type CallResultInput = {
  campaignCallId: number;
  providerCallId: string;
  decision: 'formalize' | 'schedule' | 'zero';
  scheduledCallbackAt?: Date | null;
  durationSeconds?: number | null;
  recordingUrl?: string | null;
  transcript?: string | null;
  endedReason?: string | null;
  rawPayload: Record<string, unknown>;
};

export interface WebhookRepository {
  registerEvent(input: WebhookEventInput): Promise<boolean>;
  findCampaignCallId(providerCallId: string, metadataCampaignCallId?: number): Promise<number | null>;
  markCallStatus(providerCallId: string, status: 'queued' | 'in_progress' | 'answered' | 'completed' | 'failed'): Promise<void>;
  saveCallResult(input: CallResultInput): Promise<void>;
  scheduleCallbackFromCall(campaignCallId: number, scheduledAt: Date): Promise<number>;
  markEventProcessed(provider: string, eventId: string, error?: string | null): Promise<void>;
}
