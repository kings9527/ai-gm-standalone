import { electronAPI } from '../api/electron';
import type { IntentResult } from './intent-parser';

/**
 * ImageBridgeResult
 * 图片桥接处理结果
 */
export interface ImageBridgeResult {
  /** 获取到的图片 URL */
  imageUrl: string;
  /** 图片类型：search = 搜索获取, generate = AI 生成 */
  source: 'search' | 'generate';
  /** 用于搜索/生成的原始查询词 */
  query: string;
}

/**
 * ImageBridgeOptions
 * 图片桥接配置选项
 */
export interface ImageBridgeOptions {
  /** 是否优先使用图片搜索（默认 true） */
  preferSearch?: boolean;
  /** 搜索失败时是否回退到 AI 生成（默认 true） */
  fallbackToGenerate?: boolean;
  /** 视觉描述的最小长度阈值（默认 3） */
  minDescriptionLength?: number;
  /** 触发 explore 意图时是否启用（默认 true） */
  enabledOnExplore?: boolean;
  /** 触发 event 意图时是否启用（默认 false） */
  enabledOnEvent?: boolean;
}

/**
 * 视觉描述关键词模式
 * 用于判断输入是否包含场景/环境视觉描述
 */
const VISUAL_KEYWORDS = [
  // 场景描述词
  'forest', 'moonlight', 'dark', 'castle', 'room', 'street', 'cave', 'mountain',
  'ocean', 'desert', 'village', 'city', 'temple', 'dungeon', 'tower', 'garden',
  'forest', 'jungle', 'swamp', 'ruins', 'bridge', 'tavern', 'inn', 'market',
  'library', 'laboratory', 'prison', 'throne', 'altar', 'campfire', 'ship',
  'beach', 'cliff', 'waterfall', 'lake', 'river', 'path', 'road', 'alley',
  // 中文场景描述词
  '森林', '月光', '黑暗', '城堡', '房间', '街道', '洞穴', '山', '海洋',
  '沙漠', '村庄', '城市', '神殿', '地牢', '塔', '花园', '丛林', '沼泽',
  '废墟', '桥', '酒馆', '客栈', '市场', '图书馆', '实验室', '监狱',
  '王座', '祭坛', '篝火', '船', '海滩', '悬崖', '瀑布', '湖', '河',
  // 氛围/光照词
  'foggy', 'rainy', 'sunny', 'stormy', 'snowy', 'night', 'dusk', 'dawn',
  'gloomy', 'bright', 'dim', 'shadow', 'mist', '雾', '雨', '阳光',
  '风暴', '雪', '夜', '黄昏', '黎明', '阴暗', '明亮', '昏暗',
  // 视觉动作词
  'looks like', 'appears', 'scene', 'view', 'landscape', '看起来像',
  '看起来', '场景', '景色', '风景', '画面',
];

/**
 * 提取视觉描述的核心名词短语
 * 从玩家输入中提炼出适合图片搜索的查询词
 */
function extractVisualQuery(input: string): string | null {
  const normalized = input.trim();
  if (normalized.length < 3) return null;

  // 检查是否包含视觉关键词
  const hasVisualKeyword = VISUAL_KEYWORDS.some((kw) =>
    normalized.toLowerCase().includes(kw.toLowerCase())
  );
  if (!hasVisualKeyword) return null;

  // 去除动作前缀，保留场景描述部分
  // 例如："go to dark forest" → "dark forest"
  // 例如："前往月光下的森林" → "月光 森林"
  const actionPrefixes = [
    /^\s*(?:go|move|walk|head|enter|to|towards|into)\s+(?:to\s+)?/i,
    /^\s*(?:去|走到|前往|进入|到|向)\s*/,
    /^\s*(?:look|check|see|observe)\s+(?:at\s+)?/i,
    /^\s*(?:看|观察|检查|看看)\s*/,
    /^\s*(?:search|find|seek)\s+(?:for\s+)?/i,
    /^\s*(?:搜索|寻找|找)\s*/,
  ];

  let query = normalized;
  for (const prefix of actionPrefixes) {
    query = query.replace(prefix, '');
  }

  // 去除标点符号和多余空格
  query = query.replace(/[。，！？.!?;；]/g, ' ').trim();
  query = query.replace(/\s+/g, ' ');

  return query.length >= 3 ? query : null;
}

