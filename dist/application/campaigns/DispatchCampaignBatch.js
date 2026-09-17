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
class RateLimiter {
    lastCallTime = 0;
    minIntervalMs;
    constructor(requestsPerSecond) {
        this.minIntervalMs = Math.ceil(1000 / Math.max(1, requestsPerSecond));
    }
    async acquire() {
        const now = Date.now();
        const waitTime = Math.max(0, this.lastCallTime + this.minIntervalMs - now);
        this.lastCallTime = Math.max(now, this.lastCallTime + this.minIntervalMs);
        if (waitTime > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
    }
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
        const targetDispatched = Math.max(0, Math.min(capacity ?? campaign.maxConcurrent, campaign.maxConcurrent));
        if (targetDispatched === 0)
            return empty;
        // Reserva contatos suficientes para compensar os sem dívida na DDM (~75% taxa de skip)
        const configuredBatch = Number(process.env.WORKER_BATCH_SIZE || 25);
        const reserveLimit = Math.max(targetDispatched, Math.min(targetDispatched * 4, Math.max(configuredBatch, 60)));
        const batch = await this.calls.reserveBatch(campaign.id, reserveLimit, (0, crypto_1.randomUUID)());
        const result = { ...empty, reserved: batch.length };
        if (!batch.length)
            return result;
        // Rate limiter estrito de 10 req/s para a API da DDM
        const ddmRps = Number(process.env.DDM_MAX_RPS || 10);
        const rateLimiter = new RateLimiter(ddmRps);
        // Pool com 10 workers em paralelo
        const concurrency = Math.min(batch.length, Math.max(1, Number(process.env.DDM_CONCURRENCY || 10)));
        let nextIndex = 0;
        let dispatchedSlotsTaken = 0;
        const worker = async () => {
            while (true) {
                let call;
                let isOverCapacity = false;
                if (nextIndex < batch.length) {
                    call = batch[nextIndex++];
                    if (dispatchedSlotsTaken >= targetDispatched) {
                        isOverCapacity = true;
                    }
                }
                else {
                    break;
                }
                if (!call)
                    break;
                if (isOverCapacity) {
                    // Devolve contato excedente para pending para ser chamado no próximo ciclo
                    await this.calls.updateStatus(call.id, 'pending', null);
                    continue;
                }
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
                        // Aguarda slot do rate limiter (máximo 10 requisições por segundo)
                        await rateLimiter.acquire();
                        const debt = await this.debts.lookup(call.cpf);
                        if (!debt.hasDebt) {
                            const reason = debt.skipReason || 'no_debt';
                            if (reason === 'api_error') {
                                console.warn(`[DispatchCampaignBatch] Falha técnica na DDM para o CPF ${call.cpf}. Reagendando para nova tentativa.`);
                                await this.calls.updateStatus(call.id, 'retry_scheduled', 'api_lookup_failed');
                                result.failed += 1;
                                continue;
                            }
                            await this.calls.mergeMetadata(call.id, {
                                debtCheckedAt: new Date().toISOString(),
                                hasDebt: false,
                                calculationId: debt.calculationId ?? null,
                                debtorId: debt.debtorId ?? null,
                                institution: debt.institution ?? null,
                            });
                            await this.calls.updateStatus(call.id, 'skipped', reason);
                            result.skipped += 1;
                            continue;
                        }
                        // Filtro de Instituição: Aceita UVA, Veiga de Almeida e Cruzeiro do Sul
                        const instUpper = (debt.institution || '').toUpperCase();
                        const isAllowedInst = !debt.institution ||
                            instUpper.includes('VEIGA') ||
                            instUpper.includes('ALMEIDA') ||
                            instUpper.includes('UVA') ||
                            instUpper.includes('CRUZEIRO');
                        if (!isAllowedInst) {
                            await this.calls.mergeMetadata(call.id, {
                                debtCheckedAt: new Date().toISOString(),
                                hasDebt: false,
                                institution: debt.institution,
                                calculationId: debt.calculationId ?? null,
                                debtorId: debt.debtorId ?? null,
                            });
                            await this.calls.updateStatus(call.id, 'skipped', 'unsupported_institution');
                            result.skipped += 1;
                            continue;
                        }
                        assistantId = this.assistantResolver?.resolve(debt.institution) || campaign.assistantId;
                        customerName = asText(debt.debtorName) || customerName;
                        debtMetadata = {
                            debtCheckedAt: new Date().toISOString(),
                            hasDebt: true,
                            institution: debt.institution ?? null,
                            debtorName: debt.debtorName ?? null,
                            debtorId: debt.debtorId ?? null,
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
                    // Checa sincronizado se ainda temos cota para disparar
                    let slotGranted = false;
                    if (dispatchedSlotsTaken < targetDispatched) {
                        dispatchedSlotsTaken += 1;
                        slotGranted = true;
                    }
                    if (!slotGranted) {
                        // Atingiu o teto da campanha durante o processamento do lote, devolve para pending
                        await this.calls.updateStatus(call.id, 'pending', null);
                        continue;
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
                    const firstName = (customerName || '').trim().split(/\s+/)[0] || '';
                    const instName = String(debtMetadata.institution || 'DDM').trim();
                    const firstMessage = `Oi, ${firstName || 'tudo bem'}. Aqui é a Júlia, da assessoria financeira da ${instName}. Por segurança, pode me confirmar apenas os três primeiros números do seu CPF?`;
                    const providerResult = await this.dialer.startCall({
                        customerNumber: call.customerNumber,
                        customerName: customerName || undefined,
                        assistantId,
                        phoneNumberId: campaign.phoneNumberId ?? undefined,
                        firstMessage,
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
                    console.log(`[Dispatch] Chamada #${call.id} disparada com sucesso -> ${call.customerNumber}`);
                    const delayMs = Number(process.env.WORKER_DELAY_BETWEEN_CALLS_MS ?? 100);
                    if (delayMs > 0) {
                        await new Promise((resolve) => setTimeout(resolve, delayMs));
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    console.error(`[Dispatch] Falha ao processar chamada #${call.id} (${call.customerNumber}):`, message);
                    const permanent = error instanceof DebtProvider_1.DebtProviderPermanentError;
                    const temporary = error instanceof DebtProvider_1.DebtProviderTemporaryError;
                    const isSipTimeout = message.includes('408') || message.includes('timeout') || message.includes('providerfault');
                    const exhausted = call.attempts + 1 >= campaign.maxAttempts;
                    if ((permanent || exhausted) && !isSipTimeout) {
                        await this.calls.updateStatus(call.id, 'failed', message);
                        result.failed += 1;
                    }
                    else {
                        const retryAt = isSipTimeout
                            ? new Date(Date.now() + 15 * 60 * 1000)
                            : this.retryPolicy.nextAttempt(call.attempts);
                        const reason = isSipTimeout ? `sip_timeout_auto_retry: ${message}` : (temporary ? `ddm_temporary: ${message}` : message);
                        await this.calls.scheduleRetry(call.id, retryAt, reason);
                        result.retries += 1;
                    }
                }
            }
        };
        // Roda os 10 workers em paralelo
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        return result;
    }
}
exports.DispatchCampaignBatch = DispatchCampaignBatch;
//# sourceMappingURL=DispatchCampaignBatch.js.map