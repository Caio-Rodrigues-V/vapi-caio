"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMigrationsRouter = void 0;
const express_1 = require("express");
const runMigrations_1 = require("../../infrastructure/database/runMigrations");
exports.adminMigrationsRouter = (0, express_1.Router)();
exports.adminMigrationsRouter.post('/migrations/run', async (req, res) => {
    const configuredToken = process.env.ADMIN_MIGRATION_TOKEN;
    const providedToken = req.header('x-admin-token');
    if (!configuredToken || providedToken !== configuredToken) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const migrations = await (0, runMigrations_1.runPendingMigrations)();
        return res.json({ ok: true, migrations });
    }
    catch (error) {
        console.error('Erro ao executar migrations:', error);
        return res.status(500).json({
            ok: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
    }
});
//# sourceMappingURL=adminMigrations.js.map