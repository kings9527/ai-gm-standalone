import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import VisualNovelEngine from './components/engine/VisualNovelEngine';
import GeneratorPage from './components/generator/GeneratorPage';
import { StyleAnalyzerPanel } from './components/style-analyzer';
import { ImageSelector } from './components/image-selector';
import type { Module } from './types/module';

/**
 * App.tsx
 * Main router for AI-GM Standalone.
 * Routes: / (home), /generator, /play, /settings, /images
 */

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-black text-gray-100 overflow-hidden">
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/generator" element={<GeneratorPageRoute />} />
          <Route path="/style-analyzer" element={<StyleAnalyzerPanel />} />
          <Route path="/images" element={<ImageManagerPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
};

// Home Page
const HomePage: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black">
    <h1 className="text-4xl font-bold mb-2 text-red-500 tracking-wider">AI-GM</h1>
    <p className="text-gray-400 mb-8">AI 驱动的视觉小说 RPG 引擎</p>
    <div className="flex flex-col gap-4 w-64">
      <a
        href="#/style-analyzer"
        className="px-6 py-3 rounded-lg bg-red-900/40 border border-red-800/40 text-center hover:bg-red-800/40 transition-colors"
      >
        AI 风格分析器
      </a>
      <a
        href="#/generator"
        className="px-6 py-3 rounded-lg bg-red-900/40 border border-red-800/40 text-center hover:bg-red-800/40 transition-colors"
      >
        上传故事，创建模组
      </a>
      <a
        href="#/play"
        className="px-6 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 text-center hover:bg-gray-700/40 transition-colors"
      >
        继续游戏
      </a>
      <a
        href="#/images"
        className="px-6 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 text-center hover:bg-gray-700/40 transition-colors"
      >
        图片管理
      </a>
      <a
        href="#/settings"
        className="px-6 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 text-center hover:bg-gray-700/40 transition-colors"
      >
        设置
      </a>
    </div>
  </div>
);

// Generator Page - AI Module Generator
const GeneratorPageRoute: React.FC = () => <GeneratorPage />;

// Image Manager Page - Full-page image management
const ImageManagerPage: React.FC = () => {
  const [selected, setSelected] = useState<any>(null);
  return (
    <div className="w-full h-full bg-gray-950">
      <ImageSelector
        type="all"
        modal={false}
        title="图片管理"
        onSelect={(img) => {
          setSelected(img);
          console.log('Selected image:', img);
        }}
      />
    </div>
  );
};

// Play Page - Visual Novel Engine Integration
const PlayPage: React.FC = () => {
  const [module, setModule] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load demo module
    fetch('/demo-module.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Module) => {
        setModule(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load demo module:', err);
        setError('加载模组失败，请检查网络连接');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-gray-400 gap-4">
        <div className="w-8 h-8 border-2 border-red-800 border-t-transparent rounded-full animate-spin" />
        <span>加载模组中...</span>
      </div>
    );
  }

  if (error || !module) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-black text-gray-400 gap-4">
        <span className="text-red-500">⚠ {error || '模组加载失败'}</span>
        <a href="#/" className="text-sm text-gray-500 hover:text-gray-300 underline">
          返回主页
        </a>
      </div>
    );
  }

  return (
    <VisualNovelEngine
      module={module}
      onSave={() => {
        console.log('Save triggered at', new Date().toISOString());
        // TODO: Implement save logic with gameStore
      }}
    />
  );
};

// Settings Page (placeholder)
const SettingsPage: React.FC = () => (
  <div className="w-full h-full flex flex-col bg-gray-950 p-8 overflow-y-auto">
    <h2 className="text-xl font-bold text-red-400 mb-6">设置</h2>
    <div className="space-y-4 max-w-2xl">
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800/40">
        <h3 className="text-sm font-medium text-gray-300 mb-2">API 配置</h3>
        <p className="text-xs text-gray-500 mb-3">
          在设置中配置以下 Key 以启用完整功能：
        </p>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• OPENAI_API_KEY — 用于 DALL-E 图片生成</li>
          <li>• UNSPLASH_ACCESS_KEY — 用于 Unsplash 图片搜索</li>
        </ul>
      </div>
      <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800/40">
        <h3 className="text-sm font-medium text-gray-300 mb-2">图片缓存</h3>
        <p className="text-xs text-gray-500">
          图片缓存存储在 ~/AI-GM/images/ 目录下，按类型分为 bg/、sprite/、portrait/、upload/ 子目录。
        </p>
      </div>
    </div>
  </div>
);

export default App;
