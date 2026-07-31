'use strict';

const appModule = require('./dist/server');
const app = appModule.default || appModule;

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
