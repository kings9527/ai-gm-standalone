import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';
import Database from '../db/sqlite.js';
import llmRouter from './llm.js';

let server;
let port;

before(() => {
  const app = express();
  app.use(express.json());
  const db = new Database(':memory:');
  db.init();
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/api/llm', llmRouter);
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

describe('LLM API provider validation (BUG-3)', () => {
  test('POST /chat rejects missing provider with 400', async () => {
    const res = await request('POST', '/api/llm/chat', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('provider is required'), `Expected provider error, got: ${res.body.error}`);
  });

  test('POST /chat rejects empty provider string with 400', async () => {
    const res = await request('POST', '/api/llm/chat', {
      provider: '',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('provider is required'));
  });

  test('POST /stream rejects missing provider with 400', async () => {
    const res = await request('POST', '/api/llm/stream', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('provider is required'), `Expected provider error, got: ${res.body.error}`);
  });

  test('POST /stream rejects empty provider string with 400', async () => {
    const res = await request('POST', '/api/llm/stream', {
      provider: '',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('provider is required'));
  });

  test('POST /chat with valid provider proceeds past validation (returns 500 or upstream error, not 400)', async () => {
    const res = await request('POST', '/api/llm/chat', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
    });
    assert.notStrictEqual(res.status, 400, 'Should not be 400 when provider is provided');
  });
});
