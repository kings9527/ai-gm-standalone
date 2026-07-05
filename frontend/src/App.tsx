import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

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
          <Route path="/generator" element={<GeneratorPage />} />
          <Route path="/play" element={<PlayPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
};

// Placeholder pages - will be implemented in subsequent tasks
const HomePage: React.FC = () => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-black">
    <h1 className="text-4xl font-bold mb-2 text-red-500 tracking-wider">AI-GM</h1>
    <p className="text-gray-400 mb-8">AI 驱动的视觉小说 RPG 引擎</p>
    <div className="flex flex-col gap-4 w-64">
      <a href="#/generator" className="px-6 py-3 rounded-lg bg-red-900/40 border border-red-800/40 text-center hover:bg-red-800/40 transition-colors">
        上传故事，创建模组
      </a>
      <a href="#/play" className="px-6 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 text-center hover:bg-gray-700/40 transition-colors">
        继续游戏
      </a>
      <a href="#/settings" className="px-6 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 text-center hover:bg-gray-700/40 transition-colors">
        设置
      </a>
    </div>
  </div>
);

const GeneratorPage: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center">
    <p className="text-gray-400">模组生成器 — 明日开发</p>
  </div>
);

const PlayPage: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center">
    <p className="text-gray-400">游戏画面 — 明日开发</p>
  </div>
);

const SettingsPage: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center">
    <p className="text-gray-400">设置 — 明日开发</p>
  </div>
);

export default App;
