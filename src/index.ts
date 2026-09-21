import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { getDb } from './db/database.js';
import { authRouter } from './routes/auth.js';
import { classroomRouter } from './routes/classrooms.js';
import { taskRouter } from './routes/tasks.js';
import { notificationRouter } from './routes/notifications.js';
import { uploadRouter } from './routes/uploads.js';
import { sseManager } from './sse/sseManager.js';
import { JWT_SECRET } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

// Serve static uploads
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// SSE Realtime Endpoint
app.get('/api/realtime/events', (req: Request, res: Response) => {
  const token = (req.query.token as string) || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.substring(7) : null);

  if (!token) {
    res.status(401).json({ error: 'Token required for realtime connection' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number };

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    sseManager.addClient(decoded.id, res);
  } catch (err) {
    res.status(401).json({ error: 'Invalid token for realtime' });
  }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/classrooms', classroomRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/uploads', uploadRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve client build in production mode
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
}

async function startServer() {
  try {
    console.log('Initializing TaskMe Production Database...');
    await getDb();

    app.listen(PORT, () => {
      console.log(`TaskMe Production Server is running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start TaskMe server:', err);
    process.exit(1);
  }
}

startServer();
