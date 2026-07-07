#!/usr/bin/env node
/**
 * IPC Client Interface Consistency Test
 * Verifies that main.cjs handlers, preload.cjs exposures, and electron.ts methods are in sync.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Extract ipcMain.handle registrations from main.cjs
function extractMainHandlers(content) {
  const handlers = [];
  const regex = /ipcMain\.handle\('([^']+)'/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    handlers.push(match[1]);
  }
  return handlers.sort();
}

// Extract exposeInMainWorld methods from preload.cjs
function extractPreloadMethods(content) {
  const methods = [];
  const regex = /(\w+):\s*\([^)]*\)\s*=>\s*ipcRenderer\.(invoke|on)\('([^']+)'/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    methods.push({ name: match[1], channel: match[3], type: match[2] });
  }
  return methods.sort((a, b) => a.name.localeCompare(b.name));
}

// Extract electronAPI methods from electron.ts
function extractElectronAPIMethods(content) {
  const methods = [];
  // Match async methods
  const asyncRegex = /async\s+(\w+)\([^)]*\)\s*\{/g;
  let match;
  while ((match = asyncRegex.exec(content)) !== null) {
    methods.push(match[1]);
  }
  return [...new Set(methods)].sort();
}

function run() {
  console.log('\n🔌 IPC Interface Consistency Test\n');

  let mismatches = 0;

  const mainContent = fs.readFileSync(path.join(ROOT, 'electron/main.cjs'), 'utf-8');
  const preloadContent = fs.readFileSync(path.join(ROOT, 'electron/preload.cjs'), 'utf-8');
  const electronContent = fs.readFileSync(path.join(ROOT, 'frontend/src/api/electron.ts'), 'utf-8');

  const mainHandlers = extractMainHandlers(mainContent);
  const preloadMethods = extractPreloadMethods(preloadContent);
  const apiMethods = extractElectronAPIMethods(electronContent);

  console.log(`📦 Main Process Handlers: ${mainHandlers.length}`);
  console.log(`📦 Preload Exposed Methods: ${preloadMethods.length}`);
  console.log(`📦 Frontend API Methods: ${apiMethods.length}`);

  // Check: every preload method has a corresponding main handler (except event listeners)
  const eventListeners = ['aigm:llm:stream:chunk', 'aigm:llm:stream:end'];
  console.log('\n--- Preload → Main Handler Mapping ---');
  for (const method of preloadMethods) {
    if (method.type === 'on') {
      console.log(`  ℹ️  ${method.name} → ${method.channel} (event listener)`);
      continue;
    }
    const hasHandler = mainHandlers.includes(method.channel);
    if (hasHandler) {
      console.log(`  ✅ ${method.name} → ${method.channel}`);
    } else {
      console.log(`  ❌ ${method.name} → ${method.channel} (NO HANDLER)`);
      mismatches++;
    }
  }

  // Check: every main handler is exposed in preload
  console.log('\n--- Main Handler → Preload Exposure ---');
  for (const handler of mainHandlers) {
    const exposed = preloadMethods.find(m => m.channel === handler);
    if (exposed) {
      console.log(`  ✅ ${handler} → ${exposed.name}`);
    } else {
      console.log(`  ❌ ${handler} (NOT EXPOSED IN PRELOAD)`);
      mismatches++;
    }
  }

  // Check: frontend API methods match preload methods
  console.log('\n--- Frontend API → Preload Method ---');
  const preloadNames = preloadMethods.map(m => m.name);
  for (const method of apiMethods) {
    const exposed = preloadNames.includes(method);
    if (exposed) {
      console.log(`  ✅ ${method}`);
    } else {
      // Some methods are composite (like llmStream combining onStreamChunk/onStreamEnd)
      if (method === 'llmStream' || method === 'onStreamChunk' || method === 'onStreamEnd') {
        console.log(`  ⚠️ ${method} (stream composite)`);
      } else {
        console.log(`  ❌ ${method} (NOT IN PRELOAD)`);
        mismatches++;
      }
    }
  }

  // Check for missing stream handler in main
  console.log('\n--- Stream Handler Check ---');
  const streamHandler = mainHandlers.find(h => h.includes('stream'));
  if (streamHandler) {
    console.log(`  ✅ Stream handler found: ${streamHandler}`);
  } else {
    console.log(`  ❌ No stream handler found`);
    mismatches++;
  }

  console.log(`\n📊 Results: ${mismatches === 0 ? 'ALL CLEAR' : `${mismatches} mismatch(es) found`}`);
  process.exit(mismatches > 0 ? 1 : 0);
}

run();
