import { LLMClient } from './client';
import { PromptBuilder } from './prompts';
import type { StyleConfig } from '../types/module';

/**
 * AI Style Analyzer
 * Analyzes story text to extract visual style configuration.
 * Uses LLM to determine atmosphere, era, palette, and art style.
 */

export class StyleAnalyzer {
  private client: LLMClient;

  constructor(client: LLMClient) {
    this.client = client;
  }

  async analyze(text: string): Promise<StyleConfig> {
    const builder = new PromptBuilder({} as any, {} as any);
    const prompt = builder.buildStyleAnalysisPrompt();

    const response = await this.client.chat(
      [
        prompt,
        { role: 'user', content: text.substring(0, 3000) },
      ],
      { maxTokens: 512, temperature: 0.5 }
    );

    const result = this.client.extractJSON(response.content) as Partial<StyleConfig> || {};

    // Validate and fill defaults
    return {
      palette: {
        bg: result.palette?.bg || '#0a0a0a',
        accent: result.palette?.accent || '#8b0000',
        text: result.palette?.text || '#e2e8f0',
        dialogue_bg: result.palette?.dialogue_bg || 'rgba(10,10,10,0.9)',
      },
      atmosphere: result.atmosphere || 'mystery',
      era: result.era || 'modern',
      art_style: result.art_style || 'dark_realistic',
      lighting: result.lighting || 'oil_lamp',
      mood_keywords: result.mood_keywords || ['mystery', 'tension'],
      font_family: result.font_family || 'serif',
      effects: result.effects || ['grain'],
      image_strategy: {
        background: 'search',
        sprites: 'search',
        search_provider: 'unsplash',
      },
    };
  }

  static getDefaultStyle(): StyleConfig {
    return {
      palette: {
        bg: '#0a0a0a',
        accent: '#8b0000',
        text: '#e2e8f0',
        dialogue_bg: 'rgba(10,10,10,0.9)',
      },
      atmosphere: 'mystery',
      era: 'modern',
      art_style: 'dark_realistic',
      lighting: 'oil_lamp',
      mood_keywords: ['mystery', 'tension'],
      font_family: 'serif',
      effects: ['grain'],
      image_strategy: {
        background: 'search',
        sprites: 'search',
        search_provider: 'unsplash',
      },
    };
  }
}

export default StyleAnalyzer;
