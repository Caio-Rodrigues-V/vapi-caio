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
  calculationId?: string | null;
  nominalAmount?: number | null;
  cashAmount?: number | null;
  firstDueDate?: string | null;
  installments: DebtInstallment[];
  raw: Record<string, unknown>;
};

export class DebtProviderTemporaryError extends Error {
  readonly retryable = true;
}

export class DebtProviderPermanentError extends Error {
  readonly retryable = false;
}

export interface DebtProvider {
  lookup(cpf: string): Promise<DebtLookupResult>;
}
