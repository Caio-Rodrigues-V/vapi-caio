"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VapiPhoneProvider = void 0;
const axios_1 = __importDefault(require("axios"));
class VapiPhoneProvider {
    name = 'vapi';
    channel = 'phone';
    client;
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('VAPI_API_KEY não configurada.');
        }
        this.client = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            timeout: 30_000,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
    }
    async startCall(input) {
        if (!input.phoneNumberId) {
            throw new Error('phoneNumberId é obrigatório para chamadas telefônicas.');
        }
        const customer = {
            number: input.customerNumber,
        };
        if (input.customerName?.trim()) {
            customer.name = input.customerName.trim();
        }
        const overrides = {};
        if (input.firstMessage?.trim()) {
            overrides.firstMessage = input.firstMessage.trim();
            overrides.firstMessageMode = 'assistant-speaks-first';
            overrides.silenceTimeoutSeconds = 12;
            overrides.maxDurationSeconds = 600;
        }
        if (input.variableValues && Object.keys(input.variableValues).length > 0) {
            overrides.variableValues = input.variableValues;
        }
        const webhookUrl = process.env.VAPI_WEBHOOK_URL ||
            (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/api/v2/vapi/webhook` :
                (process.env.NODE_ENV === 'staging' ? 'https://hml-vapi.grupoddm.com.br/api/v2/vapi/webhook' : undefined));
        if (webhookUrl) {
            overrides.serverUrl = webhookUrl;
        }
        const payload = {
            assistantId: input.assistantId,
            phoneNumberId: input.phoneNumberId,
            customer,
            metadata: input.metadata,
        };
        if (Object.keys(overrides).length > 0) {
            payload.assistantOverrides = overrides;
        }
        const response = await this.client.post('/call/phone', payload);
        const providerCallId = String(response.data?.id || '');
        if (!providerCallId) {
            throw new Error('A Vapi não retornou o identificador da chamada.');
        }
        return {
            providerCallId,
            status: 'queued',
            provider: this.name,
        };
    }
    async getCallStatus(providerCallId) {
        const response = await this.client.get(`/call/${providerCallId}`);
        const status = String(response.data?.status || '').toLowerCase();
        const statusMap = {
            queued: 'queued',
            ringing: 'ringing',
            'in-progress': 'in_progress',
            ended: 'completed',
            completed: 'completed',
            failed: 'failed',
        };
        return statusMap[status] || 'unknown';
    }
}
exports.VapiPhoneProvider = VapiPhoneProvider;
//# sourceMappingURL=VapiPhoneProvider.js.map