"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const csv_parse_1 = require("csv-parse");
const db_1 = __importDefault(require("./db"));
const llmClassifier_1 = require("./services/llmClassifier");
const phoneValidator_1 = require("./utils/phoneValidator");
const adminVapiHealth_1 = require("./api/routes/adminVapiHealth");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use('/api/admin', adminVapiHealth_1.adminVapiHealthRouter);
const PORT = Number(process.env.PORT || 3000);
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 },
});
app.get('/api/health', (_req, res) => {
    return res.json({ status: 'ok' });
});
app.post('/api/vapi/webhook', async (req, res) => {
    try {
        const message = req.body?.message;
        if (!message) {
            return res.status(400).json({ error: 'Missing message in body' });
        }
        const { type, call } = message;
        const callId = call?.id;
        if (!callId || !type) {
            return res.status(400).json({ error: 'Missing call id or event type' });
        }
        try {
            await db_1.default.query('INSERT INTO eventos_webhook (call_id, tipo_evento, payload) VALUES (?, ?, ?)', [callId, type, JSON.stringify(message)]);
        }
        catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(200).json({ received: true, ignored: 'duplicate' });
            }
            throw error;
        }
        if (type !== 'end-of-call-report') {
            return res.status(200).json({ received: true });
        }
        const telefone = call?.customer?.number || '';
        const transcricao = message.transcript || '';
        const mensagens = Array.isArray(message.artifact?.messages)
            ? message.artifact.messages
            : [];
        const falasCliente = mensagens
            .filter((item) => item.role === 'user' || item.role === 'customer')
            .map((item) => item.message)
            .filter(Boolean);
        if (falasCliente.length === 0 && transcricao) {
            falasCliente.push(transcricao);
        }
        const { decisao, dataAgendamento } = await (0, llmClassifier_1.classificarLigacao)(transcricao, falasCliente);
        await db_1.default.query(`INSERT INTO auditoria_chamadas
        (call_id, telefone, decisao, data_agendamento)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         telefone = VALUES(telefone),
         decisao = VALUES(decisao),
         data_agendamento = VALUES(data_agendamento)`, [callId, telefone, decisao, dataAgendamento || null]);
        const filaIdMetadata = Number(call?.metadata?.filaDisparoId || message?.metadata?.filaDisparoId);
        if (Number.isInteger(filaIdMetadata) && filaIdMetadata > 0) {
            await db_1.default.query(`UPDATE fila_disparo
         SET status = 'concluido', lote_id = NULL
         WHERE id = ? AND call_id = ?`, [filaIdMetadata, callId]);
        }
        else {
            await db_1.default.query(`UPDATE fila_disparo
         SET status = 'concluido', lote_id = NULL
         WHERE call_id = ?`, [callId]);
        }
        if (decisao === 'Agendar' && dataAgendamento) {
            const [rows] = await db_1.default.query('SELECT cpf, telefone FROM fila_disparo WHERE call_id = ? LIMIT 1', [callId]);
            const registroOriginal = rows[0];
            if (registroOriginal) {
                await db_1.default.query(`INSERT INTO fila_disparo
            (telefone, cpf, status, proxima_tentativa_em)
           VALUES (?, ?, 'pendente', ?)`, [registroOriginal.telefone, registroOriginal.cpf, dataAgendamento]);
            }
        }
        return res.status(200).json({ received: true });
    }
    catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }
    const filePath = req.file.path;
    const results = [];
    fs_1.default.createReadStream(filePath)
        .pipe((0, csv_parse_1.parse)({ columns: true, trim: true, skip_empty_lines: true }))
        .on('data', (data) => results.push(data))
        .on('error', (error) => {
        console.error('Erro ao ler CSV:', error);
        fs_1.default.rmSync(filePath, { force: true });
        return res.status(400).json({ error: 'CSV inválido' });
    })
        .on('end', async () => {
        const connection = await db_1.default.getConnection();
        try {
            let inseridos = 0;
            await connection.beginTransaction();
            for (const row of results) {
                const telefoneRaw = row.telefone || row.phone || row.numero || Object.values(row)[0];
                const cpfRaw = row.cpf || null;
                const phoneE164 = telefoneRaw
                    ? (0, phoneValidator_1.normalizePhone)(String(telefoneRaw))
                    : null;
                if (!phoneE164)
                    continue;
                await connection.query(`INSERT INTO fila_disparo (telefone, cpf, status)
             VALUES (?, ?, 'pendente')`, [phoneE164, cpfRaw]);
                inseridos += 1;
            }
            await connection.commit();
            return res.json({
                message: 'Arquivo processado',
                contatosValidos: inseridos,
            });
        }
        catch (error) {
            await connection.rollback();
            console.error(error);
            return res.status(500).json({ error: 'Erro ao salvar no banco' });
        }
        finally {
            connection.release();
            fs_1.default.rmSync(filePath, { force: true });
        }
    });
});
app.get('/api/calls', async (_req, res) => {
    try {
        const [rows] = await db_1.default.query(`
      SELECT
        f.id,
        f.telefone,
        f.cpf,
        f.status,
        f.call_id,
        f.tentativas,
        a.decisao,
        a.data_agendamento,
        a.criado_em AS finalizado_em,
        f.atualizado_em AS data
      FROM fila_disparo f
      LEFT JOIN auditoria_chamadas a ON a.call_id = f.call_id
      ORDER BY f.atualizado_em DESC
      LIMIT 100
    `);
        return res.json(rows);
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Erro ao buscar chamadas' });
    }
});
app.post('/api/worker/start', (req, res) => {
    const configuredToken = process.env.WORKER_TRIGGER_TOKEN;
    const providedToken = req.header('x-worker-token');
    if (!configuredToken || providedToken !== configuredToken) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    const { execFile } = require('child_process');
    const tsxBinary = require.resolve('tsx/cli');
    execFile(process.execPath, [tsxBinary, 'src/worker.ts'], { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error)
            console.error('Erro no worker manual:', error);
        if (stdout)
            console.log(stdout);
        if (stderr)
            console.error(stderr);
    });
    return res.status(202).json({ message: 'Worker acionado.' });
});
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map