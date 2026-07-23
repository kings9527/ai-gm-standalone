/**
 * Quest System — Phase 3-F
 * 任务/目标系统：主线、支线任务管理，动态更新，奖励发放
 */
import type { Campaign, NPCState } from '../types/module';

export type QuestType = 'main' | 'side';
export type QuestStatus = 'not_started' | 'active' | 'completed' | 'failed';

export interface QuestObjective {
  id: string;
  description: string;
  completed: boolean;
  /** 目标类型 */
  type: 'reach_scene' | 'talk_to_npc' | 'find_item' | 'defeat_enemy' | 'custom';
  /** 目标参数（sceneId, npcId, itemId, enemyId, 或自定义标识） */
  target?: string;
  /** 当前进度 */
  progress: number;
  /** 需要完成的总进度 */
  required: number;
}

export interface QuestReward {
  type: 'item' | 'skill' | 'npc_favor' | 'stat_boost' | 'custom';
  /** 目标标识（itemId, skillName, npcId, statName 等） */
  target: string;
  /** 数值或描述 */
  value?: number | string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: QuestType;
  status: QuestStatus;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  /** 前置任务ID列表 */
  prerequisites?: string[];
  /** 关联场景ID列表 */
  relatedSceneIds?: string[];
  /** 关联NPC ID列表 */
  relatedNpcIds?: string[];
  /** 接受时间戳 */
  acceptedAt?: number;
  /** 完成时间戳 */
  completedAt?: number;
}

export interface QuestLog {
  /** 所有任务映射（id → Quest） */
  quests: Record<string, Quest>;
  /** 按顺序记录的任务历史（quest id 列表） */
  history: string[];
}

/** 任务完成事件回调 */
export interface QuestCallbacks {
  onQuestAccepted?: (quest: Quest) => void;
  onQuestUpdated?: (quest: Quest, objectiveId: string) => void;
  onQuestCompleted?: (quest: Quest, rewards: QuestReward[]) => void;
  onQuestFailed?: (quest: Quest) => void;
  onObjectiveCompleted?: (quest: Quest, objective: QuestObjective) => void;
}

/**
 * 任务系统核心类
 * 管理任务的创建、激活、进度追踪、完成和奖励发放
 */
export class QuestSystem {
  private questLog: QuestLog;
  private campaign: Campaign;
  private callbacks: QuestCallbacks;

  constructor(campaign: Campaign, callbacks: QuestCallbacks = {}) {
    this.campaign = campaign;
    this.questLog = campaign.questLog || { quests: {}, history: [] };
    this.callbacks = callbacks;
  }

  /** 获取当前任务日志快照 */
  getQuestLog(): QuestLog {
    return { ...this.questLog, quests: { ...this.questLog.quests } };
  }

  /** 获取进行中的任务 */
  getActiveQuests(): Quest[] {
    return Object.values(this.questLog.quests).filter((q) => q.status === 'active');
  }

  /** 获取主线任务 */
  getMainQuests(): Quest[] {
    return Object.values(this.questLog.quests).filter((q) => q.type === 'main');
  }

  /** 获取支线任务 */
  getSideQuests(): Quest[] {
    return Object.values(this.questLog.quests).filter((q) => q.type === 'side');
  }

  /** 按ID获取任务 */
  getQuest(questId: string): Quest | null {
    return this.questLog.quests[questId] || null;
  }

  /**
   * 接受任务
   * 检查前置条件，将任务状态设为 active
   */
  acceptQuest(quest: Quest): { success: boolean; reason?: string } {
    // 检查是否已存在
    if (this.questLog.quests[quest.id]) {
      return { success: false, reason: '任务已存在' };
    }

    // 检查前置任务是否已完成
    if (quest.prerequisites && quest.prerequisites.length > 0) {
      for (const preId of quest.prerequisites) {
        const preQuest = this.questLog.quests[preId];
        if (!preQuest || preQuest.status !== 'completed') {
          return { success: false, reason: `前置任务未完成: ${preId}` };
        }
      }
    }

    const acceptedQuest: Quest = {
      ...quest,
      status: 'active',
      acceptedAt: Date.now(),
      objectives: quest.objectives.map((o) => ({ ...o, completed: false, progress: 0 })),
    };

    this.questLog.quests[quest.id] = acceptedQuest;
    this.questLog.history.push(quest.id);

    this.callbacks.onQuestAccepted?.(acceptedQuest);
    this.syncToCampaign();
    return { success: true };
  }

