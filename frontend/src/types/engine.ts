export interface VNState {
  currentSceneId: string;
  bg: string;
  bgTransition: 'fade' | 'slide' | 'none';
  sprites: VNSprite[];
  dialogue: VNDialogue | null;
  choices: VNChoice[];
  effects: VNEffect[];
  isTransitioning: boolean;
  isPaused?: boolean; // 引擎暂停状态
  isChatStreaming?: boolean; // Phase 1-D: 闲聊模式 streaming 状态
}

export interface VNSprite {
  charId: string;
  name: string;
  imageUrl: string;
  position: 'left' | 'center' | 'right';
  expression: string;
  isSpeaking: boolean;
  enterAnimation: 'fade' | 'slide_left' | 'slide_right' | 'none';
  opacity: number;
}

export interface VNDialogue {
  speaker: string | null;
  text: string;
  typewriter: boolean;
  typewriterSpeed: number;
  speakerColor: string;
  typewriterProgress?: number; // 0~1，用于读档恢复打字进度
}

export interface VNChoice {
  id: string;
  text: string;
  disabled: boolean;
  condition?: unknown;
  /** Phase 3-A: LLM 动态选项生成 — 置信度 (0-1) */
  confidence?: number;
  /** Phase 3-A: 选项动作类型 */
  action?: 'scene' | 'next' | 'dice_check' | 'combat' | 'custom' | 'free_input';
  /** Phase 3-A: 选项目标 */
  target?: string;
  /** Phase 3-A: 是否标记为自由输入选项 */
  isFreeInput?: boolean;
}

export interface VNEffect {
  type: 'shake' | 'flash' | 'grain' | 'vignette' | 'chromatic' | 'fade_in' | 'fade_out';
  intensity: number;
  duration: number;
}

export interface SceneTransition {
  from: string | null;
  to: string;
  type: 'fade' | 'slide_left' | 'slide_right' | 'wipe' | 'ripple';
  duration: number;
}
