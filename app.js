'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { execFile } = require('child_process');

const backendEntry = path.join(__dirname, 'dist', 'server.js');
const campaignWorkerEntry = path.join(__dirname, 'dist', 'workers', 'campaignDispatcher.js');

if (!fs.existsSync(backendEntry)) {
  throw new Error(
    'Backend compilado não encontrado em dist/server.js. Gere e publique os artefatos de build antes de iniciar a aplicação.',
  );
}

const appModule = require('./dist/server.js');
const migrationsModule = require('./dist/api/routes/adminMigrations.js');
const webhookModule = require('./dist/api/routes/vapiWebhook.js');
const campaignsModule = require('./dist/api/routes/campaignsV2.js');

const app = appModule.default || appModule;
const adminMigrationsRouter = migrationsModule.adminMigrationsRouter;
const vapiWebhookRouter = webhookModule.default || webhookModule;
const campaignsV2Router = campaignsModule.campaignsV2Router;

app.use('/api/admin', adminMigrationsRouter);
app.use('/api/v2', vapiWebhookRouter);
app.use('/api/v2', campaignsV2Router);

app.post('/api/worker/run', (req, res) => {
  const configuredToken = process.env.WORKER_TRIGGER_TOKEN;
  const providedToken = req.header('x-worker-token');

  if (!configuredToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (!fs.existsSync(campaignWorkerEntry)) {
    return res.status(503).json({
      error: 'Dispatcher compilado não encontrado.',
      expectedPath: campaignWorkerEntry,
    });
  }

  execFile(
    process.execPath,
    [campaignWorkerEntry],
    {
      cwd: __dirname,
      env: process.env,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    },
    (error, stdout, stderr) => {
      const output = String(stdout || '').trim();
      const errorOutput = String(stderr || '').trim();

      if (error) {
        console.error('Erro ao executar dispatcher de campanhas:', error);
        if (errorOutput) console.error(errorOutput);

        return res.status(500).json({
          ok: false,
          error: error.message,
          stdout: output || null,
          stderr: errorOutput || null,
        });
      }

      if (output) console.log(output);
      if (errorOutput) console.error(errorOutput);

      return res.json({
        ok: true,
        message: 'Dispatcher de campanhas executado.',
        stdout: output || null,
        stderr: errorOutput || null,
      });
    },
  );
});

const frontendDist = path.join(__dirname, 'frontend', 'dist');
const frontendIndex = path.join(frontendDist, 'index.html');

if (fs.existsSync(frontendIndex)) {
  app.use(
    express.static(frontendDist, {
      index: false,
      maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    }),
  );

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(frontendIndex);
  });
}

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => {
  console.log(`Servidor iniciado na porta ${port}`);
});

module.exports = server;
