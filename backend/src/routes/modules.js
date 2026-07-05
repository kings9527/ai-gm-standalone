import { Router } from 'express';

const router = Router();

// GET /api/modules
router.get('/', (req, res, next) => {
  try {
    const modules = req.db.listModules();
    res.json(modules);
  } catch (err) { next(err); }
});

// GET /api/modules/:id
router.get('/:id', (req, res, next) => {
  try {
    const mod = req.db.getModule(req.params.id);
    if (!mod) return res.status(404).json({ error: 'Module not found' });
    // Parse JSON fields
    if (mod.content_json) mod.content = JSON.parse(mod.content_json);
    if (mod.style_json) mod.style = JSON.parse(mod.style_json);
    delete mod.content_json;
    delete mod.style_json;
    res.json(mod);
  } catch (err) { next(err); }
});

// POST /api/modules
router.post('/', (req, res, next) => {
  try {
    const { id, name, author, version, system, description, content, style } = req.body;
    const data = {
      id: id || `mod_${Date.now()}`,
      name: name || 'Untitled Module',
      author: author || '',
      version: version || '1.0.0',
      system: system || 'coc',
      description: description || '',
      content_json: typeof content === 'string' ? content : JSON.stringify(content || {}),
      style_json: style ? (typeof style === 'string' ? style : JSON.stringify(style)) : null,
    };
    const result = req.db.saveModule(data);
    res.json({ success: true, id: result.id });
  } catch (err) { next(err); }
});

// DELETE /api/modules/:id
router.delete('/:id', (req, res, next) => {
  try {
    req.db.deleteModule(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// POST /api/modules/import
router.post('/import', (req, res, next) => {
  try {
    const { content } = req.body;
    const parsed = JSON.parse(content);
    if (!parsed.id) parsed.id = `mod_${Date.now()}`;
    const data = {
      id: parsed.id,
      name: parsed.name || 'Imported Module',
      author: parsed.author || '',
      version: parsed.version || '1.0.0',
      system: parsed.system || 'coc',
      description: parsed.description || '',
      content_json: JSON.stringify(parsed),
      style_json: parsed.style ? JSON.stringify(parsed.style) : null,
    };
    const result = req.db.saveModule(data);
    res.json({ success: true, id: result.id });
  } catch (err) { next(err); }
});

export default router;
