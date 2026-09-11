import axios, { AxiosInstance } from 'axios';
import {
  DialerProvider,
  ProviderCallStatus,
  StartCallInput,
  StartCallResult,
} from '../../core/dialer/DialerProvider';

export class VapiPhoneProvider implements DialerProvider {
  readonly name = 'vapi';
  readonly channel = 'phone' as const;

  private readonly client: AxiosInstance;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('VAPI_API_KEY não configurada.');
    }

    this.client = axios.create({
      baseURL: process.env.DIALOG_DDM_BASE_URL || process.env.VAPI_BASE_URL || 'https://dialddm.grupoddm.ia.br/v1',
      timeout: 30_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async startCall(input: StartCallInput): Promise<StartCallResult> {
    if (!input.phoneNumberId) {
      throw new Error('phoneNumberId é obrigatório para chamadas telefônicas.');
    }

    const customer: Record<string, string> = {
      number: input.customerNumber,
    };

    if (input.customerName?.trim()) {
      customer.name = input.customerName.trim();
    }

    const overrides: Record<string, any> = {};
    if (input.firstMessage?.trim()) {
      overrides.firstMessage = input.firstMessage.trim();
      overrides.firstMessageMode = 'assistant-speaks-first';
      overrides.silenceTimeoutSeconds = 20;
      overrides.maxDurationSeconds = 600;
    }
    if (input.variableValues && Object.keys(input.variableValues).length > 0) {
      overrides.variableValues = input.variableValues;
    }

    const webhookUrl = process.env.VAPI_WEBHOOK_URL ||
      (process.env.APP_BASE_URL ? `${process.env.APP_BASE_URL}/api/v2/vapi/webhook` :
      (process.env.NODE_ENV === 'staging' ? 'https://hmlvapi.grupoddm.ia.br/api/v2/vapi/webhook' : undefined));

    if (webhookUrl) {
      overrides.serverUrl = webhookUrl;
      overrides.server = { url: webhookUrl, timeoutSeconds: 20 };
    }

    const payload: Record<string, unknown> = {
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      customer,
      metadata: input.metadata,
    };

    if (webhookUrl) {
      payload.serverUrl = webhookUrl;
    }

    const maxConcurrency = Number(process.env.VAPI_MAX_CONCURRENCY || process.env.GLOBAL_MAX_CONCURRENT || 30);
    if (maxConcurrency > 0) {
      payload.maxConcurrency = maxConcurrency;
    }

    if (Object.keys(overrides).length > 0) {
      payload.assistantOverrides = overrides;
    }

    const headers: Record<string, string> = {};
    if (maxConcurrency > 0) {
      headers['X-Max-Concurrency'] = String(maxConcurrency);
    }

    const response = await this.client.post('/call/phone', payload, { headers });

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

  async getCallStatus(providerCallId: string): Promise<ProviderCallStatus> {
    const response = await this.client.get(`/call/${providerCallId}`);
    const status = String(response.data?.status || '').toLowerCase();

    const statusMap: Record<string, ProviderCallStatus> = {
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
