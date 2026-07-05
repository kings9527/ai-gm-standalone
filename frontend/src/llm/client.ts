import { electronAPI } from '../api/electron';
import type { LLMConfig, LLMMessage, LLMResponse } from '../types/llm';

/**
 * LLM Client (Electron Desktop App version)
 * Calls backend LLM proxy via IPC instead of direct fetch.
 * API Key is stored securely in backend SQLite, never exposed to frontend.
 */

export class LLMClient {
  config: LLMConfig;
  cache: Map<string, { content: string; timestamp: number }>;
  private cacheMaxAge: number;

  constructor(config: LLMConfig) {
    this.config = { ...config };
    this.cache = new Map();
    this.cacheMaxAge = 5 * 60 * 1000;
  }

  isAvailable(): boolean {
    return !!this.config.provider;
  }

  private getCacheKey(messages: LLMMessage[]): string {
    return JSON.stringify({ provider: this.config.provider, model: this.config.model, messages });
  }

  private getCached(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(key);
      return null;
    }
    return entry.content;
  }

  private setCache(key: string, content: string): void {
    this.cache.set(key, { content, timestamp: Date.now() });
  }

  async chat(
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): Promise<LLMResponse> {
    const cacheKey = this.getCacheKey(messages);
    const cached = this.getCached(cacheKey);
    if (cached) return { content: cached, usage: { prompt: 0, completion: 0 } };

    try {
      const body = {
        provider: this.config.provider,
        model: this.config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? this.config.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
        stream: false,
      };

      const data = await electronAPI.llmChat(body);
      this.setCache(cacheKey, data.content);
      return { content: data.content, usage: data.usage };
    } catch (error: any) {
      console.error('[LLMClient] Chat failed:', error);
      throw error;
    }
  }

  async *streamChat(
    messages: LLMMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
  ): AsyncGenerator<string, void, unknown> {
    try {
      const body = {
        provider: this.config.provider,
        model: this.config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? this.config.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
      };

      let buffer = '';
      let done = false;

      await electronAPI.llmStream(
        body,
        (chunk: string) => {
          buffer += chunk;
        },
        () => {
          done = true;
        },
      );

      // Wait for stream to complete and yield buffered content
      while (!done) {
        await new Promise((r) => setTimeout(r, 50));
      }

      // Parse SSE format: data: {...}
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || parsed.content || '';
          if (content) yield content;
        } catch {
          // Not JSON, yield raw
          if (data && data !== '[DONE]') yield data;
        }
      }
    } catch (error: any) {
      console.error('[LLMClient] Stream failed:', error);
      throw error;
    }
  }

  extractJSON(text: string): any {
    if (!text) return null;

    try {
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonMatch) return JSON.parse(jsonMatch[1].trim());
      return JSON.parse(text.trim());
    } catch {
      // Try finding JSON object in text
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          return JSON.parse(objectMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

export default LLMClient;
