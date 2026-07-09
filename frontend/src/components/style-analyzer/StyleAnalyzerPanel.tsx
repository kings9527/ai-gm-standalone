import React, { useState, useRef, useCallback } from 'react';
import {
  Wand2, Loader2, AlertCircle, CheckCircle, ArrowLeft,
  FileText, Sparkles, RotateCcw, Save, Eye, Edit3
} from 'lucide-react';
import { Uploader, type UploadResult } from '../generator/Uploader';
import { preprocessStory, type PreprocessResult } from '../generator/textPreprocess';
import { useStyleStore, type StyleJson, buildCSSVariables, applyCSSVariables } from '../../stores/styleStore';
import { useSettingsStore } from '../../stores/settingsStore';
import LLMClient from '../../llm/client';
import StyleEditor from './StyleEditor';
import StylePreview from './StylePreview';

/**
 * StyleAnalyzerPanel 风格分析主面板
 * 流程：上传文本 → AI 分析 → 生成 style.json → 预览 → 编辑 → 保存到后端
 */

type Stage = 'upload' | 'analyzing' | 'preview' | 'edit' | 'error';

export const StyleAnalyzerPanel: React.FC = () => {
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const styleStore = useStyleStore();

  const [stage, setStage] = useState<Stage>('upload');
  const [error, setError] = useState<string | null>(null);
  const [preprocessResult, setPreprocessResult] = useState<PreprocessResult | null>(null);
  const [currentStyle, setCurrentStyle] = useState<StyleJson | null>(null);
  const [progressText, setProgressText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const llmClientRef = useRef(new LLMClient(llmConfig));

  React.useEffect(() => {
    llmClientRef.current = new LLMClient(llmConfig);
  }, [llmConfig]);

  // 1. 上传文本
  const handleUpload = useCallback((result: UploadResult) => {
    setError(null);
    setSavedId(null);
    setStage('analyzing');
    setProgressText('正在预处理文本...');

    const preprocessed = preprocessStory(result.content);
    setPreprocessResult(preprocessed);
    setProgressText('正在调用 AI 分析风格...');

    runStyleAnalysis(preprocessed);
  }, []);

  // 2. AI 风格分析（接入后端 /api/llm/chat）
  const runStyleAnalysis = async (preprocess: PreprocessResult) => {
    const client = llmClientRef.current;
    if (!client.isAvailable()) {
      setError('LLM 未配置，请先在设置中配置 API');
      setStage('error');
      return;
    }

    try {
      const systemPrompt = {
        role: 'system' as const,
        content: `You are a visual style analyst for a visual novel RPG engine.
Analyze the provided story text and extract the visual atmosphere, era, and mood.

Respond ONLY with a JSON object in this exact format:
{
  "name": "A short descriptive name for this style (in Chinese or English)",
  "description": "Brief description of the visual style (1-2 sentences)",
  "palette": {
    "bg": "#0a0a0a",
    "accent": "#8b0000",
    "text": "#e2e8f0",
    "dialogue_bg": "rgba(10,10,10,0.9)"
  },
  "atmosphere": "horror|mystery|adventure|slice_of_life|fantasy|sci-fi|dark_fantasy|cosmic_horror|noir|steampunk|post_apocalyptic|romance",
  "era": "victorian|modern|fantasy|sci-fi|ancient|medieval|1920s|cyberpunk|post_apocalyptic|western|feudal_japan",
  "art_style": "dark_realistic|anime|pixel|watercolor|minimalist|oil_painting|sketch|vaporwave|retro|3d_render",
  "lighting": "oil_lamp|neon|daylight|moonlight|torch|none|flickering|strobe|warm_glow|cold_blue|purple_haze",
  "mood_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "font_family": "serif|sans-serif|monospace|pixel",
  "effects": ["grain", "vignette", "chromatic_aberration"],
  "image_strategy": {
    "background": "search|generate|upload",
    "sprites": "search|generate|upload",
    "search_provider": "unsplash|pexels"
  }
}

Color palette rules by genre:
- Horror: dark reds, blacks, grays (#0a0a0a, #8b0000, #e2e8f0)
- Fantasy: deep purples, golds, midnight blues (#1a0a2e, #ffd700, #e0e0e0)
- Sci-fi: cyans, magentas, dark grays (#0a0f1a, #00ffcc, #c0c0c0)
- Slice of life: warm tones, soft colors (#faf0e6, #ff8c42, #333333)
- Mystery: dark blues, amber (#0a0f14, #ffaa00, #d0d0d0)
- Noir: black, white, high contrast (#000000, #ffffff, #333333)

Analyze the text's tone, setting, and emotional quality. Return ONLY the JSON object.`,
      };

      const userPrompt = {
        role: 'user' as const,
        content: `Analyze the visual style for this story (${preprocess.stats.totalChars} chars, ${preprocess.stats.totalWords} words):
\n---\n${preprocess.summary}\n---\n\nKeywords: ${preprocess.keywords.slice(0, 10).map((k) => k.word).join(', ')}`,
      };

      const response = await client.chat([systemPrompt, userPrompt], {
        temperature: 0.5,
        maxTokens: 1024,
      });

      const styleData = client.extractJSON(response.content) as StyleJson;
      if (!styleData) {
        throw new Error('AI 返回的 JSON 解析失败，请重试');
      }

      // 确保必填字段存在
      const normalizedStyle: StyleJson = {
        id: `style_${Date.now()}`,
        name: styleData.name || 'AI 生成风格',
        description: styleData.description || `基于 ${styleData.atmosphere || '未知'} 氛围自动生成`,
        palette: {
          bg: styleData.palette?.bg || '#0a0a0a',
          accent: styleData.palette?.accent || '#8b0000',
          text: styleData.palette?.text || '#e2e8f0',
          dialogue_bg: styleData.palette?.dialogue_bg || 'rgba(10,10,10,0.9)',
        },
        atmosphere: styleData.atmosphere || 'mystery',
        era: styleData.era || 'modern',
        art_style: styleData.art_style || 'dark_realistic',
        lighting: styleData.lighting || 'oil_lamp',
        mood_keywords: styleData.mood_keywords || ['mystery', 'tension'],
        font_family: styleData.font_family || 'serif',
        effects: styleData.effects || ['grain'],
        image_strategy: {
          background: styleData.image_strategy?.background || 'search',
          sprites: styleData.image_strategy?.sprites || 'search',
          search_provider: styleData.image_strategy?.search_provider || 'unsplash',
        },
      };

      setCurrentStyle(normalizedStyle);
      applyCSSVariables(buildCSSVariables(normalizedStyle));
      setStage('preview');
    } catch (err: any) {
      setError(`分析失败: ${err.message || '未知错误'}`);
      setStage('error');
    }
  };

  // 保存风格到后端
  const handleSave = async () => {
    if (!currentStyle) return;
    setIsSaving(true);
    try {
      const id = await styleStore.saveStyle(currentStyle);
      setSavedId(id);
      setStage('preview');
    } catch (err: any) {
      setError(`保存失败: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // 应用风格到全局
  const handleApply = () => {
    if (!currentStyle) return;
    styleStore.applyStyle(currentStyle);
  };

  // 编辑风格
  const handleStyleChange = (updated: StyleJson) => {
    setCurrentStyle(updated);
    applyCSSVariables(buildCSSVariables(updated));
  };

  // 重新开始
  const handleReset = () => {
    setPreprocessResult(null);
    setCurrentStyle(null);
    setError(null);
    setSavedId(null);
    styleStore.resetStyle();
    setStage('upload');
  };

  // 渲染
  return (
    <div className="w-full h-full flex flex-col bg-black text-gray-100 overflow-hidden">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50 bg-gray-950/80">
        <div className="flex items-center gap-3">
          <a href="#/" className="text-gray-500 hover:text-gray-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-sm font-semibold text-gray-200">AI 风格分析器</h1>
        </div>
        {stage !== 'upload' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重新开始
            </button>
          </div>
        )}
      </div>

      {/* 主内容 */}
      <div className="flex-1 overflow-hidden">
        {stage === 'upload' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-xl space-y-6">
              <div className="text-center">
                <Wand2 className="w-10 h-10 text-red-700 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-gray-200 mb-1">上传故事文本，AI 分析视觉风格</h2>
                <p className="text-sm text-gray-500">
                  AI 会自动提取调色板、氛围、时代、光照、字体和特效参数
                </p>
              </div>
              <Uploader onUpload={handleUpload} />
              <div className="rounded-lg border border-gray-800/40 bg-gray-900/30 p-4">
                <p className="text-xs text-gray-500 mb-2">提示：AI 会分析故事的情感基调、场景描述和角色对话来推断视觉风格</p>
                <div className="text-xs text-gray-600 space-y-1">
                  <p>• 支持 .txt / .md 文件或粘贴文本</p>
                  <p>• 分析结果会生成 style.json 并保存到后端</p>
                  <p>• 可手动微调所有风格参数</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 'analyzing' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-gray-300">{progressText}</p>
                <p className="text-xs text-gray-600 mt-1">请稍候，AI 正在分析中...</p>
              </div>
              {preprocessResult && (
                <div className="mt-6 w-full max-w-lg rounded-lg border border-gray-800/40 bg-gray-900/30 p-4 text-left">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <StatBadge label="字符" value={preprocessResult.stats.totalChars} />
                    <StatBadge label="词数" value={preprocessResult.stats.totalWords} />
                    <StatBadge label="段落" value={preprocessResult.stats.paragraphs} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {stage === 'error' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
            <p className="text-sm text-red-400 mb-4">{error}</p>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-md text-sm bg-gray-800 text-gray-300 hover:bg-gray-700"
              >
                返回上传
              </button>
              <button
                onClick={() => preprocessResult && runStyleAnalysis(preprocessResult)}
                className="px-4 py-2 rounded-md text-sm bg-red-900/30 border border-red-800/30 text-red-300 hover:bg-red-800/40"
              >
                重试分析
              </button>
            </div>
          </div>
        )}

        {(stage === 'preview' || stage === 'edit') && currentStyle && (
          <div className="w-full h-full flex overflow-hidden">
            {/* 左侧：预览面板 */}
            <div className="w-80 border-r border-gray-800/50 overflow-y-auto p-4 bg-gray-950/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">风格预览</h3>
                {savedId && (
                  <span className="text-[10px] text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    已保存
                  </span>
                )}
              </div>
              <StylePreview
                style={currentStyle}
                onApply={handleApply}
                onEdit={() => setStage('edit')}
              />
            </div>

            {/* 右侧：编辑器或详情 */}
            <div className="flex-1 overflow-y-auto p-4">
              {stage === 'preview' ? (
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">生成的 style.json</h3>
                    <pre className="text-xs text-gray-400 font-mono overflow-x-auto p-3 rounded-md bg-gray-950/50 border border-gray-800/40">
                      {JSON.stringify(currentStyle, null, 2)}
                    </pre>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStage('edit')}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700/40 text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                      手动微调
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-900/30 border border-red-800/40 text-sm text-red-300 hover:bg-red-800/40 disabled:opacity-50 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {isSaving ? '保存中...' : '保存到后端'}
                    </button>
                    <button
                      onClick={handleApply}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-900/30 border border-green-800/40 text-sm text-green-300 hover:bg-green-800/40 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      应用风格
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-gray-300">手动微调风格参数</h3>
                    <button
                      onClick={() => setStage('preview')}
                      className="text-xs text-gray-500 hover:text-gray-300"
                    >
                      返回预览
                    </button>
                  </div>
                  <StyleEditor
                    style={currentStyle}
                    onChange={handleStyleChange}
                    onSave={handleSave}
                    isSaving={isSaving}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-md bg-gray-950/50 border border-gray-800/30 p-1.5">
    <div className="text-sm font-semibold text-gray-300">{value}</div>
    <div className="text-[10px] text-gray-600">{label}</div>
  </div>
);

export default StyleAnalyzerPanel;
