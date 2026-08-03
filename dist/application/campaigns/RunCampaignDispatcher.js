"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunCampaignDispatcher = void 0;
const DispatchCampaignBatch_1 = require("./DispatchCampaignBatch");
class RunCampaignDispatcher {
    campaigns;
    calls;
    dialer;
    retryPolicy;
    options;
    debts;
    assistantResolver;
    constructor(campaigns, calls, dialer, retryPolicy, options, debts, assistantResolver) {
        this.campaigns = campaigns;
        this.calls = calls;
        this.dialer = dialer;
        this.retryPolicy = retryPolicy;
        this.options = options;
        this.debts = debts;
        this.assistantResolver = assistantResolver;
    }
    async execute() {
        const now = Date.now();
        const recoveredLocks = await this.calls.releaseStaleLocks(new Date(now - this.options.staleLockMinutes * 60_000));
        const recoveredCalls = await this.calls.recoverTimedOutCalls(new Date(now - this.options.watchdogTimeoutMinutes * 60_000), this.options.defaultMaxAttempts);
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
        if (remainingGlobal === 0)
            return empty;
        const runnable = await this.campaigns.findRunnable(this.options.campaignScanLimit);
        let reserved = 0;
        let dispatched = 0;
        let skipped = 0;
        let retries = 0;
        let failed = 0;
        for (const campaign of runnable) {
            if (remainingGlobal <= 0)
                break;
            const activeCampaign = await this.calls.countActive(campaign.id);
            const campaignCapacity = Math.max(0, campaign.maxConcurrent - activeCampaign);
            const capacity = Math.min(campaignCapacity, remainingGlobal);
            if (capacity <= 0)
                continue;
            const useCase = new DispatchCampaignBatch_1.DispatchCampaignBatch(this.campaigns, this.calls, this.dialer, this.retryPolicy, this.debts, this.assistantResolver);
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
exports.RunCampaignDispatcher = RunCampaignDispatcher;
//# sourceMappingURL=RunCampaignDispatcher.js.map