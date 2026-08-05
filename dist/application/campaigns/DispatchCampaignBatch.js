"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DispatchCampaignBatch = void 0;
const crypto_1 = require("crypto");
const DebtProvider_1 = require("../../core/debt/DebtProvider");
function asText(value) {
    if (value === null || value === undefined)
        return '';
    return String(value).trim();
}
function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return '';
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(number);
}
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
                let customerName = asText(call.metadata?.name);
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
                    assistantId = this.assistantResolver?.resolve() || campaign.assistantId;
                    customerName = asText(debt.debtorName) || customerName;
                    debtMetadata = {
                        debtCheckedAt: new Date().toISOString(),
                        hasDebt: true,
                        institution: debt.institution ?? null,
                        debtorName: debt.debtorName ?? null,
                        calculationId: debt.calculationId ?? null,
                        nominalAmount: debt.nominalAmount ?? null,
                        cashAmount: debt.cashAmount ?? null,
                        firstDueDate: debt.firstDueDate ?? null,
                        email: debt.email ?? null,
                        installments: debt.installments,
                        assistantId,
                    };
                    await this.calls.mergeMetadata(call.id, debtMetadata);
                }
                const variableValues = {
                    instituicao: asText(debtMetadata.institution),
                    Valorcpf: asText(call.cpf),
                    ValorFinalAVista: formatCurrency(debtMetadata.cashAmount),
                    ValorNominal: formatCurrency(debtMetadata.nominalAmount),
                    PrimeiroVencimento: asText(debtMetadata.firstDueDate),
                    calculationId: asText(debtMetadata.calculationId),
                };
                const sanitizedVariableValues = Object.fromEntries(Object.entries(variableValues).filter(([, value]) => value !== ''));
                const providerResult = await this.dialer.startCall({
                    customerNumber: call.customerNumber,
                    customerName: customerName || undefined,
                    assistantId,
                    phoneNumberId: campaign.phoneNumberId ?? undefined,
                    variableValues: sanitizedVariableValues,
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
                const delayMs = Number(process.env.WORKER_DELAY_BETWEEN_CALLS_MS || 0);
                if (delayMs > 0 && result.dispatched < batch.length) {
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                }
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