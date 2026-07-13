/**
 * Dice Roller (ported from old project)
 * Parses and executes dice expressions like "1d6", "2d10+3", "d20"
 */

export class DiceRoller {
  history: Array<{ expression: string; rolls: number[]; total: number; breakdown: string; timestamp: string }>;
  private _regexCache: Map<string, RegExp>;
  private _parseCache: Map<string, { structure: Array<{ sign: number; count: number; sides: number | null }> }>;
  private _maxCacheSize = 50;

  constructor() {
    this.history = [];
    this._regexCache = new Map();
    this._parseCache = new Map();
  }

  roll(expression: string) {
    if (!expression || typeof expression !== 'string') {
      throw new Error(`Invalid dice expression: ${expression}`);
    }
    const result = this.parseAndRoll(expression.trim());
    this.history.push({ ...result, timestamp: new Date().toISOString() });
    return result;
  }

  parseAndRoll(expression: string) {
    const expr = expression.toLowerCase().replace(/\s/g, '');

    const cached = this._parseCache.get(expr);
    if (cached) {
      const result = this._executeRoll(cached.structure);
      return { expression, ...result };
    }

    const structure = this._parseExpression(expr);

    if (this._parseCache.size >= this._maxCacheSize) {
      const firstKey = this._parseCache.keys().next().value;
      if (firstKey) this._parseCache.delete(firstKey);
    }
    this._parseCache.set(expr, { structure });

    const result = this._executeRoll(structure);
    return { expression, ...result };
  }

  private _parseExpression(expr: string) {
    // BUG-15 fix: support complex expressions like "1d6*2", "(1d6+3)*2"
    // First pass: replace all dice notations with computed values
    let processed = expr;
    const dicePattern = /([+-]?)\b(\d*)d(\d+)\b/gi;
    let match: RegExpExecArray | null;
    const replacements: Array<{ start: number; end: number; value: number }> = [];

    while ((match = dicePattern.exec(expr)) !== null) {
      const sign = match[1] === '-' ? -1 : 1;
      const count = match[2] ? parseInt(match[2], 10) : 1;
      const sides = parseInt(match[3], 10);
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
      }
      const value = sign * rolls.reduce((a, b) => a + b, 0);
      replacements.push({ start: match.index, end: match.index + match[0].length, value });
    }

    // Apply replacements from end to start to avoid index shifting
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      processed = processed.slice(0, r.start) + String(r.value) + processed.slice(r.end);
    }

    // Second pass: evaluate the arithmetic expression safely
    const result = this._safeEval(processed);
    return [{ sign: 1, count: result.total, sides: null }];
  }

  /** Safe arithmetic evaluation — only allows +, -, *, /, parentheses, and numbers */
  private _safeEval(expr: string): { total: number; rolls: number[]; breakdown: string } {
    const sanitized = expr.replace(/\s/g, '').replace(/[^\d+\-*/().]/g, '');
    if (!sanitized) return { total: 0, rolls: [], breakdown: '0' };

    // Use Function constructor with strict validation
    try {
      const fn = new Function('return (' + sanitized + ')');
      const result = fn();
      if (typeof result !== 'number' || !Number.isFinite(result)) {
        throw new Error('Invalid result');
      }
      return { total: Math.floor(result), rolls: [], breakdown: expr + ' = ' + result };
    } catch (e) {
      throw new Error(`Failed to evaluate dice expression: ${expr}`, { cause: e });
    }
  }

  private _executeRoll(structure: Array<{ sign: number; count: number; sides: number | null }>) {
    let total = 0;
    const rolls: number[] = [];
    const breakdown: string[] = [];

    for (const item of structure) {
      if (!item.sides) {
        total += item.sign * item.count;
        breakdown.push(`${item.sign > 0 ? '+' : '-'}${item.count}`);
        continue;
      }

      const diceRolls: number[] = [];
      for (let i = 0; i < item.count; i++) {
        const roll = Math.floor(Math.random() * item.sides) + 1;
        diceRolls.push(roll);
        total += item.sign * roll;
      }
      rolls.push(...diceRolls);
      breakdown.push(
        `${item.sign > 0 ? '' : '-'}${item.count}d${item.sides}(${diceRolls.join('+')})`
      );
    }

    return {
      rolls,
      total,
      breakdown: breakdown.join('').replace(/^\+/, ''),
    };
  }

  rollMultiple(expressions: string[]) {
    return expressions.map((expr) => this.roll(expr));
  }

  getHistory() {
    return this.history;
  }

  clearHistory() {
    this.history = [];
  }
}

export default DiceRoller;
