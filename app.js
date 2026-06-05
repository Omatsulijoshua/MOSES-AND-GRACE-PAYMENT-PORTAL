const express = require('express');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('./middleware/auth');

require('dotenv').config();

const prisma = globalThis.__mosesAndGracePrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__mosesAndGracePrisma = prisma;
}

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', requireAuth('admin'), require('./routes/admin'));
app.use('/api/student', require('./routes/student'));

app.use(express.static(path.join(__dirname, 'public')));

module.exports = {
  app,
  prisma
};

