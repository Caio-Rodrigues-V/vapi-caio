"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DdmDebtProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const DebtProvider_1 = require("../../core/debt/DebtProvider");
function normalizeCpf(value) {
    return value.replace(/\D/g, '').padStart(11, '0');
}
function normalizeKey(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function getAny(source, names) {
    if (!source || typeof source !== 'object' || Array.isArray(source))
        return undefined;
    const wanted = new Set(names.map(normalizeKey));
    for (const [key, value] of Object.entries(source)) {
        if (wanted.has(normalizeKey(key)))
            return value;
    }
    return undefined;
}
function findFirst(source, names) {
    const wanted = new Set(names.map(normalizeKey));
    if (Array.isArray(source)) {
        for (const item of source) {
            const found = findFirst(item, names);
            if (found)
                return found;
        }
        return '';
    }
    if (!source || typeof source !== 'object')
        return '';
    for (const [key, value] of Object.entries(source)) {
        if (wanted.has(normalizeKey(key)) && value !== null && value !== '')
            return String(value).trim();
        const nested = findFirst(value, names);
        if (nested)
            return nested;
    }
    return '';
}
function parseMoney(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    const normalized = String(value).replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}
function consolidateCalculation(raw) {
    const items = Array.isArray(raw) ? raw : [raw];
    const consolidated = {};
    const installments = [];
    const debts = [];
    for (const item of items) {
        if (!item || typeof item !== 'object')
            continue;
        const row = item;
        const dados = row.Dados;
        if (dados && typeof dados === 'object' && !Array.isArray(dados))
            Object.assign(consolidated, dados);
        const calculos = Array.isArray(row.Calculos) ? row.Calculos : [];
        for (const calc of calculos) {
            if (calc && typeof calc === 'object' && 'debitos' in calc)
                debts.push(calc.debitos);
        }
        const cash = row.PgtoAvista;
        if (cash && typeof cash === 'object' && !Array.isArray(cash)) {
            consolidated.PgtoAvista = cash;
            const cashRow = cash;
            installments.push({
                ValorParcela: cashRow.ValorFinal ?? cashRow.ValorTotal ?? '0,00',
                ValorFinal: cashRow.ValorFinal ?? cashRow.ValorTotal ?? '0,00',
            });
        }
        if (row.PgtoParceladoBoleto && typeof row.PgtoParceladoBoleto === 'object') {
            installments.push(row.PgtoParceladoBoleto);
        }
        if (row.PgtoParceladoCartao)
            consolidated.PgtoParceladoCartao = row.PgtoParceladoCartao;
    }
    consolidated.ListaParcelas = { Parcelas: installments };
    consolidated.ListaDebitos = { Debito: debts };
    consolidated.TotalNominal = consolidated.nominal ?? consolidated.nominal_princ ??
        (consolidated.PgtoAvista?.ValorTotal ?? '0,00');
    consolidated.Cliente = consolidated.instituicao ?? consolidated.Cliente ?? '';
    consolidated.NomeDev = consolidated.nome ?? consolidated.NomeDevedor ?? '';
    consolidated.idcalc = consolidated.CalculoID ?? consolidated.iddev ?? '';
    return consolidated;
}
class DdmDebtProvider {
    client;
    token;
    tokenCalcula;
    maxRetries;
    constructor(options) {
        if (!options.token)
            throw new Error('DDM_TOKEN_BUSCA não configurado.');
        this.token = options.token;
        this.tokenCalcula = options.tokenCalcula || options.token || '';
        this.maxRetries = options.maxRetries ?? 3;
        this.client = axios_1.default.create({
            baseURL: (options.baseUrl || 'https://ddmacordos.com').replace(/\/$/, ''),
            timeout: options.timeoutMs ?? 7_000,
            headers: { Accept: 'application/json' },
        });
    }
    async getWithRetry(path, params) {
        let lastError;
        for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
            try {
                const response = await this.client.get(path, { params });
                return response.data;
            }
            catch (error) {
                lastError = error;
                const axiosError = error;
                const status = axiosError.response?.status;
                if (status === 401 || status === 403) {
                    throw new DebtProvider_1.DebtProviderPermanentError(`DDM rejeitou a autenticação (${status}).`);
                }
                const retryable = !status || status === 429 || status >= 500;
                if (!retryable)
                    throw new DebtProvider_1.DebtProviderPermanentError(`DDM respondeu HTTP ${status}.`);
                if (attempt < this.maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
                }
            }
        }
        const message = lastError instanceof Error ? lastError.message : String(lastError);
        throw new DebtProvider_1.DebtProviderTemporaryError(`Falha temporária no DDM: ${message}`);
    }
    async lookup(cpfInput) {
        const cpf = normalizeCpf(cpfInput);
        if (cpf.length !== 11)
            throw new DebtProvider_1.DebtProviderPermanentError('CPF inválido para consulta DDM.');
        const located = await this.getWithRetry('/calc/localiza_dev.php', { tk: this.token, cpf });
        if (!Array.isArray(located) || !located.length) {
            return { cpf, hasDebt: false, installments: [], raw: {}, skipReason: 'no_debt' };
        }
        let lastResult = null;
        let fallbackResult = null;
        for (const debtor of located) {
            if (!debtor || typeof debtor !== 'object')
                continue;
            const debtorId = String(debtor.iddev ?? '').trim();
            if (!debtorId)
                continue;
            const system = String(debtor.sistema ?? '').trim().toLowerCase();
            const client = system === 'cruzeirodosul' ? 'cruzeiro' : 'ddm';
            try {
                const rawCalculation = await this.getWithRetry('/calc/', {
                    tk: this.token,
                    idDev: debtorId,
                    cli: client,
                });
                const calculation = consolidateCalculation(rawCalculation);
                const installmentContainer = getAny(calculation, ['ListaParcelas', 'lista_parcelas', 'parcelas']);
                const rawInstallments = getAny(installmentContainer, ['Parcelas', 'Parcela', 'parcelas']);
                const rows = Array.isArray(rawInstallments) ? rawInstallments : rawInstallments ? [rawInstallments] : [];
                const installments = rows
                    .map((row, index) => {
                    const amount = parseMoney(getAny(row, ['ValorParcela', 'valor_parcela', 'valor', 'ValorFinal']));
                    if (!amount || amount <= 0)
                        return null;
                    return {
                        number: index + 1,
                        amount,
                        dueDate: findFirst(row, ['Vencimento', 'DataVencimento', 'Venc', 'DtVenc']) || null,
                    };
                })
                    .filter((item) => Boolean(item));
                const cashAmount = installments[0]?.amount ?? null;
                const institution = findFirst(calculation, ['Cliente', 'Instituicao', 'instituicao']).replace(/\bNOVO\b/gi, '').trim() || null;
                const email = findFirst(calculation, ['email', 'emaildev', 'emaildevedor', 'mail']) || null;
                const hasInstallments = installments.length > 0 && Boolean(cashAmount);
                let skipReason = null;
                if (!hasInstallments) {
                    skipReason = 'no_debt';
                }
                else if (calculation.FechaAcordo === false) {
                    const rawAcordos = Array.isArray(calculation.Acordos) ? calculation.Acordos : [];
                    const hasActiveAgreement = rawAcordos.some((a) => (Array.isArray(a) ? a.length > 0 : Boolean(a)));
                    skipReason = hasActiveAgreement ? 'already_has_agreement' : 'no_online_agreement';
                }
                const result = {
                    cpf,
                    hasDebt: hasInstallments && calculation.FechaAcordo !== false,
                    institution,
                    debtorName: findFirst(calculation, ['NomeDev', 'NomeDevedor', 'nome_devedor']) || null,
                    debtorId,
                    calculationId: findFirst(calculation, ['idcalc', 'id_calc', 'idCalculo', 'calculoId']) || null,
                    nominalAmount: parseMoney(findFirst(calculation, ['TotalNominal', 'ValorTotal', 'valor_total'])),
                    cashAmount,
                    firstDueDate: findFirst(calculation, ['PrimeiroVencto', 'PrimeiroVencimento', 'DtVenc', 'Vencimento']) ||
                        installments[0]?.dueDate || null,
                    email,
                    installments,
                    raw: calculation,
                    skipReason,
                };
                lastResult = result;
                // Se encontrou dívidas ativas para este devedor
                if (result.hasDebt) {
                    const instUpper = (result.institution || '').toUpperCase();
                    const isTargetUva = instUpper.includes('VEIGA') || instUpper.includes('ALMEIDA') || instUpper.includes('UVA');
                    if (isTargetUva) {
                        // Se for específico da UVA, retorna imediatamente!
                        return result;
                    }
                    else {
                        // Se for outra instituição (ex: UNISUAM), salva como fallback e continua a busca por UVA
                        if (!fallbackResult) {
                            fallbackResult = result;
                        }
                    }
                }
            }
            catch (err) {
                console.error(`[DdmDebtProvider] Falha ao consultar iddev ${debtorId}:`, err);
            }
        }
        return fallbackResult || lastResult || { cpf, hasDebt: false, installments: [], raw: {}, skipReason: 'no_debt' };
    }
    async formalize(debtorId, client, installments = 1) {
        const data = await this.getWithRetry('/calc/efetiva_acordo.php', {
            tk: this.tokenCalcula,
            idDev: debtorId,
            cli: client,
            Parc: String(installments),
        });
        const findFirstKey = (obj, keys) => {
            if (!obj || typeof obj !== 'object')
                return '';
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const found = findFirstKey(item, keys);
                    if (found)
                        return found;
                }
                return '';
            }
            const normalizedKeys = keys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
            for (const [k, v] of Object.entries(obj)) {
                if (normalizedKeys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, '')) && v) {
                    return String(v).trim();
                }
                if (v && typeof v === 'object') {
                    const found = findFirstKey(v, keys);
                    if (found)
                        return found;
                }
            }
            return '';
        };
        const linkBoleto = findFirstKey(data, ['linkboleto', 'boletourl', 'urlboleto', 'boleto', 'link_boleto', 'url_boleto']);
        const linkPix = findFirstKey(data, ['linkpix', 'pixurl', 'urlpix', 'qrcodepix', 'qrcode', 'pix', 'link_pix', 'url_pix']);
        const linhaDig = findFirstKey(data, ['linhaboleto', 'linhadigitavel', 'linhadig', 'digitalline', 'digitableline', 'linha_digitavel', 'linha']);
        const vencimento = findFirstKey(data, ['vencimento', 'datavencto', 'vencto', 'due_date', 'venc', 'data_vencimento']);
        const nrAcordo = findFirstKey(data, ['nracordo', 'nr_acordo', 'acordo', 'agreement_number', 'numero_acordo', 'idacordo']);
        const valorRaw = findFirstKey(data, ['valor', 'valortotal', 'valor_total', 'valoracordo', 'valor_acordo', 'amount', 'valorfinal', 'valordocumento', 'valor_documento', 'val_total', 'total', 'valor_final']);
        return {
            linkBoleto: linkBoleto || null,
            linkPix: linkPix || null,
            linhaDigitavel: linhaDig || null,
            vencimento: vencimento || null,
            numeroAcordo: nrAcordo || null,
            valor: parseMoney(valorRaw),
            raw: data,
        };
    }
}
exports.DdmDebtProvider = DdmDebtProvider;
//# sourceMappingURL=DdmDebtProvider.js.map