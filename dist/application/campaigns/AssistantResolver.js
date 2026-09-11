"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantResolver = void 0;
class AssistantResolver {
    options;
    constructor(options) {
        this.options = options;
    }
    resolve(institution) {
        const instUpper = (institution || '').toUpperCase();
        if (instUpper.includes('CRUZEIRO')) {
            return process.env.VAPI_ASSISTANT_ID_CRUZEIRO || this.options.cruzeiroAssistantId || '2';
        }
        return process.env.DEFAULT_ASSISTANT_ID || process.env.VAPI_ASSISTANT_ID_UVA || this.options.uvaAssistantId || '2';
    }
}
exports.AssistantResolver = AssistantResolver;
//# sourceMappingURL=AssistantResolver.js.map