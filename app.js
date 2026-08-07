'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const backendEntry = path.join(__dirname, 'dist', 'server.js');
const campaignWorkerEntry = path.join(__dirname, 'dist', 'workers', 'campaignDispatcher.js');
const vapiSyncEntry = path.join(__dirname, 'dist', 'workers', 'vapiCallSynchronizer.js');

if (!fs.existsSync(backendEntry)) {
  throw new Error(
    'Backend compilado não encontrado em dist/server.js. Gere e publique os artefatos de build antes de iniciar a aplicação.',
  );
}

if (!fs.existsSync(campaignWorkerEntry) || !fs.existsSync(vapiSyncEntry)) {
  throw new Error(
    'Workers compilados não encontrados em dist/workers. Gere e publique os artefatos de build.',
  );
}

const appModule = require('./dist/server.js');
const migrationsModule = require('./dist/api/routes/adminMigrations.js');
const webhookModule = require('./dist/api/routes/vapiWebhook.js');
const campaignsModule = require('./dist/api/routes/campaignsV2.js');
const streamModule = require('./dist/api/routes/stream.js');
const externalTriggerModule = require('./dist/api/routes/externalTrigger.js');
const campaignWorkerModule = require('./dist/workers/campaignDispatcher.js');
const vapiSyncModule = require('./dist/workers/vapiCallSynchronizer.js');

const app = appModule.default || appModule;
const adminMigrationsRouter = migrationsModule.adminMigrationsRouter;
const vapiWebhookRouter = webhookModule.default || webhookModule;
const campaignsV2Router = campaignsModule.campaignsV2Router;
const streamRouter = streamModule.streamRouter;
const externalTriggerRouter = externalTriggerModule.externalTriggerRouter;
const runCampaignDispatcher = campaignWorkerModule.runCampaignDispatcher;
const runVapiCallSynchronizer = vapiSyncModule.runVapiCallSynchronizer;

app.use('/api/admin', adminMigrationsRouter);
app.use('/api/v2', vapiWebhookRouter);
app.use('/api/v2', campaignsV2Router);
app.use('/api/v2', streamRouter);
app.use('/api/v2', externalTriggerRouter);

let dispatcherRunning = false;
let synchronizerRunning = false;

function hasWorkerAccess(req) {
  const configuredToken = process.env.WORKER_TRIGGER_TOKEN;
  const providedToken = req.header('x-worker-token');
  return Boolean(configuredToken && providedToken === configuredToken);
}

app.post('/api/worker/run', async (req, res) => {
  if (!hasWorkerAccess(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (dispatcherRunning) {
    return res.status(409).json({ ok: false, error: 'O dispatcher já está em execução.' });
  }

  dispatcherRunning = true;
  try {
    const result = await runCampaignDispatcher();
    console.log(JSON.stringify(result));
    return res.json({ ok: true, message: 'Dispatcher de campanhas executado.', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao executar dispatcher de campanhas:', error);
    return res.status(500).json({ ok: false, error: message });
  } finally {
    dispatcherRunning = false;
  }
});

app.post('/api/worker/sync-vapi', async (req, res) => {
  if (!hasWorkerAccess(req)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (synchronizerRunning) {
    return res.status(409).json({ ok: false, error: 'A sincronização da Vapi já está em execução.' });
  }

  synchronizerRunning = true;
  try {
    const limit = Number(req.body?.limit || req.query?.limit || 100);
    const result = await runVapiCallSynchronizer(limit);
    console.log(JSON.stringify({ worker: 'vapi-call-synchronizer', ...result }));
    return res.json({ ok: true, message: 'Chamadas sincronizadas com a Vapi.', result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao sincronizar chamadas da Vapi:', error);
    return res.status(500).json({ ok: false, error: message });
  } finally {
    synchronizerRunning = false;
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
