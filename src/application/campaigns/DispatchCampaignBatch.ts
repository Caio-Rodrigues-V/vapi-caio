import { randomUUID } from 'crypto';
import { CampaignCallRepository, CampaignRepository } from '../../core/campaigns/CampaignRepository';
import { DialerProvider } from '../../core/dialer/DialerProvider';

export class DispatchCampaignBatch {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly calls: CampaignCallRepository,
    private readonly dialer: DialerProvider,
  ) {}

  async execute(campaignId: number): Promise<{ reserved: number; dispatched: number; failed: number }> {
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign || campaign.status !== 'running') return { reserved: 0, dispatched: 0, failed: 0 };

    const batch = await this.calls.reserveBatch(campaign.id, campaign.maxConcurrent, randomUUID());
    let dispatched = 0;
    let failed = 0;

    for (const call of batch) {
      try {
        const result = await this.dialer.startCall({
          customerNumber: call.customerNumber,
          assistantId: campaign.assistantId,
          phoneNumberId: campaign.phoneNumberId ?? undefined,
          metadata: { campaignId: campaign.id, campaignCallId: call.id, cpf: call.cpf ?? undefined },
        });
        await this.calls.attachProviderCall(call.id, result.providerCallId);
        dispatched += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const exhausted = call.attempts + 1 >= campaign.maxAttempts;
        if (exhausted) await this.calls.updateStatus(call.id, 'failed', message);
        else await this.calls.scheduleRetry(call.id, new Date(Date.now() + 60_000), message);
        failed += 1;
      }
    }

    return { reserved: batch.length, dispatched, failed };
  }
}
