import fs from 'fs';
import path from 'path';

const logFilePath = path.resolve(process.cwd(), 'bot.log');

// Create a write stream (in append mode) for better performance
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function formatMessage(...args: any[]) {
  return args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString();
}

console.log = (...args: any[]) => {
  const msg = formatMessage(...args);
  logStream.write(`[${getTimestamp()}] [INFO] ${msg}\n`);
  originalLog.apply(console, args);
};

console.warn = (...args: any[]) => {
  const msg = formatMessage(...args);
  logStream.write(`[${getTimestamp()}] [WARN] ${msg}\n`);
  originalWarn.apply(console, args);
};

console.error = (...args: any[]) => {
  const msg = formatMessage(...args);
  logStream.write(`[${getTimestamp()}] [ERROR] ${msg}\n`);
  originalError.apply(console, args);
};

export const Logger = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(msg),
  error: (msg: string) => console.error(msg),
  getLogPath: () => logFilePath
};
