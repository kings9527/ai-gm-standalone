#!/usr/bin/env node
/**
 * Settings Serialization Test (BUG-2 regression)
 * Verifies backend flatten/unflatten round-trip with nested objects.
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
  console.log('\n🔧 Settings Serialization Test (BUG-2)\n');

  // Clear all settings first
  await test('Clear all settings', async () => {
    const { body } = await req('/api/settings', { method: 'DELETE' });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  // Write nested object via batch API
  const nestedPayload = {
    llm: {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-12345',
      model: 'gpt-4o-mini',
      maxTokens: 512,
      temperature: 0.7,
      timeout: 30000,
      retries: 2,
    },
    image: {
      unsplashKey: 'unsplash-test-key',
      dalleKey: 'dalle-test-key',
      defaultStrategy: 'search',
    },
    game: {
      typewriterSpeed: 30,
      fontSize: 16,
      autoAdvanceDelay: 0,
      skipUnread: false,
    },
    theme: {
      mode: 'dark',
      customVars: { '--agm-bg': '#0a0a0a' },
    },
  };

  await test('Batch save nested settings', async () => {
    const { body } = await req('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nestedPayload),
    });
    if (!body.success) throw new Error(JSON.stringify(body));
    if (body.saved !== 17) throw new Error(`Expected 17 keys saved, got ${body.saved}`);
  });

  // Read back via GET /api/settings
  await test('Read all settings as nested object', async () => {
    const { body } = await req('/api/settings');
    if (body.llm?.provider !== 'openai') throw new Error(`llm.provider mismatch: ${JSON.stringify(body.llm)}`);
    if (body.llm?.apiKey !== 'sk-test-12345') throw new Error(`llm.apiKey mismatch`);
    if (body.image?.unsplashKey !== 'unsplash-test-key') throw new Error(`image.unsplashKey mismatch`);
    if (body.game?.typewriterSpeed !== 30) throw new Error(`game.typewriterSpeed mismatch`);
    if (body.theme?.mode !== 'dark') throw new Error(`theme.mode mismatch`);
    if (body.theme?.customVars?.['--agm-bg'] !== '#0a0a0a') throw new Error(`theme.customVars mismatch`);
  });

  // Read single key via dot-path
  await test('Read dot-path key (llm.apiKey)', async () => {
    const { body } = await req('/api/settings/llm.apiKey');
    if (body.value !== 'sk-test-12345') throw new Error(`value mismatch: ${JSON.stringify(body)}`);
  });

  await test('Read dot-path key (theme.mode)', async () => {
    const { body } = await req('/api/settings/theme.mode');
    if (body.value !== 'dark') throw new Error(`value mismatch: ${JSON.stringify(body)}`);
  });

  // Old single-key API still works
  await test('Old single-key API still compatible', async () => {
    await req('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'legacy_key', value: 'legacy_value' }),
    });
    const { body } = await req('/api/settings/legacy_key');
    if (body.value !== 'legacy_value') throw new Error(`legacy value mismatch: ${JSON.stringify(body)}`);
  });

  // Cleanup
  await test('Cleanup: clear all settings', async () => {
    const { body } = await req('/api/settings', { method: 'DELETE' });
    if (!body.success) throw new Error(JSON.stringify(body));
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
