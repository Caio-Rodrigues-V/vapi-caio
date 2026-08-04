export type AssistantResolverOptions = {
  defaultAssistantId: string;
  cruzeiroAssistantId?: string;
  ddmAssistantId?: string;
};

export class AssistantResolver {
  constructor(private readonly options: AssistantResolverOptions) {
    if (!options.defaultAssistantId) {
      throw new Error('VAPI_ASSISTANT_ID não configurado.');
    }
  }

  resolve(institution?: string | null): string {
    const normalized = String(institution || '').toLowerCase();
    if (normalized.includes('cruzeiro')) {
      return this.options.cruzeiroAssistantId || this.options.defaultAssistantId;
    }
    return this.options.ddmAssistantId || this.options.defaultAssistantId;
  }
}
