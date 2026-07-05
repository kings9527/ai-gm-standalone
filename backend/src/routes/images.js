import { Router } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const router = Router();

// GET /api/images?type=bg|sprite|portrait
router.get('/', (req, res, next) => {
  try {
    const { type } = req.query;
    const images = req.db.listImages(type);
    res.json(images);
  } catch (err) { next(err); }
});

// GET /api/images/search?q=keyword
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'query required' });

    // Unsplash Source (free, no key needed)
    const searchUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(q)}`;

    res.json({
      query: q,
      results: [{ id: `unsplash_${Date.now()}`, url: searchUrl, source: 'unsplash', type: 'bg' }],
    });
  } catch (err) { next(err); }
});

// POST /api/images/download
router.post('/download', async (req, res, next) => {
  try {
    const { url, type } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const imagesDir = path.join(req.userDataDir, 'images', type || 'bg');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const filename = `img_${Date.now()}${ext}`;
    const localPath = path.join(imagesDir, filename);

    const file = fs.createWriteStream(localPath);
    const client = url.startsWith('https:') ? https : http;

    await new Promise((resolve, reject) => {
      client.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(true);
        });
      }).on('error', reject);
    });

    const id = `img_${Date.now()}`;
    req.db.saveImage({ id, type: type || 'bg', source: 'downloaded', url, local_path: localPath });

    res.json({ id, local_path: localPath });
  } catch (err) { next(err); }
});

// POST /api/images/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, provider } = req.body;
    const settings = req.db.getAllSettings();

    if (provider === 'dalle') {
      const apiKey = settings.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OpenAI API key not configured');

      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ prompt, n: 1, size: '1024x1024' }),
      });

      if (!response.ok) throw new Error(`DALL-E error: ${response.status}`);
      const data = await response.json();
      const imageUrl = data.data?.[0]?.url;

      res.json({ url: imageUrl, provider: 'dalle', prompt });
    } else {
      throw new Error(`Image generation provider "${provider}" not supported`);
    }
  } catch (err) { next(err); }
});

export default router;
