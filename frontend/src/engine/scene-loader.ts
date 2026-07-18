import type { Module, Campaign, Scene, Event } from '../types/module';

/**
 * SceneLoader
 * Phase 2-C: 场景加载与 hidden_events 初始化
 *
 * 职责：
 * 1. 加载场景时初始化 hidden_events（从模块数据注入）
 * 2. 处理事件解锁后的场景内容更新
 * 3. 确保场景数据的不可变性
 */

export interface LoadedScene {
  scene: Scene;
  /** 是否包含未触发的 hidden_events */
  hasHiddenEvents: boolean;
  /** 未触发 hidden_events 的提示信息（可选） */
  hiddenHints?: string[];
  /** Phase 2-G: 是否包含可搜索区域 */
  hasSearchableAreas: boolean;
  /** Phase 2-G: 可搜索区域的提示信息 */
  searchHints?: string[];
}

export class SceneLoader {
  private module: Module;

  constructor(module: Module) {
    this.module = module;
  }

  /**
   * 加载指定场景，注入 hidden_events
   * 如果场景在 module.scenes 中定义了 hidden_events，这里会保留它们
   */
  loadScene(sceneId: string, campaign: Campaign): LoadedScene {
    const scene = this.module.scenes[sceneId];
    if (!scene) {
      throw new Error(`Scene not found: ${sceneId}`);
    }

    // 检查已触发的 hidden_events，过滤掉已触发的
    const hiddenEvents = this.getAvailableHiddenEvents(scene, campaign);

    // Phase 2-G: 过滤掉已发现的 once_only 可搜索区域
    const searchableAreas = this.getAvailableSearchableAreas(scene, campaign);

    const loadedScene: Scene = {
      ...scene,
      hidden_events: hiddenEvents,
      searchable_areas: searchableAreas,
    };

    return {
      scene: loadedScene,
      hasHiddenEvents: hiddenEvents.length > 0,
      hiddenHints: hiddenEvents.map((e) => e.description.substring(0, 50) + '...').filter(Boolean),
      hasSearchableAreas: searchableAreas.length > 0,
      searchHints: searchableAreas.map((a) => a.name).filter(Boolean),
    };
  }

  /**
   * 获取场景中未触发的 hidden_events
   */
  private getAvailableHiddenEvents(scene: Scene, campaign: Campaign): Event[] {
    if (!scene.hidden_events || scene.hidden_events.length === 0) {
      return [];
    }

    return scene.hidden_events.filter((event) => {
      const eventKey = `hidden_event_triggered:${scene.id}:${event.id}`;
      // 如果不可重复且已触发，则过滤掉
      if (!event.repeatable && campaign.global_vars[eventKey]) {
        return false;
      }
      // 检查前置条件
      if (event.trigger?.condition && !this.evaluateCondition(event.trigger.condition, campaign)) {
        return false;
      }
      return true;
    });
  }

