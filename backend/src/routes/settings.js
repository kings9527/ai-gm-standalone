import { Router } from 'express';
import { flatten, unflatten } from '../utils/settings-serializer.js';

const router = Router();

// GET /api/settings — 返回反扁平化后的嵌套对象
router.get('/', (req, res, next) => {
  try {
    const flat = req.db.getAllSettings();
    res.json(unflatten(flat));
  } catch (err) { next(err); }
});

// GET /api/settings/:key — 支持点号路径（如 llm.apiKey）
router.get('/:key', (req, res, next) => {
  try {
    const flat = req.db.getAllSettings();
    const nested = unflatten(flat);
    const parts = req.params.key.split('.');
    let value = nested;
    for (const part of parts) {
      value = value?.[part];
    }
    res.json({ key: req.params.key, value: value ?? null });
  } catch (err) { next(err); }
});

// POST /api/settings — 兼容两种模式：
//  1) { key, value }   单 key 存储（旧模式）
//  2) 完整嵌套对象      自动 flatten 后批量存储（新模式），会先清空旧设置
router.post('/', (req, res, next) => {
  try {
    if ('key' in req.body && typeof req.body.key === 'string') {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'key required' });
      req.db.setSetting(key, String(value));
      res.json({ success: true, key, value });
    } else {
      // 新模式：先清空旧设置，再写入新的嵌套对象
      const flat = flatten(req.body);
      req.db.db.exec('DELETE FROM settings');
      for (const [k, v] of Object.entries(flat)) {
        req.db.setSetting(k, v);
      }
      res.json({ success: true, saved: Object.keys(flat).length });
    }
  } catch (err) { next(err); }
});

// DELETE /api/settings — 清空所有设置
router.delete('/', (req, res, next) => {
  try {
    req.db.db.exec('DELETE FROM settings');
    res.json({ success: true, cleared: true });
  } catch (err) { next(err); }
});

export default router;
