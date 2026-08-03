'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

const backendEntry = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(backendEntry)) {
  throw new Error(
    'Backend compilado não encontrado em dist/server.js. Execute "npm ci", "npm ci --prefix frontend" e "npm run build" antes de iniciar a aplicação.',
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

const frontendDist = path.join(__dirname, 'frontend', 'dist');
const frontendIndex = path.join(frontendDist, 'index.html');

if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDist, {
    index: false,
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  }));

  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(frontendIndex);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Servidor iniciado na porta ${port}`);
  });
}

module.exports = app;
