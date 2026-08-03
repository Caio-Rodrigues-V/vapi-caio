export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type CampaignCallStatus =
  | 'pending'
  | 'reserved'
  | 'queued'
  | 'in_progress'
  | 'answered'
  | 'completed'
  | 'retry_scheduled'
  | 'skipped'
  | 'failed';

export type Campaign = {
  id: number;
  name: string;
  status: CampaignStatus;
  assistantId: string;
  phoneNumberId?: string | null;
  maxConcurrent: number;
  maxAttempts: number;
  scheduledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CampaignCall = {
  id: number;
  campaignId: number;
  customerNumber: string;
  cpf?: string | null;
  status: CampaignCallStatus;
  providerCallId?: string | null;
  attempts: number;
  nextAttemptAt?: Date | null;
  lockedAt?: Date | null;
  lastError?: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};
