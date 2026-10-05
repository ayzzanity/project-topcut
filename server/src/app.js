const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const { errorResponse } = require('./utils/errors');
const importRoutes = require('./routes/importRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'Project TOPCUT Backend',
      ok: true,
      endpoints: {
        health: '/health',
        imports: '/api/imports',
        leaderboard: '/api/leaderboard',
        admin: '/api/admin'
      }
    }
  });
});

app.get('/health', (_req, res) => {
  res.json({ data: { ok: true } });
});

app.use('/api/imports', importRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

app.use((error, _req, res, _next) => {
  const { status, body } = errorResponse(error);
  res.status(status).json(body);
});

module.exports = app;
