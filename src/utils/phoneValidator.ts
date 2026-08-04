const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function expandScientificNotation(value: string): string | null {
  const normalized = value.trim().replace(',', '.');

  if (!/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) {
    return value;
  }

  const [mantissa = ''] = normalized.toLowerCase().split('e');
  const significantDigits = mantissa.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '');

  // Um telefone brasileiro com DDI possui 12 ou 13 dígitos. Quando o Excel
  // reduz a mantissa (ex.: 5.52198E+12), os dígitos finais já foram perdidos.
  // Nessa situação é mais seguro rejeitar a linha do que ligar para outro número.
  if (significantDigits.length < 12) {
    return null;
  }

  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue) || !Number.isSafeInteger(numericValue)) {
    return null;
  }

  return numericValue.toFixed(0);
}

/**
 * Normaliza um telefone brasileiro para E.164 (+55...).
 * Aceita formatos locais, com código do país e notação científica somente
 * quando todos os dígitos necessários foram preservados pela planilha.
 */
export function normalizePhone(phone: string): string | null {
  const expanded = expandScientificNotation(String(phone));
  if (!expanded) return null;

  let digits = expanded.replace(/\D/g, '');

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length !== 10 && digits.length !== 11) {
    return null;
  }

  const ddd = Number(digits.slice(0, 2));
  if (!VALID_DDDS.has(ddd)) {
    return null;
  }

  const subscriber = digits.slice(2);

  if (digits.length === 11 && !subscriber.startsWith('9')) {
    return null;
  }

  if (digits.length === 10) {
    const firstDigit = Number(subscriber[0]);
    if (firstDigit < 2 || firstDigit > 8) {
      return null;
    }
  }

  return `+55${digits}`;
}
