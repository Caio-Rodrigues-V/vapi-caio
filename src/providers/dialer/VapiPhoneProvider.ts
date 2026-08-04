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
      baseURL: 'https://api.vapi.ai',
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

    const payload: Record<string, unknown> = {
      assistantId: input.assistantId,
      phoneNumberId: input.phoneNumberId,
      customer,
      metadata: input.metadata,
    };

    if (input.variableValues && Object.keys(input.variableValues).length > 0) {
      payload.assistantOverrides = {
        variableValues: input.variableValues,
      };
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
