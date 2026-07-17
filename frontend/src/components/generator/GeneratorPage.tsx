import React, { useState, useCallback, useRef } from 'react';
import {
  Wand2, Loader2, AlertCircle, CheckCircle, ArrowLeft,
  FileText, BarChart3, Sparkles, Type, RotateCcw
} from 'lucide-react';
import { Uploader, type UploadResult } from './Uploader';
import { preprocessStory, type PreprocessResult } from './textPreprocess';
import {
  buildAnalysisPrompt,
  buildModuleGenerationPrompt,
  buildStylePrompt,
} from './generatorPrompts';
import { ModulePreview } from './ModulePreview';
import { electronAPI } from '../../api/electron';
import LLMClient from '../../llm/client';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModuleStore } from '../../stores/moduleStore';
import type { Module } from '../../types/module';

/**
 * 模组生成器主页面
 * 流程：上传/粘贴 → 文本预处理 → AI 分析 → 模组生成 → 预览编辑 → 保存
 */
export const GeneratorPage: React.FC = () => {
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const addModule = useModuleStore((s) => s.addModule);
  const setCurrentModule = useModuleStore((s) => s.setCurrentModule);

  // 阶段状态
  type Stage = 'upload' | 'preprocess' | 'analyzing' | 'generating' | 'preview' | 'error';
  const [stage, setStage] = useState<Stage>('upload');
  const [error, setError] = useState<string | null>(null);

  // 数据状态
  const [preprocessResult, setPreprocessResult] = useState<PreprocessResult | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null);
  const [generatedModule, setGeneratedModule] = useState<Module | null>(null);
  const [progressText, setProgressText] = useState('');

  const llmClientRef = useRef(new LLMClient(llmConfig));

  // 更新 LLM 客户端配置
  React.useEffect(() => {
    llmClientRef.current = new LLMClient(llmConfig);
  }, [llmConfig]);

  // 1. 上传/粘贴后的处理
  const handleUpload = useCallback((result: UploadResult) => {
    setError(null);
    setStage('preprocess');
    setProgressText('正在预处理文本...');

    // 文本预处理（同步，很快）
    const preprocessed = preprocessStory(result.content);
    setPreprocessResult(preprocessed);

    // 自动进入 AI 分析
    setTimeout(() => {
      runAIAnalysis(preprocessed);
    }, 300);
  }, []);

  // 2. AI 分析
  const runAIAnalysis = async (preprocess: PreprocessResult) => {
    setStage('analyzing');
    setProgressText('正在分析故事结构与风格...');

    const client = llmClientRef.current;
    if (!client.isAvailable()) {
      setError('LLM 未配置，请先在设置中配置 API');
      setStage('error');
      return;
    }

    try {
      // 并行：分析 + 风格
      const [analysisRes, styleRes] = await Promise.all([
        client.chat(buildAnalysisPrompt(preprocess), { temperature: 0.5, maxTokens: 2048 }),
        client.chat(buildStylePrompt(preprocess), { temperature: 0.5, maxTokens: 1024 }),
      ]);

      let analysisData = client.extractJSON(analysisRes.content);
      let styleData = client.extractJSON(styleRes.content);

      // 合并分析结果
      if (styleData && analysisData) {
        analysisData = { ...analysisData, style: styleData };
      }

      setAnalysis(analysisData);

      // 进入模组生成
      await runModuleGeneration(preprocess, analysisData, styleData);
    } catch (err: any) {
      setError(`分析失败: ${err.message || '未知错误'}`);
      setStage('error');
    }
  };

  // 3. 模组生成
  const runModuleGeneration = async (
    preprocess: PreprocessResult,
    analysisData: Record<string, unknown> | null,
    styleData: Record<string, unknown> | null,
  ) => {
    setStage('generating');
    setProgressText('正在生成模组结构...');

    const client = llmClientRef.current;

    try {
      const response = await client.chat(
        buildModuleGenerationPrompt(preprocess, analysisData, styleData),
        { temperature: 0.7, maxTokens: 4096 },
      );

      const rawModule = client.extractJSON(response.content);
      if (!rawModule) {
        throw new Error('AI 返回的 JSON 解析失败，请重试');
      }

      // 标准化模块结构
      const module = normalizeModule(rawModule, styleData);
      setGeneratedModule(module);
      setStage('preview');
    } catch (err: any) {
      setError(`生成失败: ${err.message || '未知错误'}`);
      setStage('error');
    }
  };

  // 标准化模块数据
  const normalizeModule = (raw: any, styleOverride?: any): Module => {
    const id = raw.id || `mod_${Date.now()}`;
    const style = styleOverride || raw.style || {};

    return {
      id,
      name: raw.name || raw.title || '未命名模组',
      system: raw.system || 'custom',
      version: raw.version || '1.0.0',
      start_scene: raw.start_scene || Object.keys(raw.scenes || {})[0] || 'scene_1',
      style: {
        palette: {
          bg: style.palette?.bg || raw.palette?.bg || '#0a0a0a',
          accent: style.palette?.accent || raw.palette?.accent || '#8b0000',
          text: style.palette?.text || raw.palette?.text || '#e2e8f0',
          dialogue_bg: style.palette?.dialogue_bg || raw.palette?.dialogue_bg || 'rgba(10,10,10,0.9)',
        },
        atmosphere: style.atmosphere || raw.atmosphere || '悬疑',
        era: style.era || raw.era || '现代',
        art_style: style.art_style || raw.art_style || 'dark_realistic',
        lighting: style.lighting || raw.lighting || '低光、阴影',
        mood_keywords: style.mood_keywords || raw.mood_keywords || ['悬疑', '未知'],
        font_family: style.font_family || raw.font_family || 'sans-serif',
        effects: style.effects || raw.effects || [],
        image_strategy: {
          background: 'search',
          sprites: 'search',
          search_provider: 'unsplash',
        },
      },
      scenes: raw.scenes || {},
      npcs: raw.npcs || {},
      items: raw.items || {},
      events: raw.events || {},
    };
  };

  // 保存模组
  const handleSave = async () => {
    if (!generatedModule) return;
    try {
      await electronAPI.moduleSave(generatedModule);
      addModule(generatedModule);
      setCurrentModule(generatedModule);
      alert('模组已保存！');
    } catch (err: any) {
      setError(`保存失败: ${err.message}`);
    }
  };

  // 试玩模组
  const handlePlay = () => {
    if (!generatedModule) return;
    setCurrentModule(generatedModule);
    window.location.hash = '#/play';
  };

  // 导出模组
  const handleExport = () => {
    if (!generatedModule) return;
    const blob = new Blob([JSON.stringify(generatedModule, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedModule.id || 'module'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 更新模组（来自编辑器）
  const handleUpdateModule = (updated: Module) => {
    setGeneratedModule(updated);
  };

  // 重新开始
  const handleReset = () => {
    setPreprocessResult(null);
    setAnalysis(null);
    setGeneratedModule(null);
    setError(null);
    setStage('upload');
  };

  // 重新生成
  const handleRegenerate = () => {
    if (!preprocessResult) return;
    setError(null);
    runAIAnalysis(preprocessResult);
  };

  // === 渲染 ===

  return (
    <div className="w-full h-full flex flex-col bg-black text-gray-100 overflow-hidden">
      {/* 顶部导航 */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800/50 bg-gray-950/80">
        <div className="flex items-center gap-3">
          <a
            href="#/"
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <h1 className="text-sm font-semibold text-gray-200">AI 模组生成器</h1>
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
            {(stage === 'error' || stage === 'preview') && (
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
                  bg-red-900/20 border border-red-800/30 text-red-300
                  hover:bg-red-800/30 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                重新生成
              </button>
            )}
          </div>
        )}
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-hidden">
        {stage === 'upload' && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-xl space-y-6">
              <div className="text-center">
                <Wand2 className="w-10 h-10 text-red-700 mx-auto mb-3" />
                <h2 className="text-lg font-semibold text-gray-200 mb-1">上传你的故事</h2>
                <p className="text-sm text-gray-500">
                  支持 .txt / .md 文件、直接粘贴文本，或上传图片（OCR 识别）
                </p>
              </div>
              <Uploader onUpload={handleUpload} />

              {/* 示例提示 */}
              <div className="rounded-lg border border-gray-800/40 bg-gray-900/30 p-4">
                <p className="text-xs text-gray-500 mb-2">提示：故事内容越详细，生成的模组质量越高</p>
                <div className="text-xs text-gray-600 space-y-1">
                  <p>• 建议包含：场景描述、角色对话、关键物品、分支选择</p>
                  <p>• 字数建议：1000-10000 字</p>
                  <p>• 支持中文和英文故事</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {(stage === 'preprocess' || stage === 'analyzing' || stage === 'generating') && (
          <div className="w-full h-full flex flex-col items-center justify-center p-8">
            <div className="text-center space-y-4">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-gray-300">{progressText}</p>
                <p className="text-xs text-gray-600 mt-1">请稍候，AI 正在处理中...</p>
              </div>

              {/* 预处理结果展示 */}
              {preprocessResult && (
                <div className="mt-6 w-full max-w-lg rounded-lg border border-gray-800/40 bg-gray-900/30 p-4 text-left space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>文本统计</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <StatBadge label="字符" value={preprocessResult.stats.totalChars} />
                    <StatBadge label="词数" value={preprocessResult.stats.totalWords} />
                    <StatBadge label="段落" value={preprocessResult.stats.paragraphs} />
                    <StatBadge label="分段" value={preprocessResult.segments.length} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {preprocessResult.keywords.slice(0, 8).map((k) => (
                      <span
                        key={k.word}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-gray-800/60 text-gray-400 border border-gray-700/30"
                      >
                        {k.word}
                      </span>
                    ))}
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
                onClick={handleRegenerate}
                className="px-4 py-2 rounded-md text-sm bg-red-900/30 border border-red-800/30 text-red-300 hover:bg-red-800/40"
              >
                重试生成
              </button>
            </div>

            {preprocessResult && (
              <div className="mt-6 w-full max-w-lg">
                <p className="text-xs text-gray-500 mb-2">预处理成功，可以手动基于以下摘要自行创建模组：</p>
                <div className="rounded-lg border border-gray-800/40 bg-gray-900/30 p-3 text-xs text-gray-400 max-h-40 overflow-y-auto">
                  {preprocessResult.summary}
                </div>
              </div>
            )}
          </div>
        )}

        {stage === 'preview' && generatedModule && (
          <ModulePreview
            module={generatedModule}
            onUpdate={handleUpdateModule}
            onSave={handleSave}
            onPlay={handlePlay}
            onExport={handleExport}
          />
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

export default GeneratorPage;
