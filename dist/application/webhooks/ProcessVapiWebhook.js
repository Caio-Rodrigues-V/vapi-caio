"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessVapiWebhook = void 0;
const llmClassifier_1 = require("../../services/llmClassifier");
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
class ProcessVapiWebhook {
    repository;
    constructor(repository) {
        this.repository = repository;
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
            const classification = await (0, llmClassifier_1.classificarLigacao)(transcript, customerMessages);
            const decision = classification.decisao === 'Formaliza'
                ? 'formalize'
                : classification.decisao === 'Agendar' ? 'schedule' : 'zero';
            const scheduledAt = classification.dataAgendamento ? new Date(classification.dataAgendamento) : null;
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