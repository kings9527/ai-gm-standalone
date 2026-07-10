/**
 * Settings Serializer — 统一后端扁平 key-value 与前端嵌套对象的序列化/反序列化逻辑
 *
 * flatten:   { llm: { apiKey: 'abc' } }  →  { 'llm.apiKey': 'abc' }
 * unflatten: { 'llm.apiKey': 'abc' }    →  { llm: { apiKey: 'abc' } }
 */

export function flatten(obj, prefix = '', res = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, key, res);
    } else {
      res[key] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return res;
}

export function unflatten(obj) {
  const res = {};
  for (const [k, v] of Object.entries(obj)) {
    let target = res;
    const parts = k.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in target) || target[part] === null || typeof target[part] !== 'object') {
        target[part] = {};
      }
      target = target[part];
    }
    let val = v;
    try { val = JSON.parse(v); } catch { /* keep as string */ }
    target[parts[parts.length - 1]] = val;
  }
  return res;
}
