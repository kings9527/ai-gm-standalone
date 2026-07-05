import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from './db/sqlite.js';
import llmRouter from './routes/llm.js';
import modulesRouter from './routes/modules.js';
import savesRouter from './routes/saves.js';
import imagesRouter from './routes/images.js';
import settingsRouter from './routes/settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 9742;

// Ensure user data directory exists
const userDataDir = process.env.AIGM_USER_DATA || path.join(process.env.HOME || process.env.USERPROFILE, 'AI-GM');

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Init database
const db = new Database(path.join(userDataDir, 'ai-gm.db'));
db.init();

// Attach db to requests
app.use((req, _res, next) => {
  req.db = db;
  req.userDataDir = userDataDir;
  next();
});

// Health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/llm', llmRouter);
app.use('/api/modules', modulesRouter);
app.use('/api/saves', savesRouter);
app.use('/api/images', imagesRouter);
app.use('/api/settings', settingsRouter);

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[Backend Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[AI-GM Backend] Running on port ${PORT}`);
  console.log(`[AI-GM Backend] User data: ${userDataDir}`);
});

export default app;
