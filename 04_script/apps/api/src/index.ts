import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { migrate, pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { assetsRouter } from './routes/assets.js';
import { listingsRouter } from './routes/listings.js';
import { ordersRouter } from './routes/orders.js';
import { tradesRouter } from './routes/trades.js';
import { transfersRouter } from './routes/transfers.js';
import { transactionsRouter } from './routes/transactions.js';
import { partnerRouter } from './partner/routes.js';
import { attachWs } from './ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const app = express();
const port = Number(process.env.PORT || 3001);
const host = process.env.API_HOST || '0.0.0.0';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'tps-api' });
});

app.use('/api/auth', authRouter);
app.use('/api/partner/v1', partnerRouter);
app.use('/api/admin', adminRouter);
app.use('/api', assetsRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/trades', tradesRouter);
app.use('/api/transactions', transactionsRouter);

const serveWeb = process.env.SERVE_WEB === 'true' || process.env.SERVE_WEB === '1';
if (serveWeb) {
  const webRoot = process.env.WEB_ROOT?.trim() || path.resolve(__dirname, 'public');
  app.use(express.static(webRoot, { index: false, fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(webRoot, 'index.html'), (err) => {
      if (err) next();
    });
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

async function main() {
  await migrate();
  const { backfillDefaultManagedWallets } = await import('./managedWallet.js');
  const n = await backfillDefaultManagedWallets();
  if (n) console.log(`Backfilled ${n} default managed wallet(s)`);
  const server = http.createServer(app);
  attachWs(server);
  server.listen(port, host, () => {
    console.log(`TPS API listening on http://${host}:${port}`);
    if (serveWeb) {
      console.log(
        `Serving web from ${process.env.WEB_ROOT?.trim() || path.resolve(__dirname, 'public')}`,
      );
    }
  });
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
