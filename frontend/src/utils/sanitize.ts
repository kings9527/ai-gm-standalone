/**
 * Input Sanitization Utilities
 * Prevents XSS and sanitizes user input for safe display.
 * Ported from old project.
 */

export function escapeHtml(text: string): string {
  if (typeof text !== 'string') return String(text);
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function sanitizeInput(input: string, maxLength = 1000): string {
  if (!input || typeof input !== 'string') return '';
  let sanitized = input.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  sanitized = sanitized.trim();
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  return sanitized;
}

export function sanitizeNarration(text: string): string {
  if (typeof text !== 'string') return String(text);
  let sanitized = text.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/data:text\/html/gi, '');
  return sanitized;
}

export function isValidCampaignId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^campaign_\d+_[a-z0-9]+$/.test(id);
}

export function isValidDiceExpression(expression: string): boolean {
  if (!expression || typeof expression !== 'string') return false;
  return /^[\d\s+dD+-]+$/.test(expression.trim());
}

export function validateModule(module: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!module || typeof module !== 'object') {
    return { valid: false, errors: ['Module must be an object'] };
  }

  const m = module as Record<string, unknown>;

  if (!m.id) errors.push('Module missing required field: id');
  if (!m.name) errors.push('Module missing required field: name');
  if (!m.system) errors.push('Module missing required field: system');
  if (!m.start_scene) errors.push('Module missing required field: start_scene');
  if (!m.scenes || Object.keys(m.scenes as object).length === 0) {
    errors.push('Module must have at least one scene');
  }

  if (m.scenes) {
    for (const [sceneId, scene] of Object.entries(m.scenes as Record<string, unknown>)) {
      const s = scene as Record<string, unknown>;
      if (!s.id) errors.push(`Scene ${sceneId} missing id`);
      if (!s.title) errors.push(`Scene ${sceneId} missing title`);
      if (!s.description) errors.push(`Scene ${sceneId} missing description`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export default {
  escapeHtml,
  sanitizeInput,
  sanitizeNarration,
  isValidCampaignId,
  isValidDiceExpression,
  validateModule,
};
