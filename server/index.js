import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import dataRouter from './routes/data.js';
import rpcRouter from './routes/rpc.js';
import uploadRouter from './routes/upload.js';
import { UPLOADS_DIR } from './routes/upload.js';
import whatsappRouter from './routes/whatsapp.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || true,
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// API routes
app.use('/api/auth', authRouter);
app.use('/api/query', dataRouter);
app.use('/api/rpc', rpcRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/whatsapp', whatsappRouter);

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Serve built frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚌 MeuBusApp Server rodando na porta ${PORT}`);
  console.log(`   Banco: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'setebus'}`);
  console.log(`   Modo: ${process.env.NODE_ENV || 'development'}\n`);
});
