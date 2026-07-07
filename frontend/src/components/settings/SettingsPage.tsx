import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  Save,
  Key,
  Image,
  Gamepad2,
  Palette,
  Eye,
  EyeOff,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  useSettingsStore,
  PROVIDER_MODELS,
  PROVIDER_DEFAULTS,
  type LLMProvider,
  type ImageStrategy,
  type ThemeMode,
} from '../../stores/settingsStore';

type TabKey = 'llm' | 'image' | 'game' | 'theme';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'llm', label: 'LLM 配置', icon: <Key size={16} /> },
  { key: 'image', label: '图片配置', icon: <Image size={16} /> },
  { key: 'game', label: '游戏设置', icon: <Gamepad2 size={16} /> },
  { key: 'theme', label: '主题设置', icon: <Palette size={16} /> },
];

/* ── Reusable UI primitives ─────────────────────────────────────── */

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="rounded-lg border border-gray-800/60 bg-gray-900/40 p-5 space-y-4">
    <h3 className="text-sm font-semibold text-red-400 tracking-wide">{title}</h3>
    {children}
  </div>
);

const Label: React.FC<{ children: React.ReactNode; required?: boolean }> = ({
  children,
  required,
}) => (
  <label className="block text-xs font-medium text-gray-400 mb-1.5">
    {children}
    {required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
);

const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-red-700 focus:ring-1 focus:ring-red-900/40 ${props.className || ''}`}
  />
);

const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className={`w-full rounded-md border border-gray-700 bg-gray-800/60 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:border-red-700 focus:ring-1 focus:ring-red-900/40 ${props.className || ''}`}
  />
);

const Slider: React.FC<{
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}> = ({ min, max, step = 1, value, onChange, suffix }) => (
  <div className="flex items-center gap-3">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="flex-1 h-1.5 appearance-none rounded-full bg-gray-700 accent-red-600"
    />
    <span className="min-w-[3rem] text-right text-xs text-gray-400 tabular-nums">
      {value}{suffix}
    </span>
  </div>
);

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="flex items-center gap-3 group"
  >
    <div
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-red-700' : 'bg-gray-700'
      }`}
    >
      <div
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </div>
    <span className="text-sm text-gray-300">{label}</span>
  </button>
);

