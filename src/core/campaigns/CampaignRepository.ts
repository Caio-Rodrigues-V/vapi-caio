import { Campaign, CampaignCall, CampaignCallStatus, CampaignStatus } from './models';

export type CreateCampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>;
export type AddCampaignCallInput = Pick<CampaignCall, 'campaignId' | 'customerNumber' | 'cpf' | 'metadata'>;

export interface CampaignRepository {
  create(input: CreateCampaignInput): Promise<Campaign>;
  findById(id: number): Promise<Campaign | null>;
  updateStatus(id: number, status: CampaignStatus): Promise<void>;
}

export interface CampaignCallRepository {
  add(input: AddCampaignCallInput): Promise<CampaignCall>;
  reserveBatch(campaignId: number, limit: number, lockId: string): Promise<CampaignCall[]>;
  attachProviderCall(id: number, providerCallId: string): Promise<void>;
  updateStatus(id: number, status: CampaignCallStatus, error?: string | null): Promise<void>;
  scheduleRetry(id: number, nextAttemptAt: Date, error: string): Promise<void>;
  releaseStaleLocks(olderThan: Date): Promise<number>;
}
