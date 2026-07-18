import type { Scene, SearchableArea, Campaign } from '../types/module';
import type { LLMClient } from '../llm/client';
import { ImageBridge } from './image-bridge';

/**
 * ExploreResult
 * Phase 2-G: 场景探索结果
 */
export interface ExploreResult {
  /** 是否发现新内容 */
  found: boolean;
  /** 发现的区域ID（如有） */
  areaId?: string;
  /** 发现的区域名称 */
  areaName?: string;
  /** LLM生成的发现描述 */
  description: string;
  /** 获得的物品ID列表 */
  items?: string[];
  /** 获得的线索列表 */
  clues?: string[];
  /** 新解锁的可互动物品ID */
  unlockedInteractables?: string[];
  /** 新背景图URL（ImageBridge联动） */
  newBgUrl?: string;
  /** 是否已经发现过（once_only区域） */
  alreadyDiscovered?: boolean;
}

/**
 * ExploreSystem
 * Phase 2-G: 场景探索自然语言增强
 *
 * 职责：
 * 1. 匹配玩家输入与场景中的 searchable_areas
 * 2. 根据发现概率判定是否发现
 * 3. 使用LLM生成沉浸式发现描述
 * 4. 与ImageBridge联动：发现新区域时自动搜索匹配背景图
 * 5. 管理已发现状态（通过campaign.global_vars）
 */
export class ExploreSystem {
  private imageBridge: ImageBridge;

  constructor() {
    this.imageBridge = new ImageBridge();
  }

  /**
   * 主入口：处理玩家探索输入
   * @param input 玩家原始输入
   * @param scene 当前场景
   * @param campaign 当前战役状态
   * @param llmClient LLM客户端（用于生成描述）
   * @returns ExploreResult
   */
  async search(
    input: string,
    scene: Scene,
    campaign: Campaign,
    llmClient: LLMClient | null,
  ): Promise<ExploreResult> {
    const areas = scene.searchable_areas || [];
    if (areas.length === 0) {
      return {
        found: false,
        description: '你仔细搜索了一番，但没有发现什么特别的东西。',
      };
    }

    // 1. 匹配输入与可搜索区域
    const matchedArea = this.matchArea(input, areas);
    if (!matchedArea) {
      return {
        found: false,
        description: '你尝试搜索，但不确定该从哪里入手。也许换个说法试试？',
      };
    }

    // 2. 检查是否已发现过（once_only）
    const discoveredKey = `discovered_area:${scene.id}:${matchedArea.id}`;
    if (matchedArea.once_only && campaign.global_vars[discoveredKey]) {
      return {
        found: false,
        areaId: matchedArea.id,
        areaName: matchedArea.name,
        description: `你已经仔细检查过${matchedArea.name}了，没有新的发现。`,
        alreadyDiscovered: true,
      };
    }

    // 3. 概率判定
    const roll = Math.random();
    if (roll > matchedArea.discovery_chance) {
      return {
        found: false,
        areaId: matchedArea.id,
        areaName: matchedArea.name,
        description: `你在${matchedArea.name}附近搜索了一番，但暂时没有什么发现。`,
      };
    }

    // 4. 标记为已发现
    if (matchedArea.once_only) {
      campaign.global_vars[discoveredKey] = true;
    }

    // 5. 应用发现奖励到campaign
    this.applyDiscovery(matchedArea, campaign);

    // 6. 使用LLM生成发现描述
    const description = await this.generateDiscoveryDescription(
      matchedArea,
      scene,
      llmClient,
    );

    // 7. ImageBridge联动：搜索新区域背景图
    let newBgUrl: string | undefined;
    if (matchedArea.bg_query) {
      try {
        const bgResult = await this.imageBridge.searchBackground(matchedArea.bg_query);
        if (bgResult) newBgUrl = bgResult;
      } catch {
        // 图片搜索失败静默处理
      }
    }

    return {
      found: true,
      areaId: matchedArea.id,
      areaName: matchedArea.name,
      description,
      items: matchedArea.items,
      clues: matchedArea.clues,
      unlockedInteractables: matchedArea.unlocks_interactables,
      newBgUrl,
    };
  }

