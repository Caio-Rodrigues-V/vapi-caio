"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessVapiWebhook = void 0;
const llmClassifier_1 = require("../../services/llmClassifier");
const NotificationSender_1 = require("../../providers/notifications/NotificationSender");
function asRecord(value) {
    return value && typeof value === 'object' ? value : {};
}
function mapStatus(type, message) {
    const normalized = type.toLowerCase();
    if (normalized.includes('status-update')) {
        const status = String(message.status || message.call?.status || '').toLowerCase();
        if (status === 'queued')
            return 'queued';
        if (status === 'ringing' || status === 'in-progress')
            return 'in_progress';
        if (status === 'answered')
            return 'answered';
        if (status === 'ended' || status === 'completed')
            return 'completed';
        if (status === 'failed')
            return 'failed';
    }
    if (normalized === 'end-of-call-report')
        return 'completed';
    return null;
}
function wasToolCalled(messages, toolName) {
    if (!Array.isArray(messages))
        return false;
    return messages.some((m) => {
        if (m.role === 'tool_calls' && Array.isArray(m.toolCalls)) {
            return m.toolCalls.some((tc) => tc.function?.name === toolName);
        }
        return false;
    });
}
class ProcessVapiWebhook {
    repository;
    debts;
    constructor(repository, debts) {
        this.repository = repository;
        this.debts = debts;
    }
    async execute(payload) {
        const message = asRecord(payload.message ?? payload);
        const type = String(message.type || 'unknown');
        const call = asRecord(message.call);
        const providerCallId = String(call.id || message.callId || '');
        if (!providerCallId)
            throw new Error('Webhook sem identificador da chamada.');
        const eventId = String(message.id || message.eventId || `${providerCallId}:${type}`);
        const inserted = await this.repository.registerEvent({
            provider: 'vapi', eventId, providerCallId, eventType: type, payload,
        });
        if (!inserted)
            return { duplicate: true, processed: false };
        try {
            const status = mapStatus(type, message);
            if (status)
                await this.repository.markCallStatus(providerCallId, status);
            if (type !== 'end-of-call-report') {
                await this.repository.markEventProcessed('vapi', eventId);
                return { duplicate: false, processed: true };
            }
            const metadata = asRecord(call.metadata || message.metadata);
            const metadataCallId = Number(metadata.campaignCallId || metadata.campaign_call_id || 0) || undefined;
            const campaignCallId = await this.repository.findCampaignCallId(providerCallId, metadataCallId);
            if (!campaignCallId)
                throw new Error('campaign_call não localizado para o webhook.');
            const transcript = String(message.transcript || message.artifact?.transcript || '');
            const messages = Array.isArray(message.artifact?.messages) ? message.artifact.messages : [];
            const customerMessages = messages
                .filter((item) => item?.role === 'user' || item?.role === 'customer')
                .map((item) => String(item.message || item.content || ''))
                .filter(Boolean);
            if (!customerMessages.length && transcript)
                customerMessages.push(transcript);
            // 1. Check if the call triggered the 'confirmar_acordo' tool call in the messages history
            const agreementConfirmedByTool = wasToolCalled(messages, 'confirmar_acordo');
            const agendamentoTriggeredByTool = transcript.includes('#AGENDAMENTO');
            let decision = 'zero';
            let scheduledAt = null;
            if (agreementConfirmedByTool) {
                decision = 'formalize';
                console.log(`[ProcessVapiWebhook] Acordo formalizado em tempo real via ferramenta (confirmar_acordo) para a chamada ${providerCallId}`);
            }
            else if (agendamentoTriggeredByTool) {
                decision = 'schedule';
                scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                console.log(`[ProcessVapiWebhook] Agendamento detectado via tags no transcript para a chamada ${providerCallId}`);
            }
            else if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'dummy_key') {
                try {
                    const classification = await (0, llmClassifier_1.classificarLigacao)(transcript, customerMessages);
                    decision = classification.decisao === 'Formaliza'
                        ? 'formalize'
                        : classification.decisao === 'Agendar' ? 'schedule' : 'zero';
                    scheduledAt = classification.dataAgendamento ? new Date(classification.dataAgendamento) : null;
                }
                catch (err) {
                    console.error('[ProcessVapiWebhook] Erro ao classificar ligacao via LLM, fallback para "zero":', err.message);
                }
            }
            else {
                console.log(`[ProcessVapiWebhook] OPENAI_API_KEY nao configurada. Mantendo decisao como 'zero' para a chamada ${providerCallId}`);
            }
            const startedAt = call.startedAt ? new Date(call.startedAt).getTime() : NaN;
            const endedAt = call.endedAt ? new Date(call.endedAt).getTime() : NaN;
            const durationSeconds = Number.isFinite(startedAt) && Number.isFinite(endedAt)
                ? Math.max(0, Math.round((endedAt - startedAt) / 1000))
                : Number(message.durationSeconds || call.durationSeconds || 0) || null;
            const recordingUrl = String(message.recordingUrl || message.artifact?.recordingUrl || message.artifact?.recording?.url || '') || null;
            await this.repository.saveCallResult({
                campaignCallId,
                providerCallId,
                decision,
                scheduledCallbackAt: scheduledAt,
                durationSeconds,
                recordingUrl,
                transcript: transcript || null,
                endedReason: String(message.endedReason || call.endedReason || '') || null,
                rawPayload: payload,
            });
            if (decision === 'schedule' && scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
                await this.repository.scheduleCallbackFromCall(campaignCallId, scheduledAt);
            }
            if (decision === 'formalize' && this.debts) {
                try {
                    console.log(`[ProcessVapiWebhook] Iniciando formalização DDM para campaignCallId: ${campaignCallId}`);
                    const callDetails = await this.repository.findCampaignCall(campaignCallId);
                    if (callDetails) {
                        const debtorId = callDetails.metadata?.calculationId;
                        const cpf = callDetails.cpf;
                        if (debtorId && cpf) {
                            const institutionName = String(callDetails.metadata?.institution || '');
                            const client = institutionName.toLowerCase().includes('cruzeiro') ? 'cruzeiro' : 'ddm';
                            console.log(`[ProcessVapiWebhook] Chamando efetiva_acordo.php p/ debtorId: ${debtorId}, cli: ${client}`);
                            const agreement = await this.debts.formalize(debtorId, client);
                            const sender = new NotificationSender_1.NotificationSender();
                            await sender.send({
                                cpf,
                                nome: callDetails.metadata?.debtorName || callDetails.metadata?.name || 'Cliente',
                                email: callDetails.metadata?.email || null,
                                phone: callDetails.customerNumber || null,
                                instituicao: institutionName || 'DDM Credores',
                                valor: agreement.valor ? agreement.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (callDetails.metadata?.cashAmount?.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'),
                                formaPagamento: 'À vista',
                                linkBoleto: agreement.linkBoleto,
                                linkPix: agreement.linkPix,
                                linhaDigitavel: agreement.linhaDigitavel,
                                vencimento: agreement.vencimento,
                                numeroAcordo: agreement.numeroAcordo,
                                vapiCallId: providerCallId,
                                pagamentoPronto: Boolean(agreement.linkBoleto || agreement.linkPix || agreement.linhaDigitavel),
                            });
                        }
                        else {
                            console.warn('[ProcessVapiWebhook] calculationId ou CPF ausentes nos metadados. Não foi possível formalizar.');
                        }
                    }
                }
                catch (formError) {
                    console.error('[ProcessVapiWebhook] Falha ao processar formalização/email:', formError.message);
                }
            }
            await this.repository.markEventProcessed('vapi', eventId);
            return { duplicate: false, processed: true };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.repository.markEventProcessed('vapi', eventId, message);
            throw error;
        }
    }
}
exports.ProcessVapiWebhook = ProcessVapiWebhook;
//# sourceMappingURL=ProcessVapiWebhook.js.map