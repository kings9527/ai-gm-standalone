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
    const structure: Array<{ sign: number; count: number; sides: number | null }> = [];
    const pattern = /([+-]?)(\d+)(?:d(\d+))?/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(expr)) !== null) {
      const sign = match[1] === '-' ? -1 : 1;
      const count = match[2] ? parseInt(match[2]) : 1;
      const sides = match[3] ? parseInt(match[3]) : null;
      structure.push({ sign, count, sides });
    }
    return structure;
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
