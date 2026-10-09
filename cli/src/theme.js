import chalk from 'chalk';

/**
 * Цветовая тема консоли: только светлые оттенки, чтобы текст читался на тёмном фоне.
 * Яркие (bright) варианты ANSI работают во всех терминалах, hex-цвета при необходимости
 * chalk сам приводит к ближайшему доступному цвету (256 или 16 цветов).
 * Поменять оформление всей консоли можно здесь, не трогая formatter.js и app.js.
 */
export const theme = {
  /** Второстепенный текст: подсказки, описания, рамки, номера (раньше тёмно-серый gray). */
  muted: chalk.hex('#c4cad4'),
  /** Ссылки на первоисточники и в тексте статей (раньше тёмно-синий blue). */
  link: chalk.hex('#8cc2ff').underline,
  cyan: chalk.cyanBright,
  yellow: chalk.yellowBright,
  green: chalk.greenBright,
  red: chalk.redBright,
  magenta: chalk.magentaBright,
};
