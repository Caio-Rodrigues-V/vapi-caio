import axios from 'axios';

// Variáveis fictícias, precisam ser configuradas depois no .env
const DDM_API_URL = process.env.DDM_API_URL || 'https://api.exemplo-ddm.com/v1';
const DDM_API_TOKEN = process.env.DDM_API_TOKEN || '';

/**
 * Consulta se um CPF possui débito na base do DDM Acordos.
 * @param cpf O CPF a ser consultado
 * @returns true se tiver débito, false se não tiver
 */
export async function verificarDebito(cpf: string): Promise<boolean> {
  if (!DDM_API_TOKEN) {
    console.warn('DDM_API_TOKEN não configurado. Assumindo que tem débito por padrão para testes.');
    return true; 
  }

  try {
    const response = await axios.get(`${DDM_API_URL}/consulta-debito/${cpf}`, {
      headers: {
        Authorization: `Bearer ${DDM_API_TOKEN}`,
      },
    });

    // A lógica de retorno exata depende da documentação do DDM
    // Assumindo que retorna { hasDebt: true/false }
    return response.data.hasDebt === true;
  } catch (error: any) {
    console.error(`Erro ao consultar CPF ${cpf} no DDM:`, error.message);
    // Em caso de erro na API, por segurança, podemos considerar que tem débito
    // para não pular ligações importantes, ou vice-versa.
    return true;
  }
}
