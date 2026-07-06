#!/usr/bin/env node
/**
 * AI-GM Backend API Comprehensive Test
 * Tests all routes: health, settings, modules, saves, llm, images
 */

const BASE = 'http://localhost:9742';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

async function req(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function run() {
  console.log('\n🧪 AI-GM Backend API Test Suite\n');

  // ── Health ──
  await test('Health check returns ok', async () => {
    const { body } = await req('/health');
    if (body.status !== 'ok') throw new Error(JSON.stringify(body));
  });

  // ── Settings ──
  await test('Settings: write key', async () => {
    const { body } = await req('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'theme', value: 'dark' }),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  await test('Settings: read single key', async () => {
    const { body } = await req('/api/settings/theme');
    if (body.value !== 'dark') throw new Error(JSON.stringify(body));
  });

  await test('Settings: read all', async () => {
    const { body } = await req('/api/settings');
    if (body.theme !== 'dark') throw new Error(JSON.stringify(body));
  });

  // ── Modules ──
  await test('Modules: create', async () => {
    const { body } = await req('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test_mod_api',
        name: 'API Test Module',
        system: 'coc',
        content: { scenes: [{ id: 's1', title: 'Start' }] },
        style: { theme: 'dark' },
      }),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  await test('Modules: list', async () => {
    const { body } = await req('/api/modules');
    if (!Array.isArray(body) || body.length === 0) throw new Error('Empty list');
  });

  await test('Modules: read single', async () => {
    const { body } = await req('/api/modules/test_mod_api');
    if (body.name !== 'API Test Module') throw new Error(JSON.stringify(body));
    if (!body.content || !body.content.scenes) throw new Error('content not parsed');
  });

  await test('Modules: update', async () => {
    const { body } = await req('/api/modules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test_mod_api',
        name: 'API Test Module Updated',
        system: 'coc',
        content: { scenes: [{ id: 's1', title: 'Updated Start' }] },
      }),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  await test('Modules: verify update', async () => {
    const { body } = await req('/api/modules/test_mod_api');
    if (body.name !== 'API Test Module Updated') throw new Error(JSON.stringify(body));
  });

  // ── Saves ──
  await test('Saves: create', async () => {
    const { body } = await req('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test_save_api',
        module_id: 'test_mod_api',
        slot_number: 1,
        name: 'Test Save',
        campaign: { current_scene: 's1', hp: 100 },
      }),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  await test('Saves: list by module', async () => {
    const { body } = await req('/api/saves?moduleId=test_mod_api');
    if (!Array.isArray(body) || body.length === 0) throw new Error('Empty saves');
  });

  await test('Saves: read single', async () => {
    const { body } = await req('/api/saves/test_save_api');
    if (body.name !== 'Test Save') throw new Error(JSON.stringify(body));
    if (!body.campaign) throw new Error('campaign not parsed');
  });

  await test('Saves: update', async () => {
    const { body } = await req('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'test_save_api',
        module_id: 'test_mod_api',
        slot_number: 1,
        name: 'Test Save Updated',
        campaign: { current_scene: 's2', hp: 90 },
      }),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  // ── LLM ──
  await test('LLM: error on missing key', async () => {
    const { body } = await req('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (!body.error || !body.error.includes('API key')) throw new Error(JSON.stringify(body));
  });

  await test('LLM: error on unknown provider', async () => {
    const { body } = await req('/api/llm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (!body.error || !body.error.includes('Unknown provider')) throw new Error(JSON.stringify(body));
  });

  // ── Images ──
  await test('Images: search', async () => {
    const { body } = await req('/api/images/search?q=forest');
    if (!body.results || body.results.length === 0) throw new Error(JSON.stringify(body));
  });

  // ── 404 ──
  await test('404 returns JSON error', async () => {
    const { body } = await req('/api/nonexistent');
    if (!body.error || !body.error.includes('Cannot GET')) throw new Error(JSON.stringify(body));
  });

  // ── Cleanup ──
  await test('Cleanup: delete save', async () => {
    const { body } = await req('/api/saves/test_save_api', { method: 'DELETE' });
    if (!body.deleted) throw new Error(JSON.stringify(body));
  });

  await test('Cleanup: delete module', async () => {
    const { body } = await req('/api/modules/test_mod_api', { method: 'DELETE' });
    if (!body.deleted) throw new Error(JSON.stringify(body));
  });

  await test('Cleanup: verify save deleted', async () => {
    const { status } = await req('/api/saves/test_save_api');
    if (status !== 404) throw new Error(`Expected 404, got ${status}`);
  });

  // ── Summary ──
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
