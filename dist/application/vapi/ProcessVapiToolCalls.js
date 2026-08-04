"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processVapiToolCalls = processVapiToolCalls;
function asRecord(value) {
    return value && typeof value === 'object' ? value : {};
}
function normalizeToolCalls(payload) {
    const message = asRecord(payload.message ?? payload);
    const directList = Array.isArray(message.toolCallList) ? message.toolCallList : [];
    if (directList.length) {
        return directList
            .map((item) => {
            const call = asRecord(item);
            const fn = asRecord(call.function);
            return {
                id: String(call.id || fn.id || ''),
                name: String(call.name || fn.name || ''),
                parameters: asRecord(call.parameters ?? fn.parameters ?? fn.arguments),
            };
        })
            .filter((call) => call.id && call.name);
    }
    const wrappedList = Array.isArray(message.toolWithToolCallList)
        ? message.toolWithToolCallList
        : [];
    return wrappedList
        .map((item) => {
        const wrapped = asRecord(item);
        const toolCall = asRecord(wrapped.toolCall);
        const fn = asRecord(toolCall.function);
        return {
            id: String(toolCall.id || ''),
            name: String(wrapped.name || toolCall.name || fn.name || ''),
            parameters: asRecord(toolCall.parameters ?? fn.parameters ?? fn.arguments),
        };
    })
        .filter((call) => call.id && call.name);
}
const spokenDigits = {
    zero: '0',
    um: '1',
    uma: '1',
    dois: '2',
    duas: '2',
    tres: '3',
    três: '3',
    quatro: '4',
    cinco: '5',
    seis: '6',
    sete: '7',
    oito: '8',
    nove: '9',
};
function extractCpfPrefix(parameters) {
    const raw = String(parameters.rawTranscript ??
        parameters.transcript ??
        parameters.texto ??
        parameters.fala ??
        parameters.input ??
        '').trim();
    if (!raw)
        return '';
    const digits = [];
    const tokens = raw
        .toLocaleLowerCase('pt-BR')
        .replace(/[.,;:!?()\[\]{}\-_/\\]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
    for (const token of tokens) {
        const numeric = token.replace(/\D/g, '');
        if (numeric) {
            digits.push(...numeric.split(''));
        }
        else if (spokenDigits[token]) {
            digits.push(spokenDigits[token]);
        }
        if (digits.length >= 3)
            break;
    }
    return digits.length >= 3 ? digits.slice(0, 3).join('') : '';
}
function handleToolCall(call) {
    switch (call.name) {
        case 'capturar_cpf': {
            const cpfPrefixo3 = extractCpfPrefix(call.parameters);
            return {
                name: call.name,
                toolCallId: call.id,
                result: JSON.stringify({
                    cpf_prefixo3: cpfPrefixo3,
                    reconhecido: cpfPrefixo3.length === 3,
                }),
            };
        }
        case 'voicemail_tool':
            return {
                name: call.name,
                toolCallId: call.id,
                result: JSON.stringify({
                    voicemail: true,
                    action: 'end_call_immediately',
                }),
            };
        default:
            return {
                name: call.name,
                toolCallId: call.id,
                result: JSON.stringify({
                    ok: false,
                    error: `Tool não suportada pelo backend: ${call.name}`,
                }),
            };
    }
}
function processVapiToolCalls(payload) {
    const calls = normalizeToolCalls(payload);
    return { results: calls.map(handleToolCall) };
}
//# sourceMappingURL=ProcessVapiToolCalls.js.map