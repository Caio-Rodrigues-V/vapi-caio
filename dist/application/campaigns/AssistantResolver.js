"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantResolver = void 0;
class AssistantResolver {
    options;
    constructor(options) {
        this.options = options;
        if (!options.defaultAssistantId) {
            throw new Error('VAPI_ASSISTANT_ID não configurado.');
        }
    }
    resolve(institution) {
        const normalized = String(institution || '').toLowerCase();
        if (normalized.includes('cruzeiro')) {
            return this.options.cruzeiroAssistantId || this.options.defaultAssistantId;
        }
        return this.options.ddmAssistantId || this.options.defaultAssistantId;
    }
}
exports.AssistantResolver = AssistantResolver;
//# sourceMappingURL=AssistantResolver.js.map