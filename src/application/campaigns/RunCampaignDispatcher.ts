import { CampaignCallRepository, CampaignRepository } from '../../core/campaigns/CampaignRepository';
import { DebtProvider } from '../../core/debt/DebtProvider';
import { DialerProvider } from '../../core/dialer/DialerProvider';
import { AssistantResolver } from './AssistantResolver';
import { DispatchCampaignBatch } from './DispatchCampaignBatch';
import { RetryPolicy } from './RetryPolicy';

export type DispatcherOptions = {
  globalMaxConcurrent: number;
  campaignScanLimit: number;
  staleLockMinutes: number;
  watchdogTimeoutMinutes: number;
  defaultMaxAttempts: number;
};

export class RunCampaignDispatcher {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly calls: CampaignCallRepository,
    private readonly dialer: DialerProvider,
    private readonly retryPolicy: RetryPolicy,
    private readonly options: DispatcherOptions,
    private readonly debts?: DebtProvider,
    private readonly assistantResolver?: AssistantResolver,
  ) {}

  async execute(): Promise<{
    recoveredLocks: number;
    recoveredCalls: number;
    campaignsScanned: number;
    reserved: number;
    dispatched: number;
    skipped: number;
    retries: number;
    failed: number;
  }> {
    const now = Date.now();
    const recoveredLocks = await this.calls.releaseStaleLocks(
      new Date(now - this.options.staleLockMinutes * 60_000),
    );
    const recoveredCalls = await this.calls.recoverTimedOutCalls(
      new Date(now - this.options.watchdogTimeoutMinutes * 60_000),
      this.options.defaultMaxAttempts,
    );

    const empty = {
      recoveredLocks,
      recoveredCalls,
      campaignsScanned: 0,
      reserved: 0,
      dispatched: 0,
      skipped: 0,
      retries: 0,
      failed: 0,
    };

    const activeGlobal = await this.calls.countActive();
    let remainingGlobal = Math.max(0, this.options.globalMaxConcurrent - activeGlobal);
    if (remainingGlobal === 0) return empty;

    const runnable = await this.campaigns.findRunnable(this.options.campaignScanLimit);
    let reserved = 0;
    let dispatched = 0;
    let skipped = 0;
    let retries = 0;
    let failed = 0;

    for (const campaign of runnable) {
      if (remainingGlobal <= 0) break;
      const activeCampaign = await this.calls.countActive(campaign.id);
      const campaignCapacity = Math.max(0, campaign.maxConcurrent - activeCampaign);
      const capacity = Math.min(campaignCapacity, remainingGlobal);
      if (capacity <= 0) continue;

      const useCase = new DispatchCampaignBatch(
        this.campaigns,
        this.calls,
        this.dialer,
        this.retryPolicy,
        this.debts,
        this.assistantResolver,
      );
      const result = await useCase.execute(campaign.id, capacity);
      reserved += result.reserved;
      dispatched += result.dispatched;
      skipped += result.skipped;
      retries += result.retries;
      failed += result.failed;
      remainingGlobal -= result.dispatched;
    }

    return {
      recoveredLocks,
      recoveredCalls,
      campaignsScanned: runnable.length,
      reserved,
      dispatched,
      skipped,
      retries,
      failed,
    };
  }
}
