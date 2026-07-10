import { Router } from 'express';

const router = Router();

// GET /api/saves?moduleId=xxx
router.get('/', (req, res, next) => {
  try {
    const { moduleId } = req.query;
    if (!moduleId) return res.status(400).json({ error: 'moduleId required' });
    const saves = req.db.listSaves(moduleId);
    saves.forEach((s) => {
      if (s.campaign_json) s.campaign = JSON.parse(s.campaign_json);
      delete s.campaign_json;
    });
    res.json(saves);
  } catch (err) { next(err); }
});

// GET /api/saves/:id
router.get('/:id', (req, res, next) => {
  try {
    const save = req.db.getSave(req.params.id);
    if (!save) return res.status(404).json({ error: 'Save not found' });
    if (save.campaign_json) save.campaign = JSON.parse(save.campaign_json);
    delete save.campaign_json;
    res.json(save);
  } catch (err) { next(err); }
});

// POST /api/saves
router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};
    const campaignInput = body.campaign;
    if (campaignInput === undefined || campaignInput === null) {
      return res.status(400).json({ error: 'campaign is required' });
    }
    const moduleId = body.module_id ?? body.moduleId;
    if (!moduleId) {
      return res.status(400).json({ error: 'module_id or moduleId is required' });
    }
    const data = {
      id: body.id || `save_${Date.now()}`,
      module_id: moduleId,
      slot_number: body.slot_number ?? body.slotNumber ?? 0,
      name: body.name || 'Quicksave',
      campaign_json: typeof campaignInput === 'string' ? campaignInput : JSON.stringify(campaignInput),
    };
    const result = req.db.writeSave(data);
    res.json({ success: true, id: result.id });
  } catch (err) { next(err); }
});

// DELETE /api/saves/:id
router.delete('/:id', (req, res, next) => {
  try {
    req.db.deleteSave(req.params.id);
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
