type ToolCall = {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
};

type ToolResult = {
  name: string;
  toolCallId: string;
  result: string;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function normalizeToolCalls(payload: Record<string, unknown>): ToolCall[] {
  const message = asRecord(payload.message ?? payload);
  const directList = Array.isArray(message.toolCallList) ? message.toolCallList : [];

  if (directList.length) {
    return directList
      .map((item: unknown) => {
        const call = asRecord(item);
        const fn = asRecord(call.function);
        return {
          id: String(call.id || fn.id || ''),
          name: String(call.name || fn.name || ''),
          parameters: asRecord(call.parameters ?? fn.parameters ?? fn.arguments),
        };
      })
      .filter((call: ToolCall) => call.id && call.name);
  }

  const wrappedList = Array.isArray(message.toolWithToolCallList)
    ? message.toolWithToolCallList
    : [];

  return wrappedList
    .map((item: unknown) => {
      const wrapped = asRecord(item);
      const toolCall = asRecord(wrapped.toolCall);
      const fn = asRecord(toolCall.function);
      return {
        id: String(toolCall.id || ''),
        name: String(wrapped.name || toolCall.name || fn.name || ''),
        parameters: asRecord(toolCall.parameters ?? fn.parameters ?? fn.arguments),
      };
    })
    .filter((call: ToolCall) => call.id && call.name);
}

const spokenDigits: Record<string, string> = {
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

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function extractCpfPrefix(parameters: Record<string, unknown>): string {
  const directPrefix = digitsOnly(parameters.cpf_prefixo3);
  if (directPrefix.length >= 3) return directPrefix.slice(0, 3);

  const raw = String(
    parameters.rawTranscript ??
    parameters.transcript ??
    parameters.texto ??
    parameters.fala ??
    parameters.input ??
    '',
  ).trim();

  if (!raw) return '';

  const digits: string[] = [];
  const tokens = raw
    .toLocaleLowerCase('pt-BR')
    .replace(/[.,;:!?()\[\]{}\-_/\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const numeric = token.replace(/\D/g, '');
    if (numeric) {
      digits.push(...numeric.split(''));
    } else if (spokenDigits[token]) {
      digits.push(spokenDigits[token]);
    }

    if (digits.length >= 3) break;
  }

  return digits.length >= 3 ? digits.slice(0, 3).join('') : '';
}

function handleToolCall(call: ToolCall): ToolResult {
  switch (call.name) {
    case 'capturar_cpf': {
      const cpfPrefixo3 = extractCpfPrefix(call.parameters);
      const cpfEsperado = digitsOnly(call.parameters.cpf_esperado);
      const esperadoValido = cpfEsperado.length === 11;
      const reconhecido = cpfPrefixo3.length === 3;
      const confere = reconhecido && esperadoValido
        ? cpfPrefixo3 === cpfEsperado.slice(0, 3)
        : false;

      return {
        name: call.name,
        toolCallId: call.id,
        result: JSON.stringify({
          cpf_prefixo3: cpfPrefixo3,
          reconhecido,
          cpf_esperado_valido: esperadoValido,
          confere,
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

    case 'confirmar_acordo':
      return {
        name: call.name,
        toolCallId: call.id,
        result: JSON.stringify({
          ok: true,
          status: 'acordo_confirmado_realtime',
        }),
      };

    case 'end_call_tool':
      return {
        name: call.name,
        toolCallId: call.id,
        result: JSON.stringify({
          ok: true,
          status: 'end_call_requested',
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

export function processVapiToolCalls(
  payload: Record<string, unknown>,
): { results: ToolResult[] } {
  const calls = normalizeToolCalls(payload);
  return { results: calls.map(handleToolCall) };
}
