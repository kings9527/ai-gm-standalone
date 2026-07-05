import { Router } from 'express';

const router = Router();

// GET /api/settings
router.get('/', (req, res, next) => {
  try {
    const settings = req.db.getAllSettings();
    res.json(settings);
  } catch (err) { next(err); }
});

// GET /api/settings/:key
router.get('/:key', (req, res, next) => {
  try {
    const value = req.db.getSetting(req.params.key);
    res.json({ key: req.params.key, value });
  } catch (err) { next(err); }
});

// POST /api/settings
router.post('/', (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key required' });
    req.db.setSetting(key, String(value));
    res.json({ success: true, key, value });
  } catch (err) { next(err); }
});

export default router;
