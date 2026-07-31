/**
 * Normaliza um número de telefone brasileiro para o formato E.164 (+55...).
 * Lida com código do país opcional, valida DDDs e regra do dígito 9.
 * 
 * @param phone string com o telefone
 * @returns telefone formatado em E.164 ou null se inválido
 */
export function normalizePhone(phone: string): string | null {
  // Remove todos os caracteres não numéricos
  let digits = phone.replace(/[^\d]/g, '');

  // Remove o código do país se começar com 55 (assumindo apenas Brasil)
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.substring(2);
  }

  // Se após limpar, não tiver tamanho de fixo (10) ou móvel (11), é inválido
  if (digits.length !== 10 && digits.length !== 11) {
    return null;
  }

  const ddd = parseInt(digits.substring(0, 2), 10);
  
  // Lista de DDDs válidos no Brasil
  const validDDDs = [
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99
  ];

  if (!validDDDs.includes(ddd)) {
    return null;
  }

  const numberPart = digits.substring(2);

  if (digits.length === 11) {
    // Móvel: deve começar com 9
    if (!numberPart.startsWith('9')) {
      return null;
    }
  } else if (digits.length === 10) {
    // Fixo: não pode começar com 9 (embora algumas raras exceções antigas existam,
    // o padrão da Anatel diz que fixos começam de 2 a 5)
    const firstDigit = parseInt(numberPart.substring(0, 1), 10);
    if (firstDigit < 2 || firstDigit > 8) {
      return null;
    }
  }

  return `+55${digits}`;
}