  /**
   * 获取场景中未发现的 searchable_areas（过滤掉已发现的 once_only 区域）
   * Phase 2-G
   */
  private getAvailableSearchableAreas(scene: Scene, campaign: Campaign) {
    if (!scene.searchable_areas || scene.searchable_areas.length === 0) {
      return [];
    }

    return scene.searchable_areas.filter((area) => {
      // 如果只能发现一次且已发现，则过滤掉
      if (area.once_only) {
        const discoveredKey = `discovered_area:${scene.id}:${area.id}`;
        if (campaign.global_vars[discoveredKey]) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * 应用事件解锁后的场景更新
   * 返回更新后的场景和需要通知的变化
   */
  applySceneUnlocks(
    scene: Scene,
    campaign: Campaign,
    unlocks: {
      exits?: any[];
      npcs?: string[];
      items?: string[];
      interactables?: string[];
    }
  ): { scene: Scene; changes: string[] } {
    const changes: string[] = [];
    let updatedScene = { ...scene };

    // 解锁 exits
    if (unlocks.exits && unlocks.exits.length > 0) {
      const currentExits = updatedScene.exits || [];
      const newExits = unlocks.exits.filter(
        (e) => !currentExits.some((existing) => existing.target === e.target)
      );
      if (newExits.length > 0) {
        updatedScene = {
          ...updatedScene,
          exits: [...currentExits, ...newExits],
        };
        changes.push(`解锁了 ${newExits.length} 个新出口：${newExits.map((e) => e.label).join('、')}`);
      }
    }

    // 解锁 npcs
    if (unlocks.npcs && unlocks.npcs.length > 0) {
      const currentNPCs = updatedScene.npcs || [];
      const newNPCs = unlocks.npcs.filter((id) => !currentNPCs.includes(id));
      if (newNPCs.length > 0) {
        updatedScene = {
          ...updatedScene,
          npcs: [...currentNPCs, ...newNPCs],
        };
        changes.push(`出现了 ${newNPCs.length} 个新人物：${newNPCs.join('、')}`);
      }
    }

    // 解锁 interactables
    if (unlocks.interactables && unlocks.interactables.length > 0) {
      const currentInteractables = updatedScene.interactables || [];
      const newInteractables = unlocks.interactables.filter((id) => !currentInteractables.includes(id));
      if (newInteractables.length > 0) {
        updatedScene = {
          ...updatedScene,
          interactables: [...currentInteractables, ...newInteractables],
        };
        changes.push(`发现了 ${newInteractables.length} 个可互动物品：${newInteractables.join('、')}`);
      }
    }

    // 解锁 items（直接加入玩家物品栏）
    if (unlocks.items && unlocks.items.length > 0) {
      const currentInventory = campaign.player.inventory || [];
      const newItems = unlocks.items.filter((id) => !currentInventory.includes(id));
      if (newItems.length > 0) {
        campaign.player = {
          ...campaign.player,
          inventory: [...currentInventory, ...newItems],
        };
        changes.push(`获得了 ${newItems.length} 个新物品：${newItems.join('、')}`);
      }
    }

    return { scene: updatedScene, changes };
  }

  /**
   * 更新 module 中的场景数据（用于持久化）
   */
  updateSceneInModule(sceneId: string, updatedScene: Scene): Module {
    return {
      ...this.module,
      scenes: {
        ...this.module.scenes,
        [sceneId]: updatedScene,
      },
    };
  }

  /**
   * 从 module 数据中提取所有场景的事件定义
   * 用于构建初始事件索引
   */
  buildEventIndex(): Record<string, Event[]> {
    const index: Record<string, Event[]> = {};
    for (const [sceneId, scene] of Object.entries(this.module.scenes)) {
      const events: Event[] = [];
      if (scene.hidden_events) {
        events.push(...scene.hidden_events);
      }
      // 如果场景有 events 引用，也可以从 module.events 中查找
      if (scene.events) {
        for (const eventId of scene.events) {
          const moduleEvent = this.module.events?.[eventId];
          if (moduleEvent) {
            events.push(moduleEvent);
          }
        }
      }
      if (events.length > 0) {
        index[sceneId] = events;
      }
    }
    return index;
  }

  /**
   * 条件评估（辅助方法）
   */
  private evaluateCondition(condition: any, campaign: Campaign): boolean {
    for (const [key, value] of Object.entries(condition)) {
      const campaignValue = campaign.global_vars[key];
      if (Array.isArray(value)) {
        const cv = campaignValue as number;
        if (cv < (value as number[])[0] || cv > (value as number[])[1]) return false;
      } else if (typeof value === 'boolean') {
        if (!!campaignValue !== value) return false;
      } else if (typeof value === 'number') {
        if ((campaignValue as number) !== value) return false;
      } else if (typeof value === 'string') {
        if ((campaignValue as string) !== value) return false;
      }
    }
    return true;
  }
}

export default SceneLoader;
