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
const path_1 = __importDefault(require("path"));
const csv_parse_1 = require("csv-parse");
const db_1 = __importDefault(require("./db"));
const phoneValidator_1 = require("./utils/phoneValidator");
const adminVapiHealth_1 = require("./api/routes/adminVapiHealth");
const adminMigrations_1 = require("./api/routes/adminMigrations");
const vapiWebhook_1 = __importDefault(require("./api/routes/vapiWebhook"));
const campaignsV2_1 = require("./api/routes/campaignsV2");
const stream_1 = require("./api/routes/stream");
const runMigrations_1 = require("./infrastructure/database/runMigrations");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '2mb' }));
app.use('/api/admin', adminVapiHealth_1.adminVapiHealthRouter);
app.use('/api/admin', adminMigrations_1.adminMigrationsRouter);
app.use('/api/v2', vapiWebhook_1.default);
app.use('/api', vapiWebhook_1.default);
app.use('/api/v2', campaignsV2_1.campaignsV2Router);
app.use('/api/v2', stream_1.streamRouter);
const PORT = Number(process.env.PORT || 3000);
const upload = (0, multer_1.default)({
    dest: 'uploads/',
    limits: { fileSize: 10 * 1024 * 1024 },
});
app.get('/api/health', (_req, res) => {
    return res.json({ status: 'ok' });
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
    execFile(process.execPath, [tsxBinary, 'src/workers/campaignDispatcher.ts'], { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error)
            console.error('Erro no dispatcher de campanhas:', error);
        if (stdout)
            console.log(stdout);
        if (stderr)
            console.error(stderr);
    });
    return res.status(202).json({ message: 'Dispatcher de campanhas acionado.' });
});
const frontendDist = path_1.default.join(__dirname, '..', 'frontend', 'dist');
const frontendIndex = path_1.default.join(frontendDist, 'index.html');
if (fs_1.default.existsSync(frontendIndex)) {
    app.use(express_1.default.static(frontendDist, { index: false }));
    app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api/')) {
            return next();
        }
        return res.sendFile(frontendIndex);
    });
}
const campaignDispatcher_1 = require("./workers/campaignDispatcher");
let isDispatching = false;
function startBackgroundDispatcher() {
    console.log('[Dispatcher] Loop de disparo automático ativado (intervalo: 5s)...');
    setInterval(async () => {
        if (isDispatching)
            return;
        isDispatching = true;
        try {
            await (0, campaignDispatcher_1.runCampaignDispatcher)();
        }
        catch (err) {
            console.error('[Dispatcher] Erro no loop de disparo:', err);
        }
        finally {
            isDispatching = false;
        }
    }, 5000);
}
if (require.main === module) {
    (0, runMigrations_1.runPendingMigrations)()
        .then((results) => {
        console.log('Database migrations processed on startup:', results);
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            startBackgroundDispatcher();
        });
    })
        .catch((err) => {
        console.error('Failed to run migrations on startup:', err);
        // Still listen so the server doesn't crash completely, allowing admin route access
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            startBackgroundDispatcher();
        });
    });
}
exports.default = app;
//# sourceMappingURL=server.js.map