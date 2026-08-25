const express = require('express');
const path = require('path');
const { PrismaClient } = require('./prisma/client');
const { requireAuth } = require('./middleware/auth');

require('dotenv').config();

const prisma = globalThis.__mosesAndGracePrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__mosesAndGracePrisma = prisma;
}

const app = express();
app.use((req, res, next) => {
  if (req.headers['x-matched-path']) {
    req.url = req.headers['x-matched-path'];
  }
  console.log(`Express received request: ${req.method} ${req.url}`);
  next();
});

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/health', (req, res) => {
  console.log("Health check matched!");
  res.json({ status: 'ok' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', requireAuth('admin'), require('./routes/admin'));
app.use('/api/student', require('./routes/student'));

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res) => {
  console.log(`Express fallback reached for: ${req.method} ${req.url}`);
  res.status(404).send(`Express 404: Not Found at ${req.url}`);
});

module.exports = {
  app,
  prisma
};