  /**
   * 更新任务目标进度
   * 支持增量更新或直接完成
   */
  updateObjective(
    questId: string,
    objectiveId: string,
    delta: number = 1,
    forceComplete: boolean = false,
  ): { success: boolean; quest?: Quest; objectiveCompleted?: boolean } {
    const quest = this.questLog.quests[questId];
    if (!quest || quest.status !== 'active') {
      return { success: false };
    }

    const objective = quest.objectives.find((o) => o.id === objectiveId);
    if (!objective || objective.completed) {
      return { success: false };
    }

    if (forceComplete) {
      objective.progress = objective.required;
    } else {
      objective.progress = Math.min(objective.progress + delta, objective.required);
    }

    const wasCompleted = objective.completed;
    objective.completed = objective.progress >= objective.required;

    // 目标首次完成时触发回调
    if (objective.completed && !wasCompleted) {
      this.callbacks.onObjectiveCompleted?.(quest, objective);
      this.callbacks.onQuestUpdated?.(quest, objectiveId);
    }

    // 检查是否所有目标都已完成
    const allCompleted = quest.objectives.every((o) => o.completed);
    if (allCompleted) {
      this.completeQuest(questId);
    } else {
      this.syncToCampaign();
    }

    return { success: true, quest: { ...quest }, objectiveCompleted: objective.completed && !wasCompleted };
  }

  /**
   * 直接标记目标任务完成（按目标类型和target匹配）
   * 用于自动触发：到达场景、对话NPC、获得物品等
   */
  autoCheckObjective(type: QuestObjective['type'], target: string): Quest[] {
    const updatedQuests: Quest[] = [];

    for (const quest of Object.values(this.questLog.quests)) {
      if (quest.status !== 'active') continue;

      for (const objective of quest.objectives) {
        if (objective.completed) continue;
        if (objective.type === type && objective.target === target) {
          const result = this.updateObjective(quest.id, objective.id, 1, true);
          if (result.success && result.quest) {
            updatedQuests.push(result.quest);
          }
        }
      }
    }

    return updatedQuests;
  }

  /**
   * 完成任务并发放奖励
   */
  completeQuest(questId: string): { success: boolean; rewards?: QuestReward[]; quest?: Quest } {
    const quest = this.questLog.quests[questId];
    if (!quest || quest.status !== 'active') {
      return { success: false };
    }

    quest.status = 'completed';
    quest.completedAt = Date.now();

    // 发放奖励
    const appliedRewards = this.applyRewards(quest.rewards);

    this.callbacks.onQuestCompleted?.(quest, appliedRewards);
    this.syncToCampaign();

    return { success: true, rewards: appliedRewards, quest: { ...quest } };
  }

  /**
   * 标记任务失败
   */
  failQuest(questId: string): boolean {
    const quest = this.questLog.quests[questId];
    if (!quest || quest.status !== 'active') return false;

    quest.status = 'failed';
    this.callbacks.onQuestFailed?.(quest);
    this.syncToCampaign();
    return true;
  }

  /**
   * 应用奖励到 campaign
   */
  private applyRewards(rewards: QuestReward[]): QuestReward[] {
    for (const reward of rewards) {
      switch (reward.type) {
        case 'item':
          if (!this.campaign.player.inventory) {
            this.campaign.player.inventory = [];
          }
          if (!this.campaign.player.inventory.includes(reward.target)) {
            this.campaign.player.inventory.push(reward.target);
          }
          break;
        case 'stat_boost':
          if (typeof reward.value === 'number') {
            if (!this.campaign.player.stats) {
              this.campaign.player.stats = {};
            }
            const stat = this.campaign.player.stats[reward.target] || 0;
            this.campaign.player.stats[reward.target] = stat + reward.value;
          }
          break;
        case 'npc_favor':
          if (typeof reward.value === 'number') {
            const npcState = this.campaign.npcs_state[reward.target] || {
              id: reward.target,
              current_hp: 0,
              current_san: 0,
              attitude: 'neutral',
              trust: 0,
              fear: 0,
              suspicion: 0,
              known_topics: [],
              secrets_revealed: [],
              current_action: null,
              turns_in_scene: 0,
              is_alive: true,
              custom_vars: {},
            };
            npcState.trust = Math.min(100, (npcState.trust || 0) + reward.value);
            this.campaign.npcs_state[reward.target] = npcState;
          }
          break;
        case 'skill':
          // 技能奖励：记录在全局变量中
          this.campaign.global_vars[`skill_${reward.target}`] = true;
          break;
        case 'custom':
          // 自定义奖励：直接设置全局变量
          if (reward.value !== undefined) {
            this.campaign.global_vars[reward.target] = reward.value;
          }
          break;
      }
    }
    return rewards;
  }

