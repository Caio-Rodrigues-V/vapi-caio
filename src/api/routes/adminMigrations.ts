import { Router } from 'express';
import { runPendingMigrations } from '../../infrastructure/database/runMigrations';

export const adminMigrationsRouter = Router();

adminMigrationsRouter.post('/migrations/run', async (req, res) => {
  const configuredToken = process.env.ADMIN_MIGRATION_TOKEN;
  const providedToken = req.header('x-admin-token');

  if (!configuredToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const migrations = await runPendingMigrations();
    return res.json({ ok: true, migrations });
  } catch (error) {
    console.error('Erro ao executar migrations:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});
