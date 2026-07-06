import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import VisualNovelEngine from './components/engine/VisualNovelEngine';
import GeneratorPage from './components/generator/GeneratorPage';
import type { Module } from './types/module';

/**
 * App.tsx
 * Main router for AI-GM Standalone.
 * Routes: / (home), /generator, /play, /settings
 */

const App: React.FC = () => {
  return (
    <div className="w-full h-screen bg-black text-gray-100 overflow-hidden">
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/generator" element={<GeneratorPageRoute />} />
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
  <div className="w-full h-full flex items-center justify-center">
    <p className="text-gray-400">设置 — 明日开发</p>
  </div>
);

export default App;
