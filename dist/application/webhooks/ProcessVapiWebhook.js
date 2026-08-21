"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessVapiWebhook = void 0;
const llmClassifier_1 = require("../../services/llmClassifier");
const NotificationSender_1 = require("../../providers/notifications/NotificationSender");
const eventBroadcaster_1 = require("../../infrastructure/events/eventBroadcaster");
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
    const target = toolName.toLowerCase();
    return messages.some((m) => {
        if (!m)
            return false;
        const name = String(m.name || m.toolName || m.function?.name || '').toLowerCase();
        if (name && name.includes(target))
            return true;
        const toolCalls = Array.isArray(m.toolCalls) ? m.toolCalls : (Array.isArray(m.tool_calls) ? m.tool_calls : []);
        return toolCalls.some((tc) => {
            const tcName = String(tc.name || tc.function?.name || '').toLowerCase();
            return tcName && tcName.includes(target);
        });
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
        if (!inserted) {
            return { duplicate: true, processed: false };
        }
        const mappedStatus = mapStatus(type, message);
        if (mappedStatus) {
            try {
                await this.repository.markCallStatus(providerCallId, mappedStatus);
                eventBroadcaster_1.eventBroadcaster.broadcast('call_updated', { providerCallId, status: mappedStatus, type });
                if (type !== 'end-of-call-report') {
                    await this.repository.markEventProcessed('vapi', eventId);
                    return { duplicate: false, processed: true };
                }
                const metadata = asRecord(message.customer?.metadata ?? call.customer?.metadata ?? call.metadata ?? message.metadata);
                const metadataCallId = Number(metadata.campaignCallId || metadata.campaign_call_id || 0) || undefined;
                const campaignCallId = await this.repository.findCampaignCallId(providerCallId, metadataCallId);
                if (!campaignCallId)
                    throw new Error('campaign_call não localizado para o webhook.');
                const transcript = String(message.transcript ||
                    message.artifact?.transcript ||
                    call.transcript ||
                    call.artifact?.transcript ||
                    '');
                const rawMessages = message.artifact?.messages || message.messages || call.artifact?.messages || call.messages || [];
                const messages = Array.isArray(rawMessages) ? rawMessages : [];
                const customerMessages = messages
                    .filter((item) => item?.role === 'user' || item?.role === 'customer')
                    .map((item) => String(item.message || item.content || ''))
                    .filter(Boolean);
                if (!customerMessages.length && transcript)
                    customerMessages.push(transcript);
                // 1. Check if the call triggered an agreement tool call in the messages history
                const agreementConfirmedByTool = wasToolCalled(messages, 'confirmar_acordo') ||
                    wasToolCalled(messages, 'formalizar_acordo') ||
                    wasToolCalled(messages, 'efetivar_acordo') ||
                    wasToolCalled(messages, 'formaliza_acordo');
                const fullText = (transcript + ' ' + messages.map((m) => String(m.message || m.content || '')).join(' ')).toLowerCase();
                const assistantSpokeAgreement = messages.some((m) => {
                    const role = String(m.role || '').toLowerCase();
                    const content = String(m.message || m.content || '').toLowerCase();
                    return (role === 'assistant' || role === 'ai') && (content.includes('acordo formalizado') ||
                        content.includes('acordo fechado') ||
                        content.includes('acordo foi gerado') ||
                        content.includes('acordo gerado') ||
                        content.includes('formalizado com sucesso') ||
                        content.includes('enviado por e-mail') ||
                        content.includes('enviado para o seu e-mail') ||
                        content.includes('enviado no seu e-mail'));
                });
                const agreementInTranscript = (fullText.includes('#acordoformalizado') ||
                    fullText.includes('#acordo_formalizado') ||
                    fullText.includes('#fechado') ||
                    fullText.includes('#formalizado') ||
                    fullText.includes('#acordo') ||
                    fullText.includes('#efetivado') ||
                    fullText.includes('formaliz') ||
                    fullText.includes('acordo fechad') ||
                    fullText.includes('acordo gerad')) || (fullText.includes('acordo') && (fullText.includes('email') || fullText.includes('e-mail') || fullText.includes('boleto')));
                const agendamentoTriggeredByTool = fullText.includes('#agendamento') || fullText.includes('agendad');
                let decision = 'zero';
                let scheduledAt = null;
                if (agreementConfirmedByTool || assistantSpokeAgreement || agreementInTranscript) {
                    decision = 'formalize';
                    console.log(`[ProcessVapiWebhook] Acordo formalizado detectado (#ACORDOFORMALIZADO) para a chamada ${providerCallId}`);
                }
                else if (agendamentoTriggeredByTool) {
                    decision = 'schedule';
                    scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    console.log(`[ProcessVapiWebhook] Agendamento detectado (#AGENDAMENTO) para a chamada ${providerCallId}`);
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
                const recordingUrl = String(message.presignedMonoUrl ||
                    message.presignedStereoUrl ||
                    message.recordingUrl ||
                    message.stereoRecordingUrl ||
                    message.artifact?.recordingUrl ||
                    message.artifact?.stereoRecordingUrl ||
                    message.artifact?.recording?.url ||
                    call.recordingUrl ||
                    call.stereoRecordingUrl ||
                    '').trim() || null;
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
                eventBroadcaster_1.eventBroadcaster.broadcast('call_updated', {
                    campaignCallId,
                    providerCallId,
                    status: 'completed',
                    decision,
                    durationSeconds,
                    endedReason: message.endedReason || call.endedReason,
                });
                if (decision === 'schedule' && scheduledAt && !Number.isNaN(scheduledAt.getTime())) {
                    await this.repository.scheduleCallbackFromCall(campaignCallId, scheduledAt);
                }
                if (decision === 'formalize' && this.debts) {
                    // Processa a formalização DDM e notificação de forma assíncrona para responder ao webhook da Vapi em milissegundos sem estourar o timeout de 30s
                    void (async () => {
                        try {
                            console.log(`[ProcessVapiWebhook] [Async] Iniciando formalização DDM para campaignCallId: ${campaignCallId}`);
                            const callDetails = await this.repository.findCampaignCall(campaignCallId);
                            if (callDetails) {
                                const cpf = callDetails.cpf;
                                if (cpf) {
                                    let debtorId = callDetails.metadata?.debtorId;
                                    if (!debtorId) {
                                        console.log(`[ProcessVapiWebhook] debtorId não encontrado no metadata. Buscando via localiza_dev para CPF: ${cpf}...`);
                                        const lookupRes = await this.debts.lookup(cpf);
                                        debtorId = lookupRes.debtorId;
                                    }
                                    if (!debtorId) {
                                        console.error(`[ProcessVapiWebhook] Não foi possível localizar o debtorId para o CPF ${cpf} na DDM.`);
                                        return;
                                    }
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
                                    console.log(`[ProcessVapiWebhook] [Async] Formalização concluída com sucesso para campaignCallId: ${campaignCallId}`);
                                }
                            }
                        }
                        catch (formError) {
                            console.error('[ProcessVapiWebhook] [Async] Falha ao processar formalização DDM/email em background:', formError.message);
                        }
                    })();
                }
                // Send callback notification if callbackUrl is present in metadata
                try {
                    const callDetails = await this.repository.findCampaignCall(campaignCallId);
                    const callbackUrl = callDetails?.metadata?.callbackUrl;
                    if (callbackUrl && typeof callbackUrl === 'string' && callbackUrl.startsWith('http')) {
                        console.log(`[ProcessVapiWebhook] Enviando callback de chamada para: ${callbackUrl}`);
                        const { default: axios } = await import('axios');
                        await axios.post(callbackUrl, {
                            contactId: callDetails.metadata?.contactId || null,
                            campaignContactId: callDetails.metadata?.campaignContactId || null,
                            campaignId: callDetails.metadata?.externalCampaignId || callDetails.campaignId,
                            customerNumber: callDetails.customerNumber,
                            cpf: callDetails.cpf,
                            status: 'completed',
                            decision,
                            durationSeconds,
                            recordingUrl,
                            transcript: transcript || null,
                            endedReason: message.endedReason || call.endedReason || null,
                            vapiCallId: providerCallId,
                        }, { timeout: 7000 });
                    }
                }
                catch (cbErr) {
                    console.error('[ProcessVapiWebhook] Erro ao enviar callback:', cbErr.message);
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
        return { duplicate: false, processed: true };
    }
}
exports.ProcessVapiWebhook = ProcessVapiWebhook;
//# sourceMappingURL=ProcessVapiWebhook.js.map