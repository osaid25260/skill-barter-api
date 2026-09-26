/**
 * Winston logger — production-grade structured logging.
 */
const winston = require('winston');

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// Dev format — padhne mein aasan
const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${stack || message}${extras}`;
});

// Production format — JSON
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  exitOnError: false,
  format: process.env.NODE_ENV === 'production'
    ? prodFormat
    : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), errors({ stack: true }), devFormat),
  transports: [
    new winston.transports.Console()
  ],
  exceptionHandlers: [new winston.transports.Console()],
  rejectionHandlers: [new winston.transports.Console()]
});

module.exports = logger;