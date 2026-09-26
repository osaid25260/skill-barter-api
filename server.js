require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');

const logger = require('./utils/logger');
const { apiLimiter, mongoSanitize } = require('./middleware/security');
const apiRoutes = require('./routes/api');

const REQUIRED_ENV = ['MONGO_URI', 'CLIENT_URL'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  logger.error(`Missing env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(compression());

const allowedOrigins = process.env.CLIENT_URL.split(',').map((s) => s.trim());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return NODE_ENV === 'development' ? callback(null, true) : callback(new Error('Origin required'));
    }
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn(`CORS blocked: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  maxAge: 86400
}));

app.use(express.json({ limit: '50kb' }));
app.use(mongoSanitize);

app.use((req, res, next) => {
  req.id = crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`, { requestId: req.id, ip: req.ip });
  });
  next();
});

app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const ok = dbState === 1;
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    db: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', apiLimiter, apiRoutes);

app.get('/', (req, res) => {
  res.json({ name: 'Skill Barter Hub API', version: '1.0.0', docs: '/health' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS' || err.message === 'Origin required') {
    return res.status(403).json({ error: 'CORS: origin not allowed' });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large (max 50kb)' });
  if (err.isOperational) return res.status(err.statusCode).json({ error: err.message });
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation failed', details: Object.values(err.errors).map((e) => e.message) });
  }
  if (err.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}` });

  logger.error('Unhandled error', { message: err.message, stack: err.stack, requestId: req.id });
  res.status(500).json({ error: 'Internal server error' });
});

async function connectDB(retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10
      });
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      logger.error(`MongoDB connect failed (${attempt}/${retries})`, { message: err.message });
      if (attempt === retries) {
        logger.error('All retries failed. Exiting.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, attempt - 1)));
    }
  }
}

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} [${NODE_ENV}]`);
});

connectDB();

function shutdown(signal) {
  logger.info(`${signal} received. Shutting down...`);
  server.close(async () => {
    try {
      await mongoose.connection.close();
      logger.info('MongoDB closed');
      process.exit(0);
    } catch (err) {
      logger.error('Shutdown error', { message: err.message });
      process.exit(1);
    }
  });
  setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
