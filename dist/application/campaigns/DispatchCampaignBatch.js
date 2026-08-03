"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchCampaignBatch = void 0;
const crypto_1 = require("crypto");
const DebtProvider_1 = require("../../core/debt/DebtProvider");
class DispatchCampaignBatch {
    campaigns;
    calls;
    dialer;
    retryPolicy;
    debts;
    assistantResolver;
    constructor(campaigns, calls, dialer, retryPolicy, debts, assistantResolver) {
        this.campaigns = campaigns;
        this.calls = calls;
        this.dialer = dialer;
        this.retryPolicy = retryPolicy;
        this.debts = debts;
        this.assistantResolver = assistantResolver;
    }
    async execute(campaignId, capacity) {
        const empty = { reserved: 0, dispatched: 0, skipped: 0, failed: 0, retries: 0 };
        const campaign = await this.campaigns.findById(campaignId);
        if (!campaign || campaign.status !== 'running')
            return empty;
        const limit = Math.max(0, Math.min(capacity ?? campaign.maxConcurrent, campaign.maxConcurrent));
        if (limit === 0)
            return empty;
        const batch = await this.calls.reserveBatch(campaign.id, limit, (0, crypto_1.randomUUID)());
        const result = { ...empty, reserved: batch.length };
        for (const call of batch) {
            try {
                let assistantId = campaign.assistantId;
                let debtMetadata = {};
                if (this.debts) {
                    if (!call.cpf) {
                        await this.calls.updateStatus(call.id, 'skipped', 'cpf_missing');
                        result.skipped += 1;
                        continue;
                    }
                    const debt = await this.debts.lookup(call.cpf);
                    if (!debt.hasDebt) {
                        await this.calls.mergeMetadata(call.id, { debtCheckedAt: new Date().toISOString(), hasDebt: false });
                        await this.calls.updateStatus(call.id, 'skipped', 'no_debt');
                        result.skipped += 1;
                        continue;
                    }
                    assistantId = this.assistantResolver?.resolve(debt.institution) || campaign.assistantId;
                    debtMetadata = {
                        debtCheckedAt: new Date().toISOString(),
                        hasDebt: true,
                        institution: debt.institution ?? null,
                        debtorName: debt.debtorName ?? null,
                        calculationId: debt.calculationId ?? null,
                        nominalAmount: debt.nominalAmount ?? null,
                        cashAmount: debt.cashAmount ?? null,
                        firstDueDate: debt.firstDueDate ?? null,
                        installments: debt.installments,
                        assistantId,
                    };
                    await this.calls.mergeMetadata(call.id, debtMetadata);
                }
                const providerResult = await this.dialer.startCall({
                    customerNumber: call.customerNumber,
                    assistantId,
                    phoneNumberId: campaign.phoneNumberId ?? undefined,
                    metadata: {
                        ...call.metadata,
                        ...debtMetadata,
                        campaignId: campaign.id,
                        campaignCallId: call.id,
                        cpf: call.cpf ?? null,
                    },
                });
                await this.calls.attachProviderCall(call.id, providerResult.providerCallId);
                result.dispatched += 1;
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const permanent = error instanceof DebtProvider_1.DebtProviderPermanentError;
                const temporary = error instanceof DebtProvider_1.DebtProviderTemporaryError;
                const exhausted = call.attempts + 1 >= campaign.maxAttempts;
                if (permanent || exhausted) {
                    await this.calls.updateStatus(call.id, 'failed', message);
                    result.failed += 1;
                }
                else {
                    const reason = temporary ? `ddm_temporary: ${message}` : message;
                    await this.calls.scheduleRetry(call.id, this.retryPolicy.nextAttempt(call.attempts), reason);
                    result.retries += 1;
                }
            }
        }
        return result;
    }
}
exports.DispatchCampaignBatch = DispatchCampaignBatch;
//# sourceMappingURL=DispatchCampaignBatch.js.map