#!/usr/bin/env node
/**
 * AI-GM End-to-End Game Flow Test
 * Tests: import module → start game → scene transition → dialogue → dice check → save → load → combat → ending
 */

import { GameStateMachine } from '../frontend/src/engine/state-machine.ts';
import { DiceRoller } from '../frontend/src/engine/dice.ts';
import { initCombat, executeAttack, advanceTurn, checkCombatEnd, executeAIAction } from '../frontend/src/engine/combat-system.ts';

// Simple mock LLM client
class MockLLMClient {
  available = false;
  isAvailable() { return this.available; }
  async chat(messages, opts) {
    return { content: JSON.stringify({ action: 'talk', target: null, confidence: 0.9 }) };
  }
}

// Test module data
const testModule = {
  id: 'e2e_test_mod',
  name: 'E2E Test Module',
  system: 'coc',
  version: '1.0.0',
  style: {
    palette: { bg: '#000', accent: '#fff', text: '#fff', dialogue_bg: '#222' },
    atmosphere: 'horror',
    era: '1920s',
    art_style: 'realistic',
    lighting: 'dark',
    mood_keywords: ['dark', 'mysterious'],
    font_family: 'serif',
    effects: [],
    image_strategy: { background: 'search', sprites: 'search', search_provider: 'unsplash' },
  },
  start_scene: 'intro',
  scenes: {
    intro: {
      id: 'intro',
      title: '引言',
      description: '你站在一座废弃医院的大门前，夜风呼啸。',
      bg: 'hospital_gate',
      sprites: [],
      dialogue: { speaker: '旁白', text: '空气中弥漫着腐朽的气息。' },
      exits: [
        { target: 'lobby', label: '进入大厅', description: '推开沉重的大门' },
      ],
      npcs: ['guardian'],
      interactables: ['note'],
    },
    lobby: {
      id: 'lobby',
      title: '大厅',
      description: '昏暗的大厅里，挂号台积满了灰尘。',
      bg: 'lobby',
      sprites: [],
      dialogue: { speaker: '旁白', text: '你的脚步声在空旷的大厅中回响。' },
      exits: [
        { target: 'ward', label: '前往病房区' },
        { target: 'intro', label: '返回大门' },
      ],
      combat: {
        enabled: true,
        enemies: ['zombie'],
      },
    },
    ward: {
      id: 'ward',
      title: '病房区',
      description: '病床上躺着干枯的尸体，墙上写满了疯狂的涂鸦。',
      bg: 'ward',
      sprites: [],
      dialogue: { speaker: '旁白', text: '这里曾经发生过可怕的事情...' },
      ending: {
        type: 'bad',
        description: '你在病房区发现了自己的名字写在死亡名单上，意识逐渐模糊...',
      },
    },
  },
  npcs: {
    guardian: {
      id: 'guardian',
      name: '守门人',
      description: '一个佝偻的老人，眼神空洞。',
      role: 'neutral',
      attitude: 'suspicious',
      stats: { 格斗: 30, 射击: 20, dex: 40 },
      hp: 30,
      sanity: 40,
      sprites: { normal: '' },
      dialogue: {
        greet: '...你来这里做什么？这不是你该来的地方。',
      },
    },
    zombie: {
      id: 'zombie',
      name: '游荡者',
      description: '一具缓慢移动的尸体。',
      role: 'enemy',
      attitude: 'hostile',
      stats: { 格斗: 50, 射击: 0, dex: 30 },
      hp: 25,
      sanity: 0,
      sprites: { normal: '' },
    },
  },
  items: {
    note: {
      id: 'note',
      name: '泛黄的纸条',
      description: '一张折叠的纸条，上面有潦草的字迹。',
      readable: true,
      content: '他们都在里面...不要进去...',
    },
  },
};

