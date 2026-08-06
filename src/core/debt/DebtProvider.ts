export type DebtInstallment = {
  number: number;
  amount: number;
  dueDate?: string | null;
};

export type DebtLookupResult = {
  cpf: string;
  hasDebt: boolean;
  institution?: string | null;
  debtorName?: string | null;
  debtorId?: string | null;
  calculationId?: string | null;
  nominalAmount?: number | null;
  cashAmount?: number | null;
  firstDueDate?: string | null;
  email?: string | null;
  installments: DebtInstallment[];
  raw: Record<string, unknown>;
  skipReason?: 'no_debt' | 'already_has_agreement' | null;
};

export type FormalizeAgreementResult = {
  linkBoleto: string | null;
  linkPix: string | null;
  linhaDigitavel: string | null;
  vencimento: string | null;
  numeroAcordo: string | null;
  valor: number | null;
  raw: any;
};

export class DebtProviderTemporaryError extends Error {
  readonly retryable = true;
}

export class DebtProviderPermanentError extends Error {
  readonly retryable = false;
}

export interface DebtProvider {
  lookup(cpf: string): Promise<DebtLookupResult>;
  formalize(debtorId: string, client: string, installments?: number): Promise<FormalizeAgreementResult>;
}
