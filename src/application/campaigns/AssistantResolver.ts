export type AssistantResolverOptions = {
  uvaAssistantId: string;
};

export class AssistantResolver {
  constructor(private readonly options: AssistantResolverOptions) {
    if (!options.uvaAssistantId) {
      throw new Error('VAPI_ASSISTANT_ID_UVA não configurado.');
    }
  }

  resolve(): string {
    return this.options.uvaAssistantId;
  }
}
