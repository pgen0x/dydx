const log4js = require('log4js');
log4js.configure({
  appenders: { 
    console: { type: 'console' },
    file: { type: 'dateFile', filename: './logs/app.log', pattern: '.yyyyMMdd_hh', compress: true, numBackups: 24 }
  },
  categories: { default: { appenders: ['console', 'file'], level: 'debug' } }
});

module.exports = log4js;
