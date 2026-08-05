export type DialerChannel = 'phone' | 'whatsapp';

export type StartCallInput = {
  customerNumber: string;
  customerName?: string;
  assistantId: string;
  phoneNumberId?: string;
  firstMessage?: string;
  variableValues?: Record<string, string | number | boolean>;
  metadata: Record<string, unknown>;
};

export type StartCallResult = {
  providerCallId: string;
  status: 'queued' | 'started';
  provider: string;
};

export type ProviderCallStatus =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'unknown';

export interface DialerProvider {
  readonly name: string;
  readonly channel: DialerChannel;

  startCall(input: StartCallInput): Promise<StartCallResult>;
  getCallStatus(providerCallId: string): Promise<ProviderCallStatus>;
}