  /**
   * 同步 questLog 回 campaign（确保存档时一并保存）
   */
  private syncToCampaign() {
    this.campaign.questLog = this.getQuestLog();
  }

  /**
   * LLM 动态更新任务
   * 根据剧情发展，LLM 可以：
   * 1. 添加新任务
   * 2. 更新现有任务描述（剧情发展后目标变化）
   * 3. 添加新的子目标
   */
  dynamicUpdate(updates: Partial<Quest> & { questId: string }): Quest | null {
    const quest = this.questLog.quests[updates.questId];
    if (!quest) return null;

    // 允许更新的字段（安全白名单）
    if (updates.description) quest.description = updates.description;
    if (updates.objectives) {
      // 合并新目标，保留已有进度
      for (const newObj of updates.objectives) {
        const existing = quest.objectives.find((o) => o.id === newObj.id);
        if (!existing) {
          quest.objectives.push({ ...newObj, completed: false, progress: 0 });
        }
      }
    }
    if (updates.relatedSceneIds) {
      quest.relatedSceneIds = [...(quest.relatedSceneIds || []), ...updates.relatedSceneIds];
    }
    if (updates.relatedNpcIds) {
      quest.relatedNpcIds = [...(quest.relatedNpcIds || []), ...updates.relatedNpcIds];
    }

    this.syncToCampaign();
    return { ...quest };
  }

  /**
   * 从 LLM 的 story progression 结果中提取任务更新
   * 如果 LLM 返回了 questUpdates，自动应用
   */
  applyLLMQuestUpdates(updates: LLMQuestUpdate[]): void {
    for (const update of updates) {
      if (update.action === 'add') {
        if (update.quest) this.acceptQuest(update.quest);
      } else if (update.action === 'update_objective') {
        if (update.objectiveId) {
          this.updateObjective(update.questId, update.objectiveId, update.delta || 1, update.forceComplete);
        }
      } else if (update.action === 'complete') {
        this.completeQuest(update.questId);
      } else if (update.action === 'fail') {
        this.failQuest(update.questId);
      } else if (update.action === 'dynamic_update') {
        this.dynamicUpdate(update as Partial<Quest> & { questId: string });
      }
    }
  }
}

/** LLM 返回的任务更新指令结构 */
export interface LLMQuestUpdate {
  action: 'add' | 'update_objective' | 'complete' | 'fail' | 'dynamic_update';
  questId: string;
  quest?: Quest;
  objectiveId?: string;
  delta?: number;
  forceComplete?: boolean;
}

/** 预设任务模板（可用于模组初始化） */
export const QuestTemplates = {
  /** 创建主线调查任务 */
  createMainQuest(
    id: string,
    title: string,
    description: string,
    objectives: Omit<QuestObjective, 'completed' | 'progress'>[],
    rewards: QuestReward[],
    relatedSceneIds?: string[],
    relatedNpcIds?: string[],
  ): Quest {
    return {
      id,
      title,
      description,
      type: 'main',
      status: 'not_started',
      objectives: objectives.map((o) => ({ ...o, completed: false, progress: 0 })),
      rewards,
      relatedSceneIds,
      relatedNpcIds,
    };
  },

  /** 创建支线任务 */
  createSideQuest(
    id: string,
    title: string,
    description: string,
    objectives: Omit<QuestObjective, 'completed' | 'progress'>[],
    rewards: QuestReward[],
    prerequisites?: string[],
    relatedSceneIds?: string[],
    relatedNpcIds?: string[],
  ): Quest {
    return {
      id,
      title,
      description,
      type: 'side',
      status: 'not_started',
      objectives: objectives.map((o) => ({ ...o, completed: false, progress: 0 })),
      rewards,
      prerequisites,
      relatedSceneIds,
      relatedNpcIds,
    };
  },
};
