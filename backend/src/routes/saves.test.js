import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import Database from '../db/sqlite.js';
import savesRouter from './saves.js';

let server;
let port;

before(() => {
  const app = express();
  app.use(express.json());
  const db = new Database(':memory:');
  db.init();
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/api/saves', savesRouter);
  server = app.listen(0);
  port = server.address().port;
});

after(() => {
  server.close();
});

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('Saves API field name consistency (BUG-1)', () => {
  test('POST rejects campaign_json alone — only campaign is accepted', async () => {
    const res = await request('POST', '/api/saves', {
      module_id: 'mod_test',
      campaign_json: JSON.stringify({ scene: 'intro' }),
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('campaign is required'), `Expected campaign error, got: ${res.body.error}`);
  });

  test('POST accepts campaign object and returns success', async () => {
    const res = await request('POST', '/api/saves', {
      module_id: 'mod_test',
      campaign: { scene: 'intro', player: 'hero' },
      name: 'Test Save',
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.id, 'Expected save id in response');
  });

  test('GET list returns campaign (not campaign_json)', async () => {
    const saveRes = await request('POST', '/api/saves', {
      module_id: 'mod_test_list',
      campaign: { scene: 'battle', turn: 3 },
      name: 'List Test',
    });
    assert.strictEqual(saveRes.status, 200);

    const listRes = await request('GET', '/api/saves?moduleId=mod_test_list');
    assert.strictEqual(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body), 'Expected array response');
    assert.strictEqual(listRes.body.length, 1);
    const save = listRes.body[0];
    assert.ok(save.campaign, 'Expected campaign field in response');
    assert.deepStrictEqual(save.campaign, { scene: 'battle', turn: 3 });
    assert.strictEqual(save.campaign_json, undefined, 'campaign_json should NOT be exposed');
  });

  test('GET by id returns campaign (not campaign_json)', async () => {
    const saveRes = await request('POST', '/api/saves', {
      module_id: 'mod_test_single',
      campaign: { scene: 'ending', player: 'hero' },
      name: 'Single Test',
    });
    assert.strictEqual(saveRes.status, 200);
    const id = saveRes.body.id;

    const getRes = await request('GET', `/api/saves/${id}`);
    assert.strictEqual(getRes.status, 200);
    assert.ok(getRes.body.campaign, 'Expected campaign field');
    assert.deepStrictEqual(getRes.body.campaign, { scene: 'ending', player: 'hero' });
    assert.strictEqual(getRes.body.campaign_json, undefined, 'campaign_json should NOT be exposed');
  });
});
