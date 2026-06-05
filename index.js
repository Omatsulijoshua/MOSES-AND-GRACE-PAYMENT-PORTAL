const express = require('express');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { requireAuth } = require('./middleware/auth');

require('dotenv').config();

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

// Attach prisma to req for routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', requireAuth('admin'), require('./routes/admin'));
app.use('/api/student', require('./routes/student'));

// Static frontend
app.use(express.static(path.join(__dirname, 'public')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
