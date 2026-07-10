import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class SQLiteDatabase {
  db;
  dir;

  constructor(dbPath) {
    this.dir = path.dirname(dbPath);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        author TEXT,
        version TEXT,
        system TEXT DEFAULT 'coc',
        description TEXT,
        content_json TEXT NOT NULL,
        style_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        slot_number INTEGER,
        name TEXT,
        campaign_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        type TEXT,
        source TEXT,
        url TEXT,
        local_path TEXT,
        prompt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_saves_module ON saves(module_id);
      CREATE INDEX IF NOT EXISTS idx_saves_module_created_at ON saves(module_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_images_type ON images(type);
      CREATE INDEX IF NOT EXISTS idx_images_type_created_at ON images(type, created_at);
    `);
  }

  // Modules
  listModules() {
    return this.db.prepare('SELECT id, name, author, version, system, description, created_at, updated_at FROM modules ORDER BY updated_at DESC').all();
  }

  getModule(id) {
    return this.db.prepare('SELECT * FROM modules WHERE id = ?').get(id);
  }

  saveModule(data) {
    const { id, name, author, version, system, description, content_json, style_json } = data;
    const existing = this.db.prepare('SELECT id FROM modules WHERE id = ?').get(id);
    if (existing) {
      this.db.prepare(`
        UPDATE modules SET name=?, author=?, version=?, system=?, description=?, content_json=?, style_json=?, updated_at=datetime('now')
        WHERE id=?
      `).run(name, author, version, system, description, content_json, style_json, id);
    } else {
      this.db.prepare(`
        INSERT INTO modules (id, name, author, version, system, description, content_json, style_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, author, version, system, description, content_json, style_json);
    }
    return { id };
  }

  deleteModule(id) {
    this.db.prepare('DELETE FROM modules WHERE id = ?').run(id);
    return { deleted: true };
  }

  // Saves
  listSaves(moduleId) {
    return this.db.prepare('SELECT * FROM saves WHERE module_id = ? ORDER BY slot_number, created_at DESC').all(moduleId);
  }

  getSave(id) {
    return this.db.prepare('SELECT * FROM saves WHERE id = ?').get(id);
  }

  writeSave(data) {
    const { id, module_id, slot_number, name, campaign_json } = data;
    const existing = this.db.prepare('SELECT id FROM saves WHERE id = ?').get(id);
    if (existing) {
      this.db.prepare('UPDATE saves SET module_id=?, slot_number=?, name=?, campaign_json=? WHERE id=?')
        .run(module_id, slot_number, name, campaign_json, id);
    } else {
      this.db.prepare('INSERT INTO saves (id, module_id, slot_number, name, campaign_json) VALUES (?, ?, ?, ?, ?)')
        .run(id, module_id, slot_number, name, campaign_json);
    }
    return { id };
  }

  deleteSave(id) {
    this.db.prepare('DELETE FROM saves WHERE id = ?').run(id);
    return { deleted: true };
  }

  // Settings
  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    return { key, value };
  }

  getAllSettings() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    const result = {};
    rows.forEach((r) => { result[r.key] = r.value; });
    return result;
  }

  // Images
  listImages(type) {
    if (type) return this.db.prepare('SELECT * FROM images WHERE type = ? ORDER BY created_at DESC').all(type);
    return this.db.prepare('SELECT * FROM images ORDER BY created_at DESC').all();
  }

  getImage(id) {
    return this.db.prepare('SELECT * FROM images WHERE id = ?').get(id);
  }

  saveImage(data) {
    const { id, type, source, url, local_path, prompt } = data;
    this.db.prepare('INSERT OR REPLACE INTO images (id, type, source, url, local_path, prompt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, type, source, url, local_path, prompt);
    return { id };
  }

  deleteImage(id) {
    this.db.prepare('DELETE FROM images WHERE id = ?').run(id);
    return { deleted: true };
  }
}

export default SQLiteDatabase;
