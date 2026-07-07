import type { Module, StyleConfig, Scene, NPC, Item, Event } from '../types/module';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Module JSON Schema Validator
 * Validates imported module data against required fields and types.
 */
export class ModuleValidator {
  static validate(module: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!module || typeof module !== 'object') {
      errors.push({ field: 'root', message: '模块数据必须是对象', severity: 'error' });
      return { valid: false, errors, warnings };
    }

    const m = module as Record<string, unknown>;

    // Required top-level fields
    const requiredFields = ['id', 'name', 'system', 'version', 'style', 'start_scene', 'scenes'];
    for (const field of requiredFields) {
      if (!(field in m) || m[field] === undefined || m[field] === null) {
        errors.push({ field, message: `缺少必填字段: ${field}`, severity: 'error' });
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, warnings };
    }

    // Field type checks
    if (typeof m.id !== 'string' || m.id.trim() === '') {
      errors.push({ field: 'id', message: 'id 必须是字符串', severity: 'error' });
    }
    if (typeof m.name !== 'string' || m.name.trim() === '') {
      errors.push({ field: 'name', message: 'name 必须是字符串', severity: 'error' });
    }
    if (typeof m.system !== 'string' || !['coc', 'dnd5e', 'custom'].includes(m.system as string)) {
      errors.push({ field: 'system', message: "system 必须是 'coc' | 'dnd5e' | 'custom'", severity: 'error' });
    }
    if (typeof m.version !== 'string') {
      errors.push({ field: 'version', message: 'version 必须是字符串', severity: 'error' });
    }
    if (typeof m.start_scene !== 'string') {
      errors.push({ field: 'start_scene', message: 'start_scene 必须是字符串', severity: 'error' });
    }

    // Style validation
    if (typeof m.style === 'object' && m.style !== null) {
      this.validateStyle(m.style as Record<string, unknown>, errors, warnings);
    } else {
      errors.push({ field: 'style', message: 'style 必须是对象', severity: 'error' });
    }

    // Scenes validation
    if (typeof m.scenes === 'object' && m.scenes !== null && !Array.isArray(m.scenes)) {
      this.validateScenes(m.scenes as Record<string, unknown>, errors, warnings);
    } else {
      errors.push({ field: 'scenes', message: 'scenes 必须是对象（键值对）', severity: 'error' });
    }

    // NPCs validation (optional but recommended)
    if (m.npcs && typeof m.npcs === 'object' && !Array.isArray(m.npcs)) {
      this.validateNPCs(m.npcs as Record<string, unknown>, errors, warnings);
    } else if (m.npcs) {
      errors.push({ field: 'npcs', message: 'npcs 必须是对象', severity: 'error' });
    }

    // Items validation (optional)
    if (m.items && typeof m.items === 'object' && !Array.isArray(m.items)) {
      this.validateItems(m.items as Record<string, unknown>, errors, warnings);
    } else if (m.items) {
      errors.push({ field: 'items', message: 'items 必须是对象', severity: 'error' });
    }

    // Events validation (optional)
    if (m.events && typeof m.events === 'object' && !Array.isArray(m.events)) {
      this.validateEvents(m.events as Record<string, unknown>, errors, warnings);
    } else if (m.events) {
      errors.push({ field: 'events', message: 'events 必须是对象', severity: 'error' });
    }

    // Check start_scene exists in scenes
    if (typeof m.start_scene === 'string' && typeof m.scenes === 'object' && m.scenes !== null) {
      const scenes = m.scenes as Record<string, unknown>;
      if (!scenes[m.start_scene]) {
        errors.push({
          field: 'start_scene',
          message: `start_scene '${m.start_scene}' 在 scenes 中不存在`,
          severity: 'error',
        });
      }
    }

