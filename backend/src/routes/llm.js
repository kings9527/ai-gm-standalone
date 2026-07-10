import { Router } from 'express';
import { unflatten } from '../utils/settings-serializer.js';

const router = Router();

// POST /api/llm/chat
router.post('/chat', async (req, res, next) => {
  try {
    const { provider, model, messages, temperature, maxTokens, stream } = req.body;
    const settings = unflatten(req.db.getAllSettings());

    let apiKey;
    let baseUrl;

    switch (provider) {
      case 'openai':
        apiKey = settings.llm?.apiKey;
        baseUrl = settings.llm?.baseUrl || 'https://api.openai.com/v1';
        break;
      case 'claude':
        apiKey = settings.llm?.apiKey;
        baseUrl = settings.llm?.baseUrl || 'https://api.anthropic.com/v1';
        break;
      case 'ollama':
        baseUrl = settings.llm?.baseUrl || 'http://localhost:11434/v1';
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    if (provider !== 'ollama' && !apiKey) {
      throw new Error(`API key not configured for ${provider}`);
    }

    if (stream) {
      res.status(400).json({ error: 'Use /stream for streaming' });
      return;
    }

    let response;
    if (provider === 'openai') {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens || 2048,
        }),
      });
    } else if (provider === 'claude') {
      const claudeMessages = messages.filter((m) => m.role !== 'system');
      const systemContent = messages.find((m) => m.role === 'system')?.content || '';
      response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-sonnet-20240229',
          messages: claudeMessages,
          system: systemContent,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens || 2048,
        }),
      });
    } else if (provider === 'ollama') {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          messages,
          stream: false,
          options: { temperature: temperature ?? 0.7, num_predict: maxTokens || 2048 },
        }),
      });
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errText}`);
    }

    const data = await response.json();

    let content = '';
    if (provider === 'openai') content = data.choices?.[0]?.message?.content || '';
    else if (provider === 'claude') content = data.content?.[0]?.text || '';
    else if (provider === 'ollama') content = data.message?.content || '';

    res.json({ content, provider, model, raw: data });
  } catch (err) {
    next(err);
  }
});

// POST /api/llm/stream
router.post('/stream', async (req, res, next) => {
  try {
    const { provider, model, messages, temperature, maxTokens } = req.body;
    const settings = unflatten(req.db.getAllSettings());

    let apiKey;
    let baseUrl;
    let body;
    let headers = { 'Content-Type': 'application/json' };

    switch (provider) {
      case 'openai':
        apiKey = settings.llm?.apiKey;
        baseUrl = settings.llm?.baseUrl || 'https://api.openai.com/v1';
        headers.Authorization = `Bearer ${apiKey}`;
        body = JSON.stringify({ model: model || 'gpt-4o-mini', messages, temperature: temperature ?? 0.7, max_tokens: maxTokens || 2048, stream: true });
        break;
      case 'ollama':
        baseUrl = settings.llm?.baseUrl || 'http://localhost:11434/v1';
        body = JSON.stringify({ model: model || 'llama3', messages, stream: true, options: { temperature: temperature ?? 0.7 } });
        break;
      default:
        throw new Error(`Streaming not supported for ${provider}`);
    }

    if (provider !== 'ollama' && !apiKey) throw new Error(`API key not configured for ${provider}`);

    const response = await fetch(`${baseUrl}${provider === 'ollama' ? '/api/chat' : '/chat/completions'}`, {
      method: 'POST',
      headers,
      body,
    });

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
