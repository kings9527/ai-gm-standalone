import { DiceRoller } from '../engine/dice';

/**
 * LLM Client for AI-GM Standalone
 * Unified interface for OpenAI, Claude, and Ollama APIs.
 * Pure frontend — fetch() directly to API endpoints.
 */

export interface LLMConfig {
  provider: 'openai' | 'claude' | 'ollama';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  cached: boolean;
}

const DEFAULT_CONFIG: LLMConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 512,
  temperature: 0.7,
  timeout: 30000,
  retries: 2,
};

export class LLMClient {
  config: LLMConfig;
  private _cache: Map<string, LLMResponse>;
  private _cacheMaxSize = 100;
  private _requestCount = 0;
  private _errorCount = 0;

  constructor(config: Partial<LLMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this._cache = new Map();
  }

  updateConfig(newConfig: Partial<LLMConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  isAvailable(): boolean {
    if (this.config.provider === 'ollama') {
      return !!this.config.baseUrl;
    }
    return !!(this.config.apiKey && this.config.baseUrl);
  }

  async chat(messages: LLMMessage[], options: Partial<LLMConfig> = {}): Promise<LLMResponse> {
    if (!this.isAvailable()) {
      throw new Error('LLM not configured. Please set API key and base URL in Settings.');
    }

    const merged = { ...this.config, ...options };

    // Check cache
    if (!merged.stream) {
      const key = this._cacheKey(messages, merged);
      const cached = this._cache.get(key);
      if (cached) return { ...cached, cached: true };
    }

    const retries = merged.retries ?? this.config.retries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this._sendRequest(messages, merged);
        this._requestCount++;
        if (!merged.stream) {
          this._cacheResponse(messages, merged, response);
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this._errorCount++;
        if (attempt < retries) {
          await this._sleep(Math.min(1000 * Math.pow(2, attempt), 10000));
        }
      }
    }

    throw lastError || new Error('LLM request failed after all retries');
  }

  async complete(prompt: string, systemPrompt?: string, options?: Partial<LLMConfig>): Promise<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const response = await this.chat(messages, options);
    return response.content;
  }

  async chatJSON(messages: LLMMessage[], options?: Partial<LLMConfig> & { jsonSchema?: object }): Promise<unknown> {
    const instruction = options?.jsonSchema
      ? `\n\nYou must respond with a single JSON object that conforms to this schema:\n${JSON.stringify(options.jsonSchema, null, 2)}\nDo not include markdown code blocks or explanations.`
      : '\n\nYou must respond with a single JSON object. No markdown, no explanations.';

    const modified = messages.map((m, i) =>
      i === messages.length - 1 && m.role === 'user'
        ? { ...m, content: m.content + instruction }
        : m
    );

    if (modified[modified.length - 1]?.role !== 'user') {
      modified.push({ role: 'user', content: instruction });
    }

    const response = await this.chat(modified, options);
    return this._extractJSON(response.content);
  }

  private async _sendRequest(messages: LLMMessage[], options: LLMConfig): Promise<LLMResponse> {
    switch (options.provider) {
      case 'ollama':
        return this._sendOllamaRequest(messages, options);
      case 'claude':
        return this._sendClaudeRequest(messages, options);
      case 'openai':
      default:
        return this._sendOpenAIRequest(messages, options);
    }
  }

  private async _sendOpenAIRequest(messages: LLMMessage[], options: LLMConfig): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = new Error(`LLM API error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      return {
        content: content.trim(),
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        model: data.model || options.model,
        cached: false,
      };
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') throw new Error('LLM request timeout');
      throw error;
    }
  }

  private async _sendClaudeRequest(messages: LLMMessage[], options: LLMConfig): Promise<LLMResponse> {
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(`${options.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: options.model || 'claude-3-sonnet-20240229',
          max_tokens: options.maxTokens || 1024,
          temperature: options.temperature,
          system: systemMessages.map((m) => m.content).join('\n\n'),
          messages: userMessages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = new Error(`Claude API error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      return {
        content: (data.content?.[0]?.text || '').trim(),
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        model: data.model || options.model,
        cached: false,
      };
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') throw new Error('Claude request timeout');
      throw error;
    }
  }

  private async _sendOllamaRequest(messages: LLMMessage[], options: LLMConfig): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout);

    try {
      const response = await fetch(`${options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || 'llama3',
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
          options: {
            temperature: options.temperature,
            num_predict: options.maxTokens,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = new Error(`Ollama API error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      const data = await response.json();
      return {
        content: (data.message?.content || '').trim(),
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        model: data.model || options.model,
        cached: false,
      };
    } catch (error) {
      clearTimeout(timeout);
      if ((error as Error).name === 'AbortError') throw new Error('Ollama request timeout');
      throw error;
    }
  }

  private _extractJSON(rawText: string): unknown {
    const text = rawText.trim();
    try { return JSON.parse(text); } catch { /* continue */ }
    const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (match) try { return JSON.parse(match[1].trim()); } catch { /* continue */ }
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
    return { error: 'JSON parse failed', raw: text };
  }

  private _cacheKey(messages: LLMMessage[], options: LLMConfig): string {
    const msgStr = messages.map((m) => `${m.role}:${m.content.substring(0, 100)}`).join('|');
    return `${options.provider}:${options.model}:${msgStr}`;
  }

  private _cacheResponse(messages: LLMMessage[], options: LLMConfig, response: LLMResponse) {
    const key = this._cacheKey(messages, options);
    this._cache.set(key, response);
    if (this._cache.size > this._cacheMaxSize) {
      const first = this._cache.keys().next().value;
      if (first) this._cache.delete(first);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      requests: this._requestCount,
      errors: this._errorCount,
      cacheSize: this._cache.size,
      available: this.isAvailable(),
    };
  }

  clearCache() {
    this._cache.clear();
  }
}

export default LLMClient;