    const hasErrors = errors.length > 0;
    return { valid: !hasErrors, errors, warnings };
  }

  private static validateStyle(style: Record<string, unknown>, errors: ValidationError[], warnings: ValidationError[]) {
    if (typeof style.palette !== 'object' || style.palette === null) {
      errors.push({ field: 'style.palette', message: 'style.palette 必须是对象', severity: 'error' });
    } else {
      const palette = style.palette as Record<string, unknown>;
      const paletteFields = ['bg', 'accent', 'text', 'dialogue_bg'];
      for (const f of paletteFields) {
        if (typeof palette[f] !== 'string') {
          errors.push({ field: `style.palette.${f}`, message: `palette.${f} 必须是字符串`, severity: 'error' });
        }
      }
    }

    const stringFields = ['atmosphere', 'era', 'art_style', 'lighting', 'font_family'];
    for (const f of stringFields) {
      if (typeof style[f] !== 'string') {
        warnings.push({ field: `style.${f}`, message: `style.${f} 建议为字符串`, severity: 'warning' });
      }
    }

    if (!Array.isArray(style.mood_keywords)) {
      warnings.push({ field: 'style.mood_keywords', message: 'style.mood_keywords 建议为字符串数组', severity: 'warning' });
    }
    if (!Array.isArray(style.effects)) {
      warnings.push({ field: 'style.effects', message: 'style.effects 建议为字符串数组', severity: 'warning' });
    }

    if (typeof style.image_strategy !== 'object' || style.image_strategy === null) {
      warnings.push({ field: 'style.image_strategy', message: 'style.image_strategy 建议为对象', severity: 'warning' });
    }
  }

  private static validateScenes(scenes: Record<string, unknown>, errors: ValidationError[], warnings: ValidationError[]) {
    const sceneKeys = Object.keys(scenes);
    if (sceneKeys.length === 0) {
      errors.push({ field: 'scenes', message: '至少需要 1 个场景', severity: 'error' });
      return;
    }

    for (const [key, scene] of Object.entries(scenes)) {
      if (typeof scene !== 'object' || scene === null) {
        errors.push({ field: `scenes.${key}`, message: `场景 ${key} 必须是对象`, severity: 'error' });
        continue;
      }
      const s = scene as Record<string, unknown>;
      if (typeof s.id !== 'string') {
        errors.push({ field: `scenes.${key}.id`, message: `场景 ${key} 的 id 必须是字符串`, severity: 'error' });
      }
      if (typeof s.title !== 'string') {
        warnings.push({ field: `scenes.${key}.title`, message: `场景 ${key} 的 title 建议为字符串`, severity: 'warning' });
      }
      if (typeof s.description !== 'string') {
        warnings.push({ field: `scenes.${key}.description`, message: `场景 ${key} 的 description 建议为字符串`, severity: 'warning' });
      }
      if (typeof s.bg !== 'string') {
        warnings.push({ field: `scenes.${key}.bg`, message: `场景 ${key} 的 bg 建议为字符串`, severity: 'warning' });
      }
      if (typeof s.dialogue !== 'object' || s.dialogue === null) {
        warnings.push({ field: `scenes.${key}.dialogue`, message: `场景 ${key} 的 dialogue 建议为对象`, severity: 'warning' });
      }
      if (s.choices && !Array.isArray(s.choices)) {
        warnings.push({ field: `scenes.${key}.choices`, message: `场景 ${key} 的 choices 建议为数组`, severity: 'warning' });
      }
      if (s.sprites && !Array.isArray(s.sprites)) {
        warnings.push({ field: `scenes.${key}.sprites`, message: `场景 ${key} 的 sprites 建议为数组`, severity: 'warning' });
      }
    }
  }

  private static validateNPCs(npcs: Record<string, unknown>, errors: ValidationError[], warnings: ValidationError[]) {
    for (const [key, npc] of Object.entries(npcs)) {
      if (typeof npc !== 'object' || npc === null) {
        errors.push({ field: `npcs.${key}`, message: `NPC ${key} 必须是对象`, severity: 'error' });
        continue;
      }
      const n = npc as Record<string, unknown>;
      if (typeof n.id !== 'string') {
        errors.push({ field: `npcs.${key}.id`, message: `NPC ${key} 的 id 必须是字符串`, severity: 'error' });
      }
      if (typeof n.name !== 'string') {
        warnings.push({ field: `npcs.${key}.name`, message: `NPC ${key} 的 name 建议为字符串`, severity: 'warning' });
      }
      if (typeof n.hp !== 'number') {
        warnings.push({ field: `npcs.${key}.hp`, message: `NPC ${key} 的 hp 建议为数字`, severity: 'warning' });
      }
    }
  }

  private static validateItems(items: Record<string, unknown>, errors: ValidationError[], warnings: ValidationError[]) {
    for (const [key, item] of Object.entries(items)) {
      if (typeof item !== 'object' || item === null) {
        errors.push({ field: `items.${key}`, message: `Item ${key} 必须是对象`, severity: 'error' });
        continue;
      }
      const i = item as Record<string, unknown>;
      if (typeof i.id !== 'string') {
        errors.push({ field: `items.${key}.id`, message: `Item ${key} 的 id 必须是字符串`, severity: 'error' });
      }
      if (typeof i.name !== 'string') {
        warnings.push({ field: `items.${key}.name`, message: `Item ${key} 的 name 建议为字符串`, severity: 'warning' });
      }
    }
  }

  private static validateEvents(events: Record<string, unknown>, errors: ValidationError[], warnings: ValidationError[]) {
    for (const [key, event] of Object.entries(events)) {
      if (typeof event !== 'object' || event === null) {
        errors.push({ field: `events.${key}`, message: `Event ${key} 必须是对象`, severity: 'error' });
        continue;
      }
      const e = event as Record<string, unknown>;
      if (typeof e.id !== 'string') {
        errors.push({ field: `events.${key}.id`, message: `Event ${key} 的 id 必须是字符串`, severity: 'error' });
      }
      if (typeof e.trigger !== 'object' || e.trigger === null) {
        warnings.push({ field: `events.${key}.trigger`, message: `Event ${key} 的 trigger 建议为对象`, severity: 'warning' });
      }
    }
  }
}

export default ModuleValidator;
