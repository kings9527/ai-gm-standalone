import { Router } from 'express';
import { unflatten } from '../utils/settings-serializer.js';

const router = Router();

/**
 * LLM Provider 配置表
 *
 * 兼容 OpenAI 格式的 provider 共用一套请求逻辑（/chat/completions + Bearer auth）。
 * 特殊格式（claude、gemini）单独处理。
 *
 * 用户可在「设置 → LLM」中自定义：
 * - apiKey：API 密钥
 * - baseUrl：API 基础地址（可选，默认用 provider 预设）
 * - model：模型名称（可选，默认用 provider 预设）
 */
const PROVIDER_CONFIG = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    format: 'openai',
  },
  claude: {
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-20241022',
    format: 'claude',
  },
  kimi: {
    name: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    format: 'openai',
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
  },
  qwen: {
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    format: 'openai',
  },
  glm: {
    name: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
    format: 'openai',
  },
  gemini: {
    name: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    format: 'gemini',
  },
  ollama: {
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'llama3',
    format: 'ollama',
  },
  custom: {
    name: '自定义 (OpenAI 兼容)',
    baseUrl: '', // 必填，由用户在设置中填写
    defaultModel: '',
    format: 'openai',
  },
};

// ========== OpenAI 兼容格式请求 ==========
async function openaiChat(baseUrl, apiKey, model, messages, temperature, maxTokens) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2048,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OpenAI API error: ${response.status} ${JSON.stringify(data)}`);
  return { content: data.choices?.[0]?.message?.content || '', raw: data };
}

async function openaiStream(baseUrl, apiKey, model, messages, temperature, maxTokens) {
  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2048,
      stream: true,
    }),
  });
}

// ========== Claude 格式请求 ==========
async function claudeChat(baseUrl, apiKey, model, messages, temperature, maxTokens) {
  const claudeMessages = messages.filter((m) => m.role !== 'system');
  const systemContent = messages.find((m) => m.role === 'system')?.content || '';
  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: claudeMessages,
      system: systemContent,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens || 2048,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Claude API error: ${response.status} ${JSON.stringify(data)}`);
  return { content: data.content?.[0]?.text || '', raw: data };
}

// Claude 不支持标准 SSE stream，这里暂不实现

// ========== Gemini 格式请求 ==========
async function geminiChat(baseUrl, apiKey, model, messages, temperature, maxTokens) {
  // 将 OpenAI 格式的 messages 转为 Gemini 格式
  const systemContent = messages.find((m) => m.role === 'system')?.content || '';
  const geminiContents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body = {
    contents: geminiContents,
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens || 2048,
    },
  };
  if (systemContent) {
    body.systemInstruction = { parts: [{ text: systemContent }] };
  }

  const response = await fetch(
    `${baseUrl}/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini API error: ${response.status} ${JSON.stringify(data)}`);
  return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '', raw: data };
}

// ========== Ollama 格式请求 ==========
async function ollamaChat(baseUrl, model, messages, temperature, maxTokens) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: { temperature: temperature ?? 0.7, num_predict: maxTokens || 2048 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Ollama error: ${response.status} ${JSON.stringify(data)}`);
  return { content: data.message?.content || '', raw: data };
}

async function ollamaStream(baseUrl, model, messages, temperature, maxTokens) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { temperature: temperature ?? 0.7, num_predict: maxTokens || 2048 },
    }),
  });
}

// ========== 路由 ==========

// GET /api/llm/providers — 返回支持的 provider 列表
router.get('/providers', (req, res) => {
  const list = Object.entries(PROVIDER_CONFIG).map(([key, cfg]) => ({
    id: key,
    name: cfg.name,
    defaultModel: cfg.defaultModel,
    requiresApiKey: key !== 'ollama',
    requiresBaseUrl: key === 'custom',
    supportsStream: cfg.format === 'openai' || cfg.format === 'ollama',
  }));
  res.json(list);
});

// POST /api/llm/chat
router.post('/chat', async (req, res, next) => {
  try {
    const { provider, model, messages, temperature, maxTokens, stream } = req.body;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider is required' });
    }

    const config = PROVIDER_CONFIG[provider];
    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const settings = unflatten(req.db.getAllSettings());
    const userBaseUrl = settings.llm?.baseUrl;
    const baseUrl = userBaseUrl || config.baseUrl;
    const resolvedModel = model || config.defaultModel;

    if (config.requiresBaseUrl && !baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required for custom provider' });
    }

    const apiKey = settings.llm?.apiKey;
    if (config.requiresApiKey && !apiKey) {
      return res.status(400).json({ error: `API key not configured for ${provider}` });
    }

    if (stream) {
      return res.status(400).json({ error: 'Use /stream for streaming' });
    }

    let result;
    switch (config.format) {
      case 'openai':
        result = await openaiChat(baseUrl, apiKey, resolvedModel, messages, temperature, maxTokens);
        break;
      case 'claude':
        result = await claudeChat(baseUrl, apiKey, resolvedModel, messages, temperature, maxTokens);
        break;
      case 'gemini':
        result = await geminiChat(baseUrl, apiKey, resolvedModel, messages, temperature, maxTokens);
        break;
      case 'ollama':
        result = await ollamaChat(baseUrl, resolvedModel, messages, temperature, maxTokens);
        break;
      default:
        throw new Error(`Unsupported format: ${config.format}`);
    }

    res.json({ content: result.content, provider, model: resolvedModel, raw: result.raw });
  } catch (err) {
    next(err);
  }
});

// POST /api/llm/stream
router.post('/stream', async (req, res, next) => {
  try {
    const { provider, model, messages, temperature, maxTokens } = req.body;
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider is required' });
    }

    const config = PROVIDER_CONFIG[provider];
    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const settings = unflatten(req.db.getAllSettings());
    const userBaseUrl = settings.llm?.baseUrl;
    const baseUrl = userBaseUrl || config.baseUrl;
    const resolvedModel = model || config.defaultModel;

    if (config.requiresBaseUrl && !baseUrl) {
      return res.status(400).json({ error: 'baseUrl is required for custom provider' });
    }

    const apiKey = settings.llm?.apiKey;
    if (config.requiresApiKey && !apiKey) {
      return res.status(400).json({ error: `API key not configured for ${provider}` });
    }

    let response;
    switch (config.format) {
      case 'openai':
        response = await openaiStream(baseUrl, apiKey, resolvedModel, messages, temperature, maxTokens);
        break;
      case 'ollama':
        response = await ollamaStream(baseUrl, resolvedModel, messages, temperature, maxTokens);
        break;
      default:
        return res.status(400).json({ error: `Streaming not supported for ${provider}` });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM stream error: ${response.status} ${errText}`);
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
    res.end();
  } catch (err) {
    next(err);
  }
});

export default router;
