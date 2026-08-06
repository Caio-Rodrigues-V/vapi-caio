import { randomUUID } from 'crypto';
import { CampaignCallRepository, CampaignRepository } from '../../core/campaigns/CampaignRepository';
import {
  DebtProvider,
  DebtProviderPermanentError,
  DebtProviderTemporaryError,
} from '../../core/debt/DebtProvider';
import { DialerProvider } from '../../core/dialer/DialerProvider';
import { AssistantResolver } from './AssistantResolver';
import { RetryPolicy } from './RetryPolicy';

export type DispatchCampaignBatchResult = {
  reserved: number;
  dispatched: number;
  skipped: number;
  failed: number;
  retries: number;
};

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function formatCurrency(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export class DispatchCampaignBatch {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly calls: CampaignCallRepository,
    private readonly dialer: DialerProvider,
    private readonly retryPolicy: RetryPolicy,
    private readonly debts?: DebtProvider,
    private readonly assistantResolver?: AssistantResolver,
  ) {}

  async execute(campaignId: number, capacity?: number): Promise<DispatchCampaignBatchResult> {
    const empty = { reserved: 0, dispatched: 0, skipped: 0, failed: 0, retries: 0 };
    const campaign = await this.campaigns.findById(campaignId);
    if (!campaign || campaign.status !== 'running') return empty;

    const limit = Math.max(0, Math.min(capacity ?? campaign.maxConcurrent, campaign.maxConcurrent));
    if (limit === 0) return empty;

    const batch = await this.calls.reserveBatch(campaign.id, limit, randomUUID());
    const result: DispatchCampaignBatchResult = { ...empty, reserved: batch.length };

    for (const call of batch) {
      try {
        let assistantId = campaign.assistantId;
        let debtMetadata: Record<string, unknown> = {};
        let customerName = asText(call.metadata?.name);

        if (this.debts) {
          if (!call.cpf) {
            await this.calls.updateStatus(call.id, 'skipped', 'cpf_missing');
            result.skipped += 1;
            continue;
          }

          const debt = await this.debts.lookup(call.cpf);
          if (!debt.hasDebt) {
            const reason = debt.skipReason || 'no_debt';
            await this.calls.mergeMetadata(call.id, { debtCheckedAt: new Date().toISOString(), hasDebt: false });
            await this.calls.updateStatus(call.id, 'skipped', reason);
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

        const variableValues: Record<string, string | number | boolean> = {
          instituicao: asText(debtMetadata.institution),
          Valorcpf: asText(call.cpf),
          ValorFinalAVista: formatCurrency(debtMetadata.cashAmount),
          ValorNominal: formatCurrency(debtMetadata.nominalAmount),
          PrimeiroVencimento: asText(debtMetadata.firstDueDate),
          calculationId: asText(debtMetadata.calculationId),
        };

        const sanitizedVariableValues = Object.fromEntries(
          Object.entries(variableValues).filter(([, value]) => value !== ''),
        );

        const firstName = (customerName || '').trim().split(/\s+/)[0] || '';
        const instName = String(debtMetadata.institution || 'DDM').trim();
        const firstMessage = `Oi, ${firstName || 'tudo bem'}. Aqui é a Júlia, da assessoria financeira da ${instName}. Tudo bem com você? Antes de prosseguirmos com os detalhes por segurança, você pode me confirmar apenas os três primeiros números do seu CPF?`;

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

        const delayMs = Number(process.env.WORKER_DELAY_BETWEEN_CALLS_MS || 0);
        if (delayMs > 0 && result.dispatched < batch.length) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const permanent = error instanceof DebtProviderPermanentError;
        const temporary = error instanceof DebtProviderTemporaryError;
        const exhausted = call.attempts + 1 >= campaign.maxAttempts;

        if (permanent || exhausted) {
          await this.calls.updateStatus(call.id, 'failed', message);
          result.failed += 1;
        } else {
          const reason = temporary ? `ddm_temporary: ${message}` : message;
          await this.calls.scheduleRetry(call.id, this.retryPolicy.nextAttempt(call.attempts), reason);
          result.retries += 1;
        }
      }
    }

    return result;
  }
}
