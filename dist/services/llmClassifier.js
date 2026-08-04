"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.classificarLigacao = classificarLigacao;
const openai_1 = __importDefault(require("openai"));
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY || 'dummy_key',
});
/**
 * Analisa a transcrição e classifica a ligação.
 */
async function classificarLigacao(transcricao, falasCliente) {
    if (process.env.OPENAI_API_KEY === 'dummy_key' || !process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY não configurada, retornando "Zero" como fallback.');
        return { decisao: 'Zero' };
    }
    try {
        const promptClassificacao = `
      Você é um classificador de intenções pós-ligação.
      Analise a transcrição abaixo e classifique em apenas UMA das três opções:
      1. Formaliza: O cliente concordou em fechar o acordo / pagar a dívida.
      2. Agendar: O cliente pediu para ligar depois, ou em outra hora/dia.
      3. Zero: Não houve resposta útil, caixa postal, desligou na cara, ou resposta ambígua. Na dúvida, escolha "Zero".
      
      Responda apenas com a palavra da decisão (Formaliza, Agendar ou Zero).
      
      Transcrição:
      "${transcricao}"
    `;
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptClassificacao }],
            temperature: 0,
            max_tokens: 10,
        });
        const decisaoCrua = response.choices[0]?.message?.content?.trim() || '';
        let decisao = 'Zero';
        if (decisaoCrua.includes('Formaliza'))
            decisao = 'Formaliza';
        else if (decisaoCrua.includes('Agendar'))
            decisao = 'Agendar';
        let dataAgendamento;
        // Se for agendar, usa um segundo LLM ou parser apenas para as falas do cliente
        if (decisao === 'Agendar' && falasCliente.length > 0) {
            dataAgendamento = await extrairDataAgendamento(falasCliente.join('\n'));
        }
        return { decisao, dataAgendamento };
    }
    catch (error) {
        console.error('Erro na classificação com LLM:', error);
        return { decisao: 'Zero' }; // fallback defensivo
    }
}
/**
 * Extrai a data de agendamento usando LLM.
 */
async function extrairDataAgendamento(falasCliente) {
    const promptData = `
    O cliente pediu para ligar de volta. Baseado apenas no que ele disse, extraia ou calcule a data e hora de retorno.
    Regras:
    - Se não houver horário explícito, sugira daqui a 24 horas.
    - Se pedir daqui a pouco, adicione algumas horas.
    Responda EXCLUSIVAMENTE com o timestamp no formato ISO 8601 (ex: 2026-08-01T15:00:00Z).
    
    Falas do cliente:
    "${falasCliente}"
  `;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: promptData }],
            temperature: 0,
        });
        const timestampCru = response.choices[0]?.message?.content?.trim() || '';
        // Validação defensiva do timestamp
        const date = new Date(timestampCru);
        if (!isNaN(date.getTime())) {
            return date.toISOString();
        }
        else {
            console.warn('LLM retornou um timestamp inválido:', timestampCru);
            return undefined;
        }
    }
    catch (error) {
        console.error('Erro ao extrair data:', error);
        return undefined;
    }
}
//# sourceMappingURL=llmClassifier.js.map