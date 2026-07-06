import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';

const router = Router();

const STYLES_DIR = 'styles';

function getStylesDir(userDataDir) {
  return path.join(userDataDir, STYLES_DIR);
}

async function ensureStylesDir(userDataDir) {
  const dir = getStylesDir(userDataDir);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// GET /api/styles — list all saved styles
router.get('/', async (req, res, next) => {
  try {
    const dir = await ensureStylesDir(req.userDataDir);
    const files = await fs.readdir(dir);
    const styles = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const content = await fs.readFile(path.join(dir, f), 'utf-8');
          const data = JSON.parse(content);
          return { id: f.replace('.json', ''), name: data.name || f.replace('.json', ''), updatedAt: data.updatedAt || null };
        }),
    );
    res.json(styles);
  } catch (err) {
    next(err);
  }
});

// GET /api/styles/:id — get a specific style
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const filePath = path.join(await ensureStylesDir(req.userDataDir), `${id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(content));
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Style not found' });
    } else {
      next(err);
    }
  }
});

// POST /api/styles — save a style
router.post('/', async (req, res, next) => {
  try {
    const { id, ...styleData } = req.body;
    const styleId = id || `style_${Date.now()}`;
    const toSave = { ...styleData, id: styleId, updatedAt: new Date().toISOString() };
    const dir = await ensureStylesDir(req.userDataDir);
    await fs.writeFile(path.join(dir, `${styleId}.json`), JSON.stringify(toSave, null, 2), 'utf-8');
    res.json({ success: true, id: styleId, style: toSave });
  } catch (err) {
    next(err);
  }
});

// PUT /api/styles/:id — update a style
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { ...styleData } = req.body;
    const dir = await ensureStylesDir(req.userDataDir);
    const filePath = path.join(dir, `${id}.json`);
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    } catch { /* file not found, start fresh */ }
    const toSave = { ...existing, ...styleData, id, updatedAt: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(toSave, null, 2), 'utf-8');
    res.json({ success: true, id, style: toSave });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/styles/:id — delete a style
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const filePath = path.join(await ensureStylesDir(req.userDataDir), `${id}.json`);
    await fs.unlink(filePath);
    res.json({ success: true, id });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Style not found' });
    } else {
      next(err);
    }
  }
});

export default router;
