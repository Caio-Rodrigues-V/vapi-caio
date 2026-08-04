'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const backendEntry = path.join(__dirname, 'dist', 'server.js');
const campaignWorkerEntry = path.join(__dirname, 'dist', 'workers', 'campaignDispatcher.js');

if (!fs.existsSync(backendEntry)) {
  throw new Error(
    'Backend compilado não encontrado em dist/server.js. Gere e publique os artefatos de build antes de iniciar a aplicação.',
  );
}

if (!fs.existsSync(campaignWorkerEntry)) {
  throw new Error(
    'Dispatcher compilado não encontrado em dist/workers/campaignDispatcher.js. Gere e publique os artefatos de build.',
  );
}

const appModule = require('./dist/server.js');
const migrationsModule = require('./dist/api/routes/adminMigrations.js');
const webhookModule = require('./dist/api/routes/vapiWebhook.js');
const campaignsModule = require('./dist/api/routes/campaignsV2.js');
const campaignWorkerModule = require('./dist/workers/campaignDispatcher.js');

const app = appModule.default || appModule;
const adminMigrationsRouter = migrationsModule.adminMigrationsRouter;
const vapiWebhookRouter = webhookModule.default || webhookModule;
const campaignsV2Router = campaignsModule.campaignsV2Router;
const runCampaignDispatcher = campaignWorkerModule.runCampaignDispatcher;

app.use('/api/admin', adminMigrationsRouter);
app.use('/api/v2', vapiWebhookRouter);
app.use('/api/v2', campaignsV2Router);

let dispatcherRunning = false;

app.post('/api/worker/run', async (req, res) => {
  const configuredToken = process.env.WORKER_TRIGGER_TOKEN;
  const providedToken = req.header('x-worker-token');

  if (!configuredToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (dispatcherRunning) {
    return res.status(409).json({
      ok: false,
      error: 'O dispatcher já está em execução.',
    });
  }

  dispatcherRunning = true;

  try {
    const result = await runCampaignDispatcher();
    console.log(JSON.stringify(result));
    return res.json({
      ok: true,
      message: 'Dispatcher de campanhas executado.',
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao executar dispatcher de campanhas:', error);
    return res.status(500).json({
      ok: false,
      error: message,
    });
  } finally {
    dispatcherRunning = false;
  }
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
