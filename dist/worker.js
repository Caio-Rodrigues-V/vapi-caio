"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const db_1 = __importDefault(require("./db"));
const ddmService_1 = require("./services/ddmService");
const phoneValidator_1 = require("./utils/phoneValidator");
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 5);
const MAX_TRIES = Number(process.env.WORKER_MAX_TRIES || 5);
const RETRY_DELAY_MS = Number(process.env.WORKER_RETRY_DELAY_MS || 60000);
const STALE_LOCK_MINUTES = Number(process.env.WORKER_STALE_LOCK_MINUTES || 15);
const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Sao_Paulo';
function validarConfiguracao() {
    const obrigatorias = [
        'VAPI_API_KEY',
        'VAPI_PHONE_NUMBER_ID',
        'VAPI_ASSISTANT_ID',
    ];
    const ausentes = obrigatorias.filter((nome) => !process.env[nome]);
    if (ausentes.length > 0) {
        throw new Error(`Variáveis obrigatórias ausentes: ${ausentes.join(', ')}`);
    }
    if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1) {
        throw new Error('WORKER_BATCH_SIZE deve ser um inteiro maior que zero.');
    }
    if (!Number.isInteger(MAX_TRIES) || MAX_TRIES < 1) {
        throw new Error('WORKER_MAX_TRIES deve ser um inteiro maior que zero.');
    }
}
function obterHorarioComercial() {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TIMEZONE,
        weekday: 'short',
        hour: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date());
    const diaSemana = partes.find((parte) => parte.type === 'weekday')?.value;
    const hora = Number(partes.find((parte) => parte.type === 'hour')?.value);
    if (!diaSemana || Number.isNaN(hora)) {
        throw new Error(`Não foi possível calcular o horário em ${BUSINESS_TIMEZONE}.`);
    }
    return { diaSemana, hora };
}
function isHorarioLegal() {
    const { diaSemana, hora } = obterHorarioComercial();
    const fimDeSemana = diaSemana === 'Sat' || diaSemana === 'Sun';
    return !fimDeSemana && hora >= 8 && hora < 20;
}
async function liberarRegistrosTravados() {
    await db_1.default.query(`UPDATE fila_disparo
     SET status = 'falha',
         lote_id = NULL,
         proxima_tentativa_em = CURRENT_TIMESTAMP
     WHERE status = 'em_progresso'
       AND atualizado_em < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ? MINUTE)`, [STALE_LOCK_MINUTES]);
}
async function processarRegistro(registro) {
    const { id, telefone, cpf } = registro;
    const phoneE164 = (0, phoneValidator_1.normalizePhone)(telefone);
    if (!phoneE164) {
        await db_1.default.query(`UPDATE fila_disparo
       SET status = 'falha', tentativas = ?, lote_id = NULL
       WHERE id = ?`, [MAX_TRIES, id]);
        return;
    }
    try {
        if (cpf) {
            const temDebito = await (0, ddmService_1.verificarDebito)(cpf);
            if (!temDebito) {
                await db_1.default.query(`UPDATE fila_disparo
           SET status = 'concluido', sem_debito = TRUE, lote_id = NULL
           WHERE id = ?`, [id]);
                return;
            }
        }
        const response = await axios_1.default.post('https://api.vapi.ai/call/phone', {
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            assistantId: process.env.VAPI_ASSISTANT_ID,
            customer: {
                number: phoneE164,
            },
            metadata: {
                filaDisparoId: id,
                cpf: cpf || null,
            },
        }, {
            headers: {
                Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        const callId = response.data?.id;
        if (!callId) {
            throw new Error('A Vapi não retornou o identificador da chamada.');
        }
        await db_1.default.query(`UPDATE fila_disparo
       SET status = 'aguardando_resultado',
           call_id = ?,
           tentativas = tentativas + 1,
           lote_id = NULL
       WHERE id = ?`, [callId, id]);
        console.log(`Chamada iniciada. Fila ID: ${id} | Vapi Call ID: ${callId}`);
    }
    catch (error) {
        const proximaTentativa = new Date(Date.now() + RETRY_DELAY_MS);
        const detalhe = error.response?.data || error.message;
        console.error(`Falha ao processar fila ID ${id}:`, detalhe);
        await db_1.default.query(`UPDATE fila_disparo
       SET status = 'falha',
           tentativas = tentativas + 1,
           proxima_tentativa_em = ?,
           lote_id = NULL
       WHERE id = ?`, [proximaTentativa, id]);
    }
}
async function processarLote() {
    validarConfiguracao();
    if (!isHorarioLegal()) {
        console.log(`Fora do horário permitido em ${BUSINESS_TIMEZONE}. Worker encerrado.`);
        return;
    }
    await liberarRegistrosTravados();
    const loteId = `lote_${Date.now()}_${process.pid}`;
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const [updateResult] = await connection.query(`UPDATE fila_disparo
       SET status = 'em_progresso', lote_id = ?
       WHERE status IN ('pendente', 'falha')
         AND tentativas < ?
         AND proxima_tentativa_em <= CURRENT_TIMESTAMP
         AND sem_debito = FALSE
       ORDER BY proxima_tentativa_em ASC, id ASC
       LIMIT ?`, [loteId, MAX_TRIES, BATCH_SIZE]);
        if (updateResult.affectedRows === 0) {
            await connection.commit();
            console.log('Nenhum registro disponível para processamento.');
            return;
        }
        const [registros] = await connection.query('SELECT * FROM fila_disparo WHERE lote_id = ? ORDER BY id ASC', [loteId]);
        await connection.commit();
        for (const registro of registros) {
            await processarRegistro(registro);
        }
        console.log(`Lote ${loteId} processado.`);
    }
    catch (error) {
        await connection.rollback();
        throw error;
    }
    finally {
        connection.release();
    }
}
processarLote()
    .catch((error) => {
    console.error('Erro ao processar lote:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await db_1.default.end();
});
//# sourceMappingURL=worker.js.map