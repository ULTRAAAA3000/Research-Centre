#!/usr/bin/env node
import { startRepl } from '../src/app.js';
import { APP_NAME, APP_VERSION } from '../src/config.js';

const args = process.argv.slice(2);
const first = args[0]?.toLowerCase();

if (first === '--version' || first === '-v') {
  console.log(`${APP_NAME} ${APP_VERSION}`);
} else if (args.length && first !== 'start') {
  console.log(`${APP_NAME} ${APP_VERSION}

Использование:
  kb          запустить интерактивную консоль
  kb start    то же самое
  kb --help   эта справка

Внутри консоли: help, -s <запрос>, -c, -t <раздел>, -i <id>, status, clear, exit`);
} else {
  await startRepl();
  process.exit(0);
}
