export type DebtLookupResult = {
  cpf: string;
  hasDebt: boolean;
  amount?: number | null;
  institution?: string | null;
  raw: Record<string, unknown>;
};

export interface DebtProvider {
  lookup(cpf: string): Promise<DebtLookupResult>;
}