  /**
   * 匹配玩家输入与可搜索区域
   * 优先级：精确匹配 > 关键词包含 > 模糊匹配
   */
  private matchArea(input: string, areas: SearchableArea[]): SearchableArea | null {
    const normalized = input.toLowerCase().trim();

    // 第一层：区域名称精确/包含匹配
    for (const area of areas) {
      const nameLower = area.name.toLowerCase();
      if (normalized.includes(nameLower) || nameLower.includes(normalized)) {
        return area;
      }
    }

    // 第二层：关键词匹配
    for (const area of areas) {
      for (const keyword of area.keywords) {
        const kwLower = keyword.toLowerCase();
        if (normalized.includes(kwLower)) {
          return area;
        }
      }
    }

    // 第三层：中文分词模糊匹配（2字以上子串）
    for (const area of areas) {
      const nameLower = area.name.toLowerCase();
      for (let i = 0; i < normalized.length - 1; i++) {
        const substr = normalized.substring(i, i + 2);
        if (substr.length >= 2 && nameLower.includes(substr)) {
          return area;
        }
      }
    }

    return null;
  }

  /**
   * 应用发现奖励到campaign状态
   */
  private applyDiscovery(area: SearchableArea, campaign: Campaign): void {
    // 添加物品到背包
    if (area.items && area.items.length > 0) {
      const currentInventory = campaign.player.inventory || [];
      const newItems = area.items.filter((id) => !currentInventory.includes(id));
      if (newItems.length > 0) {
        campaign.player = {
          ...campaign.player,
          inventory: [...currentInventory, ...newItems],
        };
      }
    }

    // 添加线索到全局变量
    if (area.clues && area.clues.length > 0) {
      for (const clue of area.clues) {
        const clueKey = `clue:${area.id}:${clue}`;
        campaign.global_vars[clueKey] = true;
      }
    }
  }

  /**
   * 使用LLM生成发现描述
   * 如果LLM不可用，回退到模板描述
   */
  private async generateDiscoveryDescription(
    area: SearchableArea,
    scene: Scene,
    llmClient: LLMClient | null,
  ): Promise<string> {
    if (!llmClient?.isAvailable()) {
      return this.fallbackDescription(area, scene);
    }

    try {
      const systemPrompt = `你是TRPG游戏的叙事型AI主持人。根据场景和发现区域的信息，生成一段沉浸式的发现描述。
要求：
1. 风格：克苏鲁/悬疑/恐怖氛围，保持神秘感
2. 长度：2-4句话，简洁有力
3. 第二人称视角（"你..."）
4. 包含感官细节（视觉、触觉、嗅觉等）
5. 不要提及游戏规则或数值
6. 只输出描述文本，不要JSON格式`;

      const itemNames = area.items?.join('、') || '无';
      const userPrompt = `当前场景：${scene.title}
场景描述：${scene.description}
发现区域：${area.name}
区域描述：${area.description}
可能获得的物品：${itemNames}

请生成一段玩家发现该区域时的沉浸式描述。`;

      const response = await llmClient.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 256, temperature: 0.8 },
      );

      const desc = response.content?.trim();
      if (desc && desc.length > 10) {
        return desc;
      }
    } catch {
      // LLM失败时回退到模板
    }

    return this.fallbackDescription(area, scene);
  }

  /**
   * 模板描述回退
   */
  private fallbackDescription(area: SearchableArea, scene: Scene): string {
    const templates = [
      `你在${scene.title}的${area.name}附近仔细搜索，${area.description}。这个发现让你感到既兴奋又不安。`,
      `当你把注意力集中在${area.name}上时，${area.description}。空气中似乎有什么东西在悄悄改变。`,
      `经过一番仔细搜查，你在${area.name}发现了异常：${area.description}。这无疑是重要线索。`,
      `${area.name}原本看起来平平无奇，但当你靠近检查时，${area.description}。你的直觉告诉你，这背后隐藏着更多秘密。`,
    ];
    const idx = Math.floor(Math.random() * templates.length);
    return templates[idx];
  }

  /**
   * 获取场景中所有已发现的区域ID列表
   */
  getDiscoveredAreas(sceneId: string, campaign: Campaign): string[] {
    const discovered: string[] = [];
    const prefix = `discovered_area:${sceneId}:`;
    for (const [key, value] of Object.entries(campaign.global_vars)) {
      if (key.startsWith(prefix) && value === true) {
        discovered.push(key.replace(prefix, ''));
      }
    }
    return discovered;
  }

  /**
   * 检查区域是否已被发现
   */
  isAreaDiscovered(sceneId: string, areaId: string, campaign: Campaign): boolean {
    const key = `discovered_area:${sceneId}:${areaId}`;
    return !!campaign.global_vars[key];
  }
}

export default ExploreSystem;
