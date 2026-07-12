/**
 * SoundFX — 最小化音效合成器
 * 使用 Web Audio API 生成即时音效，无需外部音频文件。
 * 所有音效根据游戏设置开关控制。
 */

import { useSettingsStore } from '../stores/settingsStore';

// 单例 AudioContext，延迟创建以兼容浏览器策略
let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return _audioCtx;
}

/** 检查音效是否启用 */
function soundEnabled(): boolean {
  return useSettingsStore.getState().game.soundEnabled;
}

/**
 * 播放一个基础合成音效
 * @param frequency 起始频率 (Hz)
 * @param type 振荡器类型
 * @param duration 持续时间 (ms)
 * @param fadeOut 是否淡出
 */
function playTone(
  frequency: number,
  type: OscillatorType = 'sine',
  duration: number = 150,
  fadeOut: boolean = true
): void {
  const ctx = getAudioContext();
  if (!ctx || !soundEnabled()) return;

  // 浏览器策略要求用户交互后才能播放音频，静默失败即可
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, ctx.currentTime);

  gain.gain.setValueAtTime(0.15, ctx.currentTime);
  if (fadeOut) {
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration / 1000);

  // 清理
  setTimeout(() => {
    osc.disconnect();
    gain.disconnect();
  }, duration + 50);
}

/** 播放滑动音（频率从 from 滑动到 to） */
function playSlide(
  from: number,
  to: number,
  duration: number = 200,
  type: OscillatorType = 'sine'
): void {
  const ctx = getAudioContext();
  if (!ctx || !soundEnabled()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(to, ctx.currentTime + duration / 1000);

  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration / 1000);

  setTimeout(() => {
    osc.disconnect();
    gain.disconnect();
  }, duration + 50);
}

/** 播放和弦（多个频率同时） */
function playChord(
  frequencies: number[],
  duration: number = 400,
  type: OscillatorType = 'triangle'
): void {
  const ctx = getAudioContext();
  if (!ctx || !soundEnabled()) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.12, ctx.currentTime);
  masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);
  masterGain.connect(ctx.destination);

  frequencies.forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.connect(masterGain);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration / 1000);
    setTimeout(() => osc.disconnect(), duration + 50);
  });

  setTimeout(() => masterGain.disconnect(), duration + 50);
}

// ─── 公开音效接口 ─────────────────────────────

/** 按钮点击 / 通用确认 */
export function sfxClick(): void {
  playTone(880, 'sine', 80, true);
}

/** 普通攻击命中 */
export function sfxAttack(): void {
  playTone(220, 'sawtooth', 120, true);
}

/** 暴击 / 重击 */
export function sfxCritical(): void {
  playTone(440, 'square', 200, true);
  setTimeout(() => playTone(660, 'square', 150, true), 50);
}

/** 技能释放 */
export function sfxSkill(): void {
  playSlide(330, 660, 250, 'sine');
}

/** 治疗 / 恢复 */
export function sfxHeal(): void {
  playSlide(440, 880, 300, 'sine');
}

/** 状态效果（buff/debuff） */
export function sfxStatus(): void {
  playTone(550, 'triangle', 180, true);
  setTimeout(() => playTone(770, 'triangle', 180, true), 100);
}

/** 逃跑尝试 */
export function sfxFlee(): void {
  playSlide(600, 300, 300, 'sine');
}

/** 逃跑成功 */
export function sfxFleeSuccess(): void {
  playSlide(400, 800, 400, 'sine');
}

/** 战斗胜利 */
export function sfxVictory(): void {
  playChord([523, 659, 784], 500, 'triangle');
  setTimeout(() => playChord([523, 659, 784, 1047], 600, 'triangle'), 300);
}

/** 战斗失败 */
export function sfxDefeat(): void {
  playChord([220, 175], 600, 'sawtooth');
  setTimeout(() => {
    playTone(165, 'sine', 400, true);
    setTimeout(() => playTone(130, 'sine', 400, true), 150);
  }, 400);
}

/** 物品使用 */
export function sfxItem(): void {
  playTone(660, 'sine', 100, true);
  setTimeout(() => playTone(880, 'sine', 150, true), 80);
}

/** 攻击落空 / 失误 */
export function sfxMiss(): void {
  playTone(150, 'sawtooth', 200, true);
  setTimeout(() => playTone(100, 'sawtooth', 200, true), 100);
}

/** 大失败（fumble） */
export function sfxFumble(): void {
  playChord([110, 85], 400, 'sawtooth');
  setTimeout(() => playChord([80, 60], 500, 'sawtooth'), 300);
}

/** 回合开始提示 */
export function sfxTurnStart(): void {
  playTone(440, 'sine', 100, true);
}

/** 打开菜单 */
export function sfxMenuOpen(): void {
  playSlide(300, 500, 150, 'sine');
}

/** 关闭菜单 */
export function sfxMenuClose(): void {
  playSlide(500, 300, 150, 'sine');
}

/** 存档成功 */
export function sfxSave(): void {
  playTone(880, 'sine', 100, true);
  setTimeout(() => playTone(1100, 'sine', 200, true), 80);
}
