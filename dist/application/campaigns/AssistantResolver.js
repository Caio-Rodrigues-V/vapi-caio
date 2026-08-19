"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantResolver = void 0;
class AssistantResolver {
    options;
    constructor(options) {
        this.options = options;
        if (!options.uvaAssistantId) {
            throw new Error('VAPI_ASSISTANT_ID_UVA não configurado.');
        }
    }
    resolve(institution) {
        const instUpper = (institution || '').toUpperCase();
        if (instUpper.includes('CRUZEIRO')) {
            return process.env.VAPI_ASSISTANT_ID_CRUZEIRO || this.options.cruzeiroAssistantId || this.options.uvaAssistantId;
        }
        return this.options.uvaAssistantId;
    }
}
exports.AssistantResolver = AssistantResolver;
//# sourceMappingURL=AssistantResolver.js.map