import { Campaign, CampaignCall, CampaignCallStatus, CampaignStatus } from './models';

export type CreateCampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>;
export type AddCampaignCallInput = Pick<CampaignCall, 'campaignId' | 'customerNumber' | 'cpf' | 'metadata'>;

export interface CampaignRepository {
  create(input: CreateCampaignInput): Promise<Campaign>;
  findById(id: number): Promise<Campaign | null>;
  findRunnable(limit: number): Promise<Campaign[]>;
  updateStatus(id: number, status: CampaignStatus): Promise<void>;
}

export interface CampaignCallRepository {
  add(input: AddCampaignCallInput): Promise<CampaignCall>;
  reserveBatch(campaignId: number, limit: number, lockId: string): Promise<CampaignCall[]>;
  countActive(campaignId?: number): Promise<number>;
  attachProviderCall(id: number, providerCallId: string): Promise<void>;
  mergeMetadata(id: number, metadata: Record<string, unknown>): Promise<void>;
  updateStatus(id: number, status: CampaignCallStatus, error?: string | null): Promise<void>;
  scheduleRetry(id: number, nextAttemptAt: Date, error: string): Promise<void>;
  releaseStaleLocks(olderThan: Date): Promise<number>;
  recoverTimedOutCalls(olderThan: Date, maxAttempts: number): Promise<number>;
}