/* ── Main Page ──────────────────────────────────────────────────── */

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('llm');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const {
    llm,
    image,
    game,
    theme,
    setLLM,
    setImage,
    setGame,
    setTheme,
    saveToBackend,
    loadFromBackend,
    loaded,
  } = useSettingsStore();

  // Load settings on mount
  useEffect(() => {
    loadFromBackend();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply theme on mount / change
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // Theme mode
    if (theme.mode === 'dark') {
      body.classList.add('dark');
      body.classList.remove('light');
    } else if (theme.mode === 'light') {
      body.classList.add('light');
      body.classList.remove('dark');
    } else {
      // auto: follow system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.toggle('dark', prefersDark);
      body.classList.toggle('light', !prefersDark);
    }

    // Custom CSS variables
    for (const [k, v] of Object.entries(theme.customVars)) {
      if (v) root.style.setProperty(k, v);
    }

    // Game settings -> CSS variables
    root.style.setProperty('--agm-font-size', `${game.fontSize}px`);
  }, [theme.mode, theme.customVars, game.fontSize]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveToBackend();
      setSaveMsg({ type: 'ok', text: '设置已保存' });
    } catch (err: any) {
      setSaveMsg({ type: 'err', text: err.message || '保存失败' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [saveToBackend]);

  const toggleKeyVisibility = (key: string) =>
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderLLM = () => (
    <div className="space-y-5">
      <SectionCard title="提供商与模型">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label required>提供商</Label>
            <Select
              value={llm.provider}
              onChange={(e) => {
                const p = e.target.value as LLMProvider;
                const defaults = PROVIDER_DEFAULTS[p];
                setLLM({ provider: p, baseUrl: defaults.baseUrl!, model: defaults.model! });
              }}
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="ollama">Ollama (本地)</option>
            </Select>
          </div>
          <div>
            <Label required>模型</Label>
            <Select
              value={llm.model}
              onChange={(e) => setLLM({ model: e.target.value })}
            >
              {PROVIDER_MODELS[llm.provider].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="API 认证">
        <div className="space-y-3">
          <div>
            <Label>Base URL</Label>
            <Input
              value={llm.baseUrl}
              onChange={(e) => setLLM({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div>
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showKeys['llmApiKey'] ? 'text' : 'password'}
                value={llm.apiKey}
                onChange={(e) => setLLM({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('llmApiKey')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKeys['llmApiKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              API Key 会在本地加密存储，不会明文传输。
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="生成参数">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Max Tokens</Label>
            <Input
              type="number"
              min={64}
              max={8192}
              value={llm.maxTokens}
              onChange={(e) => setLLM({ maxTokens: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Temperature</Label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={llm.temperature}
              onChange={(e) => setLLM({ temperature: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>超时 (ms)</Label>
            <Input
              type="number"
              min={5000}
              max={120000}
              step={1000}
              value={llm.timeout}
              onChange={(e) => setLLM({ timeout: Number(e.target.value) })}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderImage = () => (
    <div className="space-y-5">
      <SectionCard title="图片源配置">
        <div className="space-y-3">
          <div>
            <Label>默认图片策略</Label>
            <Select
              value={image.defaultStrategy}
              onChange={(e) => setImage({ defaultStrategy: e.target.value as ImageStrategy })}
            >
              <option value="search">搜索 (Unsplash/Pexels)</option>
              <option value="generate">生成 (DALL-E)</option>
              <option value="upload">本地上传</option>
            </Select>
          </div>
          <div>
            <Label>Unsplash Access Key</Label>
            <div className="relative">
              <Input
                type={showKeys['unsplashKey'] ? 'text' : 'password'}
                value={image.unsplashKey}
                onChange={(e) => setImage({ unsplashKey: e.target.value })}
                placeholder="可选，用于图片搜索"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('unsplashKey')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKeys['unsplashKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <Label>DALL-E / OpenAI Key</Label>
            <div className="relative">
              <Input
                type={showKeys['dalleKey'] ? 'text' : 'password'}
                value={image.dalleKey}
                onChange={(e) => setImage({ dalleKey: e.target.value })}
                placeholder="可选，用于 AI 图片生成"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('dalleKey')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showKeys['dalleKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-600">
              留空则使用 LLM 配置中的 API Key。
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderGame = () => (
    <div className="space-y-5">
      <SectionCard title="文本显示">
        <div className="space-y-4">
          <div>
            <Label>打字机速度（每字符间隔）</Label>
            <Slider
              min={0}
              max={200}
              step={5}
              value={game.typewriterSpeed}
              onChange={(v) => setGame({ typewriterSpeed: v })}
              suffix="ms"
            />
            <p className="mt-1 text-[11px] text-gray-600">
              0 = 即时显示
            </p>
          </div>
          <div>
            <Label>字体大小</Label>
            <Slider
              min={12}
              max={24}
              step={1}
              value={game.fontSize}
              onChange={(v) => setGame({ fontSize: v })}
              suffix="px"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="自动播放">
        <div className="space-y-4">
          <div>
            <Label>自动前进延迟</Label>
            <Slider
              min={0}
              max={5000}
              step={100}
              value={game.autoAdvanceDelay}
              onChange={(v) => setGame({ autoAdvanceDelay: v })}
              suffix="ms"
            />
            <p className="mt-1 text-[11px] text-gray-600">
              文本显示完后自动进入下一段的等待时间。0 = 不自动前进。
            </p>
          </div>
          <Toggle
            checked={game.skipUnread}
            onChange={(v) => setGame({ skipUnread: v })}
            label="允许跳过未读文本"
          />
        </div>
      </SectionCard>
    </div>
  );

  const renderTheme = () => (
    <div className="space-y-5">
      <SectionCard title="外观模式">
        <div className="grid grid-cols-3 gap-3">
          {(['auto', 'dark', 'light'] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setTheme({ mode: m })}
              className={`rounded-md border px-3 py-2.5 text-sm transition-colors ${
                theme.mode === m
                  ? 'border-red-700 bg-red-900/20 text-red-300'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:bg-gray-800/60'
              }`}
            >
              {m === 'auto' ? '🌓 跟随系统' : m === 'dark' ? '🌑 深色' : '☀️ 浅色'}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="自定义 CSS 变量">
        <div className="space-y-3">
          {[
            { key: '--agm-bg', label: '背景色', placeholder: '#0a0a0a' },
            { key: '--agm-accent', label: '强调色', placeholder: '#8b0000' },
            { key: '--agm-text', label: '文字色', placeholder: '#e2e8f0' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} className="grid grid-cols-[1fr_2fr] gap-3 items-center">
              <span className="text-xs text-gray-400 font-mono">{key}</span>
              <Input
                value={theme.customVars[key] || ''}
                onChange={(e) =>
                  setTheme({
                    customVars: { ...theme.customVars, [key]: e.target.value },
                  })
                }
                placeholder={placeholder}
              />
            </div>
          ))}
          <button
            onClick={() => setTheme({ customVars: {} })}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RotateCcw size={12} />
            重置自定义变量
          </button>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <div className="w-full h-full flex flex-col bg-gray-950 text-gray-200 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/60 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronLeft size={16} />
            返回
          </button>
          <h1 className="text-base font-bold text-red-400 tracking-wide">设置</h1>
          {!loaded && (
            <span className="text-[11px] text-gray-600">加载中...</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <span
              className={`flex items-center gap-1 text-xs ${
                saveMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {saveMsg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {saveMsg.text}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-red-800/60 hover:bg-red-700/60 disabled:opacity-50 px-4 py-1.5 text-sm transition-colors"
          >
            <Save size={14} />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 border-r border-gray-800/60 p-3 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                activeTab === t.key
                  ? 'bg-red-900/20 text-red-300 border border-red-800/30'
                  : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {activeTab === 'llm' && renderLLM()}
            {activeTab === 'image' && renderImage()}
            {activeTab === 'game' && renderGame()}
            {activeTab === 'theme' && renderTheme()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
