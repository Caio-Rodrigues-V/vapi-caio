export type AssistantResolverOptions = {
  uvaAssistantId?: string;
  cruzeiroAssistantId?: string;
};

export class AssistantResolver {
  constructor(private readonly options: AssistantResolverOptions) {}

  resolve(institution?: string | null): string {
    const instUpper = (institution || '').toUpperCase();
    if (instUpper.includes('CRUZEIRO')) {
      return process.env.VAPI_ASSISTANT_ID_CRUZEIRO || this.options.cruzeiroAssistantId || '2';
    }
    return process.env.DEFAULT_ASSISTANT_ID || process.env.VAPI_ASSISTANT_ID_UVA || this.options.uvaAssistantId || '2';
  }
}
