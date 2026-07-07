#!/usr/bin/env node
/**
 * AI-GM Backend API Stress Test
 * Tests concurrent request stability
 */

const BASE = process.env.API_BASE || 'http://localhost:9742';

async function req(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

async function stressTest(name, concurrency, iterations, fn) {
  console.log(`\n🔥 Stress Test: ${name} (${concurrency} concurrent × ${iterations} iterations)`);
  const start = Date.now();
  let success = 0;
  let failed = 0;
  const errors = [];

  for (let i = 0; i < iterations; i++) {
    const batch = Array.from({ length: concurrency }, (_, j) => fn(i * concurrency + j).catch(err => {
      failed++;
      errors.push(err.message);
      return null;
    }));
    const results = await Promise.all(batch);
    results.forEach(r => { if (r !== null) success++; });
  }

  const elapsed = Date.now() - start;
  const rps = ((success + failed) / (elapsed / 1000)).toFixed(1);
  console.log(`  ⏱️  ${elapsed}ms | ✅ ${success} | ❌ ${failed} | ${rps} req/s`);
  if (errors.length > 0) {
    const unique = [...new Set(errors)].slice(0, 5);
    unique.forEach(e => console.log(`    ⚠️ ${e}`));
  }
  return { success, failed, elapsed };
}

async function run() {
  console.log('\n🧪 AI-GM Backend Stress Test Suite\n');

  // Setup: create a test module
  await req('/api/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'stress_test_mod',
      name: 'Stress Test Module',
      system: 'coc',
      content: { scenes: [{ id: 's1', title: 'Start' }] },
    }),
  });

  // Test 1: Concurrent health checks
  await stressTest('Health Check', 50, 10, async (idx) => {
    const { body } = await req('/health');
    if (body.status !== 'ok') throw new Error('Health failed');
    return body;
  });

  // Test 2: Concurrent module reads
  await stressTest('Module Read', 30, 10, async (idx) => {
    const { body } = await req('/api/modules/stress_test_mod');
    if (body.name !== 'Stress Test Module') throw new Error('Module read failed');
    return body;
  });

  // Test 3: Concurrent settings writes (same key - potential race)
  await stressTest('Settings Write (race)', 20, 5, async (idx) => {
    const { body } = await req('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'stress_test_val', value: `val_${idx}_${Date.now()}` }),
    });
    if (!body.success) throw new Error('Settings write failed');
    return body;
  });

  // Test 4: Concurrent save operations
  await stressTest('Save Create/Read', 15, 5, async (idx) => {
    const saveId = `stress_save_${idx}`;
    await req('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: saveId,
        module_id: 'stress_test_mod',
        slot_number: idx % 10,
        name: `Stress Save ${idx}`,
        campaign: { current_scene: 's1', hp: 100 },
      }),
    });
    const { body } = await req(`/api/saves/${saveId}`);
    if (body.name !== `Stress Save ${idx}`) throw new Error('Save mismatch');
    return body;
  });

  // Test 5: Image search (external API call)
  await stressTest('Image Search', 10, 3, async (idx) => {
    const { body } = await req(`/api/images/search?q=forest&type=bg`);
    if (!body.results || body.results.length === 0) throw new Error('Image search failed');
    return body;
  });

  // Cleanup
  const saves = await req('/api/saves?moduleId=stress_test_mod');
  if (saves.body && Array.isArray(saves.body)) {
    await Promise.all(saves.body.map(s => req(`/api/saves/${s.id}`, { method: 'DELETE' })));
  }
  await req('/api/modules/stress_test_mod', { method: 'DELETE' });

  console.log('\n📊 Stress test complete\n');
}

run().catch(console.error);