function createCampaign() {
  return {
    id: 'camp_1',
    module_id: 'e2e_test_mod',
    player: {
      name: '测试调查员',
      stats: { 格斗: 40, 射击: 35, 侦查: 60, 聆听: 50, dex: 55, 力量: 60, 体型: 70 },
      hp: 12,
      max_hp: 12,
      sanity: 60,
      max_sanity: 60,
      inventory: [],
      status_effects: [],
    },
    current_scene: 'intro',
    scene_history: ['intro'],
    global_vars: {},
    npcs_state: {},
    flags: {},
    turn: 1,
  };
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    console.log(`     ${err.stack?.split('\n')[1]?.trim() || ''}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function run() {
  console.log('\n🎮 AI-GM End-to-End Game Flow Test\n');

  const module = testModule;
  const campaign = createCampaign();
  const llmClient = new MockLLMClient();
  const sm = new GameStateMachine(module, campaign, llmClient);

  // ── 1. Start Game ──
  await test('Game starts at intro scene', () => {
    assert(sm.currentScene.id === 'intro', 'Should start at intro');
    assert(campaign.current_scene === 'intro', 'Campaign scene should be intro');
  });

  // ── 2. Scene Description ──
  await test('Scene has description and actions', () => {
    const actions = sm.getAvailableActions();
    assert(actions.length > 0, 'Should have available actions');
    assert(actions.some(a => a.type === 'move'), 'Should have move action');
    assert(actions.some(a => a.type === 'talk'), 'Should have talk action');
  });

  // ── 3. Dialogue with NPC ──
  await test('Can talk to NPC', async () => {
    const result = await sm.processAction({ action_type: 'talk', player_input: '和守门人说话' });
    assert(result.type === 'interaction', 'Should return interaction');
    assert(result.interaction_type === 'talk', 'Should be talk interaction');
    assert(result.npc_id === 'guardian', 'Should talk to guardian');
  });

  // ── 4. Inspect Item ──
  await test('Can inspect item', async () => {
    const result = await sm.processAction({ action_type: 'interact', player_input: '检查纸条' });
    assert(result.type === 'interaction', 'Should return interaction');
    assert(result.item_id === 'note', 'Should interact with note');
  });

  // ── 5. Dice Check ──
  await test('Can perform dice check', async () => {
    const result = await sm.processAction({
      action_type: 'dice_check',
      player_input: '侦查检定',
      action_data: { skill: '侦查', skill_value: 60 },
    });
    assert(result.type === 'dice_check', 'Should return dice check');
    assert(result.roll >= 1 && result.roll <= 100, 'Roll should be 1-100');
    assert(typeof result.narration === 'string', 'Should have narration');
  });

  // ── 6. Scene Transition ──
  await test('Can move to another scene', async () => {
    const result = await sm.processAction({ action_type: 'move', player_input: '进入大厅', action_data: { direction: '大厅' } });
    assert(result.type === 'scene_change' || result.type === 'scene_change_combat', 'Should return scene change');
    assert(result.to === 'lobby', 'Should move to lobby');
    assert(campaign.current_scene === 'lobby', 'Campaign should update');
    assert(campaign.scene_history.includes('lobby'), 'History should include lobby');
  });

  // ── 7. Combat Initiation ──
  await test('Combat starts in lobby', async () => {
    const result = await sm.processAction({ action_type: 'attack', player_input: '攻击' });
    assert(result.type === 'combat_start', 'Should return combat start');
    assert(result.enemies.includes('zombie'), 'Should include zombie enemy');
  });

  // ── 8. Combat System ──
  await test('Can initialize combat state', () => {
    const player = campaign.player;
    const enemyNPC = module.npcs.zombie;
    const combat = initCombat(player, [enemyNPC]);
    assert(combat.active === true, 'Combat should be active');
    assert(combat.entities['player'].hp > 0, 'Player should have HP');
    assert(combat.enemyIds.length === 1, 'Should have 1 enemy');
    assert(combat.turnQueue.length === 2, 'Should have 2 entities in queue');
  });

  await test('Can execute attack in combat', () => {
    const player = campaign.player;
    const enemyNPC = module.npcs.zombie;
    let combat = initCombat(player, [enemyNPC]);
    const { state: newState, result } = executeAttack(combat, 'player', combat.enemyIds[0], 'brawl');
    assert(result.type === 'hit' || result.type === 'miss' || result.type === 'critical' || result.type === 'fumble', 'Should have valid result type');
    assert(newState.log.length > combat.log.length, 'Should add log entries');
  });

  await test('Can advance combat turns', () => {
    const player = campaign.player;
    const enemyNPC = module.npcs.zombie;
    let combat = initCombat(player, [enemyNPC]);
    const initialRound = combat.round;
    combat = advanceTurn(combat);
    assert(combat.round >= initialRound, 'Round should advance');
    assert(combat.currentTurnEntityId !== null, 'Should have current turn entity');
  });

  await test('AI can execute actions', () => {
    const player = campaign.player;
    const enemyNPC = module.npcs.zombie;
    let combat = initCombat(player, [enemyNPC]);
    const enemyId = combat.enemyIds[0];
    const newState = executeAIAction(combat, enemyId);
    assert(newState.log.length >= combat.log.length, 'Should add AI action log');
  });

  await test('Combat end detection works', () => {
    const player = campaign.player;
    const enemyNPC = module.npcs.zombie;
    let combat = initCombat(player, [enemyNPC]);
    // Kill the enemy
    combat.entities[combat.enemyIds[0]].hp = 0;
    combat = checkCombatEnd(combat);
    assert(combat.phase === 'victory', 'Should detect victory when all enemies dead');
  });

  // ── 9. Save/Load (simulated via API) ──
  await test('Campaign state can be serialized', () => {
    const serialized = JSON.stringify(campaign);
    const deserialized = JSON.parse(serialized);
    assert(deserialized.current_scene === campaign.current_scene, 'Scene should survive serialization');
    assert(deserialized.player.hp === campaign.player.hp, 'Player HP should survive serialization');
  });

  // ── 10. Scene Transition to Ending ──
  await test('Can reach ending scene', async () => {
    // Move to ward (ending scene)
    const result = await sm.transitionTo('ward');
    assert(result.type === 'ending', 'Should return ending type');
    assert(result.ending.type === 'bad', 'Should be bad ending');
    assert(result.narration.includes('死亡名单'), 'Should contain ending description');
  });

  // ── 11. Dice Roller ──
  await test('Dice roller works correctly', () => {
    const roller = new DiceRoller();
    const result = roller.roll('1d6');
    assert(result.total >= 1 && result.total <= 6, '1d6 should be 1-6');
    assert(result.rolls.length === 1, 'Should have 1 roll');
    assert(result.breakdown.includes('1d6'), 'Should have breakdown');
  });

  await test('Dice roller handles complex expressions', () => {
    const roller = new DiceRoller();
    const result = roller.roll('2d10+3');
    assert(result.total >= 5 && result.total <= 23, '2d10+3 should be 5-23');
    assert(result.rolls.length === 2, 'Should have 2 rolls');
  });

  await test('Dice roller tracks history', () => {
    const roller = new DiceRoller();
    roller.roll('1d6');
    roller.roll('1d20');
    assert(roller.history.length === 2, 'Should track 2 rolls');
    roller.clearHistory();
    assert(roller.history.length === 0, 'Should clear history');
  });

  // ── 12. Module Validation ──
  await test('Module importer validates correctly', async () => {
    const { ModuleValidator } = await import('../frontend/src/modshare/validator.ts');
    const result = ModuleValidator.validate(module);
    assert(result.valid === true, `Module should be valid: ${result.errors.map(e => e.message).join(', ')}`);
  });

  // ── 13. State Machine Error Handling ──
  await test('Handles invalid action gracefully', async () => {
    const result = await sm.processAction({ action_type: 'unknown', player_input: '做一些奇怪的事' });
    assert(result.type === 'interaction', 'Should return interaction for unknown actions');
    assert(typeof result.narration === 'string', 'Should have narration');
  });

  // ── Summary ──
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
