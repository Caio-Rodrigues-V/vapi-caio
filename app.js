'use strict';

const appModule = require('./dist/server');

module.exports = appModule.default || appModule;
