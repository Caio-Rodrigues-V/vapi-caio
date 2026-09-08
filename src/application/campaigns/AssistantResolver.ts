export type AssistantResolverOptions = {
  uvaAssistantId: string;
  cruzeiroAssistantId?: string;
};

export class AssistantResolver {
  constructor(private readonly options: AssistantResolverOptions) {
    if (!options.uvaAssistantId) {
      throw new Error('VAPI_ASSISTANT_ID_UVA não configurado.');
    }
  }

  resolve(institution?: string | null): string {
    const instUpper = (institution || '').toUpperCase();
    if (instUpper.includes('CRUZEIRO')) {
      return process.env.VAPI_ASSISTANT_ID_CRUZEIRO || this.options.cruzeiroAssistantId || 'd0e0eea1-2e61-4ae5-91b8-85e29ba8e60f';
    }
    return this.options.uvaAssistantId;
  }
}
