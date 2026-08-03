'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');

require('tsx/cjs');
const appModule = require('./src/server.ts');

const app = appModule.default || appModule;
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
