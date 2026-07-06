import { Router } from 'express';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * 获取分类目录
 * @param {string} userDataDir - 用户数据目录
 * @param {string} type - 图片类型: bg | sprite | portrait
 * @returns {string} 分类目录路径
 */
function getImageDir(userDataDir, type) {
  const validTypes = ['bg', 'sprite', 'portrait', 'upload'];
  const imageType = validTypes.includes(type) ? type : 'bg';
  return path.join(userDataDir, 'images', imageType);
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 从 URL 下载图片到本地
 * @returns {Promise<string>} 本地文件路径
 */
async function downloadImage(url, destDir, filename) {
  ensureDir(destDir);
  const localPath = path.join(destDir, filename);

  const client = url.startsWith('https:') ? https : http;

  return new Promise((resolve, reject) => {
    client.get(url, (response) => {
      // 处理重定向
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadImage(response.headers.location, destDir, filename)
          .then(resolve)
          .catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode} for ${url}`));
        return;
      }
      const file = fs.createWriteStream(localPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(localPath);
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

// GET /api/images?type=bg|sprite|portrait
router.get('/', (req, res, next) => {
  try {
    const { type } = req.query;
    const images = req.db.listImages(type);
    res.json(images);
  } catch (err) { next(err); }
});

// GET /api/images/search?q=keyword&type=bg|sprite
router.get('/search', async (req, res, next) => {
  try {
    const { q, type } = req.query;
    if (!q) return res.status(400).json({ error: 'query required' });

    const imageType = type || 'bg';
    const settings = req.db.getAllSettings();
    const unsplashKey = settings.UNSPLASH_ACCESS_KEY;

    // 如果配置了 Unsplash API Key，使用真实 API
    if (unsplashKey) {
      const perPage = 12;
      const searchUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=${perPage}&orientation=${imageType === 'bg' ? 'landscape' : 'portrait'}`;

      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Client-ID ${unsplashKey}` },
      });

      if (!response.ok) {
        throw new Error(`Unsplash API error: ${response.status}`);
      }

      const data = await response.json();
      const results = (data.results || []).map((photo) => ({
        id: photo.id,
        url: photo.urls?.regular || photo.urls?.small,
        thumb: photo.urls?.small,
        source: 'unsplash',
        type: imageType,
        description: photo.description || photo.alt_description || '',
        author: photo.user?.name || 'Unknown',
        width: photo.width,
        height: photo.height,
      }));

      return res.json({ query: q, type: imageType, results });
    }

    // 无 Unsplash Key 时使用 Picsum Photos 作为 fallback（免费，免 key）
    const results = Array.from({ length: 10 }, (_, i) => {
      const seed = `${q.replace(/\s+/g, '_')}_${i}_${Date.now()}`;
      return {
        id: `picsum_${seed}`,
        url: `https://picsum.photos/seed/${seed}/${imageType === 'bg' ? '1600/900' : '512/768'}`,
        thumb: `https://picsum.photos/seed/${seed}/200/300`,
        source: 'picsum',
        type: imageType,
        description: `搜索: ${q}`,
        author: 'Picsum',
      };
    });

    res.json({ query: q, type: imageType, results, fallback: true, note: 'Unsplash API key not configured. Using Picsum fallback. Set UNSPLASH_ACCESS_KEY in settings.' });
  } catch (err) { next(err); }
});

// GET /api/images/:id
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const image = req.db.getImage(id);
    if (!image) return res.status(404).json({ error: 'Image not found' });
    res.json(image);
  } catch (err) { next(err); }
});

// DELETE /api/images/:id
router.delete('/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    const image = req.db.getImage(id);
    if (!image) return res.status(404).json({ error: 'Image not found' });

    // 删除本地文件
    if (image.local_path && fs.existsSync(image.local_path)) {
      fs.unlinkSync(image.local_path);
    }

    req.db.deleteImage(id);
    res.json({ deleted: true, id });
  } catch (err) { next(err); }
});

// POST /api/images/download
router.post('/download', async (req, res, next) => {
  try {
    const { url, type } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const imageType = type || 'bg';
    const imagesDir = getImageDir(req.userDataDir, imageType);
    ensureDir(imagesDir);

    const ext = path.extname(new URL(url).pathname) || '.jpg';
    const id = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}${ext}`;
    const localPath = path.join(imagesDir, filename);

    await downloadImage(url, imagesDir, filename);

    req.db.saveImage({
      id,
      type: imageType,
      source: 'downloaded',
      url,
      local_path: localPath,
      prompt: null,
    });

    res.json({ id, type: imageType, local_path: localPath, url });
  } catch (err) { next(err); }
});

// POST /api/images/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, type } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    const imageType = type || 'bg';
    const settings = req.db.getAllSettings();

    const apiKey = settings.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY in settings.' });
    }

    const size = imageType === 'bg' ? '1792x1024' : '1024x1792';

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ prompt, n: 1, size }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`DALL-E error: ${response.status} - ${errData.error?.message || 'Unknown'}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url;
    if (!imageUrl) throw new Error('DALL-E returned no image URL');

    // 下载生成的图片到本地缓存
    const imagesDir = getImageDir(req.userDataDir, imageType);
    const id = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filename = `${id}.png`;
    const localPath = path.join(imagesDir, filename);

    await downloadImage(imageUrl, imagesDir, filename);

    req.db.saveImage({
      id,
      type: imageType,
      source: 'generated',
      url: imageUrl,
      local_path: localPath,
      prompt,
    });

    res.json({ id, type: imageType, url: imageUrl, local_path: localPath, prompt, provider: 'dalle' });
  } catch (err) { next(err); }
});

// POST /api/images/upload
router.post('/upload', async (req, res, next) => {
  try {
    const { data, filename, type } = req.body;
    if (!data) return res.status(400).json({ error: 'image data required' });

    const imageType = type || 'upload';
    const imagesDir = getImageDir(req.userDataDir, imageType);
    ensureDir(imagesDir);

    // 解析 base64 数据
    const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // 确定扩展名
    const ext = path.extname(filename || '') || '.png';
    const id = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const outFilename = `${id}${ext}`;
    const localPath = path.join(imagesDir, outFilename);

    fs.writeFileSync(localPath, buffer);

    req.db.saveImage({
      id,
      type: imageType,
      source: 'uploaded',
      url: null,
      local_path: localPath,
      prompt: null,
    });

    res.json({ id, type: imageType, local_path: localPath });
  } catch (err) { next(err); }
});

export default router;
