import axios, { AxiosInstance } from 'axios';
import { DebtLookupResult, DebtProvider } from '../../core/debt/DebtProvider';

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '').padStart(11, '0');
}

export type DdmDebtProviderOptions = {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
  lookupPath?: string;
};

export class DdmDebtProvider implements DebtProvider {
  private readonly client: AxiosInstance;
  private readonly lookupPath: string;

  constructor(options: DdmDebtProviderOptions) {
    if (!options.baseUrl) throw new Error('DDM_API_URL não configurada.');
    if (!options.token) throw new Error('DDM_API_TOKEN não configurado.');

    this.lookupPath = options.lookupPath || '/consulta-debito/{cpf}';
    this.client = axios.create({
      baseURL: options.baseUrl.replace(/\/$/, ''),
      timeout: options.timeoutMs ?? 20_000,
      headers: {
        Authorization: `Bearer ${options.token}`,
        Accept: 'application/json',
      },
    });
  }

  async lookup(cpfInput: string): Promise<DebtLookupResult> {
    const cpf = normalizeCpf(cpfInput);
    if (cpf.length !== 11) throw new Error('CPF inválido para consulta DDM.');

    const path = this.lookupPath.replace('{cpf}', encodeURIComponent(cpf));
    const response = await this.client.get(path);
    const data = (response.data || {}) as Record<string, unknown>;

    const hasDebt = data.hasDebt === true || data.possuiDebito === true || data.tem_debito === true;
    const amountRaw = data.amount ?? data.valorDebito ?? data.valor_debito;
    const amount = amountRaw === undefined || amountRaw === null ? null : Number(amountRaw);

    return {
      cpf,
      hasDebt,
      amount: Number.isFinite(amount) ? amount : null,
      institution: String(data.institution ?? data.instituicao ?? '') || null,
      raw: data,
    };
  }
}