/**
 * ImageBridge
 * Phase 1-G: 自由输入 + 图片联动桥接
 *
 * 当玩家输入场景描述时，自动调用图片搜索/生成 API 获取背景图或立绘。
 * 与意图解析联动：当 intent='explore' 且包含视觉描述时触发。
 *
 * 使用示例：
 * ```ts
 * const bridge = new ImageBridge();
 * const result = await bridge.bridge('dark forest with moonlight', intentResult);
 * if (result) {
 *   // 切换背景图
 *   setBackground(result.imageUrl);
 * }
 * ```
 */
export class ImageBridge {
  private options: Required<ImageBridgeOptions>;

  constructor(options: ImageBridgeOptions = {}) {
    this.options = {
      preferSearch: options.preferSearch ?? true,
      fallbackToGenerate: options.fallbackToGenerate ?? true,
      minDescriptionLength: options.minDescriptionLength ?? 3,
      enabledOnExplore: options.enabledOnExplore ?? true,
      enabledOnEvent: options.enabledOnEvent ?? false,
    };
  }

  /**
   * 主入口：根据意图和玩家输入判断是否需要获取图片
   * @param input 玩家原始输入
   * @param intentResult 意图解析结果
   * @returns 图片结果或 null（不需要/未获取到图片）
   */
  async bridge(input: string, intentResult: IntentResult): Promise<ImageBridgeResult | null> {
    // 根据意图判断是否启用
    if (intentResult.intent === 'explore' && !this.options.enabledOnExplore) return null;
    if (intentResult.intent === 'event' && !this.options.enabledOnEvent) return null;
    if (intentResult.intent !== 'explore' && intentResult.intent !== 'event') return null;

    // 提取视觉描述
    const query = extractVisualQuery(input);
    if (!query || query.length < this.options.minDescriptionLength) return null;

    // 优先搜索，失败则回退生成
    if (this.options.preferSearch) {
      const searchResult = await this.searchBackground(query);
      if (searchResult) {
        return { imageUrl: searchResult, source: 'search', query };
      }
    }

    if (this.options.fallbackToGenerate) {
      const generateResult = await this.generateBackground(query);
      if (generateResult) {
        return { imageUrl: generateResult, source: 'generate', query };
      }
    }

    return null;
  }

  /**
   * 直接搜索背景图（绕过意图检查）
   * @param query 搜索查询词
   * @returns 图片 URL 或 null
   */
  async searchBackground(query: string): Promise<string | null> {
    try {
      const result = await electronAPI.imageSearch(query);
      // 返回搜索结果中的第一张图片 URL
      if (result && Array.isArray(result) && result.length > 0) {
        const first = result[0];
        return typeof first === 'string' ? first : first?.url || first?.imageUrl || null;
      }
      if (result && typeof result === 'object' && 'url' in result) {
        return (result as any).url;
      }
      return null;
    } catch (err) {
      console.warn('[ImageBridge] imageSearch failed:', err);
      return null;
    }
  }

  /**
   * 直接生成背景图（绕过意图检查）
   * @param prompt 生成提示词
   * @returns 图片 URL 或 null
   */
  async generateBackground(prompt: string): Promise<string | null> {
    try {
      // 构建生成提示词：添加风格前缀确保生成游戏背景图
      const styledPrompt = `dark fantasy game background, ${prompt}, atmospheric, detailed, cinematic lighting, no text, no UI elements`;
      const result = await electronAPI.imageGenerate({ prompt: styledPrompt });
      if (result && typeof result === 'object' && 'url' in result) {
        return (result as any).url;
      }
      if (typeof result === 'string') {
        return result;
      }
      return null;
    } catch (err) {
      console.warn('[ImageBridge] imageGenerate failed:', err);
      return null;
    }
  }

  /**
   * 更新配置选项
   */
  updateOptions(options: Partial<ImageBridgeOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 判断输入是否包含视觉描述（静态工具方法）
   */
  static hasVisualDescription(input: string): boolean {
    return extractVisualQuery(input) !== null;
  }
}

export default ImageBridge;
