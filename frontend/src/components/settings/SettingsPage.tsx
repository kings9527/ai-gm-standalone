import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
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
  X,
} from 'lucide-react';
import type { SettingsCommand } from '../../engine/action-handler';
import type { LLMConfig } from '../../types/llm';
import { useToast } from '../ui/ToastProvider';
import {
  useSettingsStore,
  PROVIDER_MODELS,
  PROVIDER_DEFAULTS,
  type LLMProvider,
  type ImageStrategy,
  type ThemeMode,
  type AppSettings,
} from '../../stores/settingsStore';

type TabKey = 'llm' | 'image' | 'game' | 'theme';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'llm', label: 'LLM 配置', icon: <Key size={16} /> },
  { key: 'image', label: '图片配置', icon: <Image size={16} /> },
  { key: 'game', label: '游戏设置', icon: <Gamepad2 size={16} /> },
  { key: 'theme', label: '主题设置', icon: <Palette size={16} /> },
];

/* ── Validation Types ─────────────────────────────────────────── */

interface FieldError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: FieldError[];
}

/* ── Validation Rules ─────────────────────────────────────────── */

function validateLLM(llm: LLMConfig): ValidationResult {
  const errors: FieldError[] = [];

  if (!llm.provider) {
    errors.push({ field: 'provider', message: '请选择 LLM 提供商' });
  }
  if (!llm.model) {
    errors.push({ field: 'model', message: '请选择模型' });
  }
  if (!llm.baseUrl || !/^https?:\/\/.+/.test(llm.baseUrl)) {
    errors.push({ field: 'baseUrl', message: 'Base URL 格式不正确（需以 http:// 或 https:// 开头）' });
  }
  if (llm.apiKey && !/^(sk-|Bearer\s)?[A-Za-z0-9_-]{20,}$/.test(llm.apiKey)) {
    errors.push({ field: 'apiKey', message: 'API Key 格式异常，请检查是否完整' });
  }
  if (llm.maxTokens < 64 || llm.maxTokens > 8192) {
    errors.push({ field: 'maxTokens', message: 'Max Tokens 必须在 64 - 8192 之间' });
  }
  if (llm.temperature < 0 || llm.temperature > 2) {
    errors.push({ field: 'temperature', message: 'Temperature 必须在 0 - 2 之间' });
  }
  if (llm.timeout < 5000 || llm.timeout > 120000) {
    errors.push({ field: 'timeout', message: '超时时间必须在 5000ms - 120000ms 之间' });
  }

  return { valid: errors.length === 0, errors };
}

function validateImage(image: { unsplashKey: string; dalleKey: string; defaultStrategy: string }): ValidationResult {
  const errors: FieldError[] = [];
  if (image.unsplashKey && !/^[A-Za-z0-9_-]{10,}$/.test(image.unsplashKey)) {
    errors.push({ field: 'unsplashKey', message: 'Unsplash Key 格式异常' });
  }
  if (image.dalleKey && !/^(sk-|Bearer\s)?[A-Za-z0-9_-]{20,}$/.test(image.dalleKey)) {
    errors.push({ field: 'dalleKey', message: 'DALL-E Key 格式异常' });
  }
  return { valid: errors.length === 0, errors };
}

function validateGame(game: { typewriterSpeed: number; fontSize: number; autoAdvanceDelay: number; skipUnread: boolean; soundEnabled: boolean; fullscreen: boolean }): ValidationResult {
  const errors: FieldError[] = [];
  if (game.typewriterSpeed < 0 || game.typewriterSpeed > 500) {
    errors.push({ field: 'typewriterSpeed', message: '打字机速度必须在 0 - 500ms 之间' });
  }
  if (game.fontSize < 10 || game.fontSize > 32) {
    errors.push({ field: 'fontSize', message: '字体大小必须在 10 - 32px 之间' });
  }
  if (game.autoAdvanceDelay < 0 || game.autoAdvanceDelay > 10000) {
    errors.push({ field: 'autoAdvanceDelay', message: '自动前进延迟必须在 0 - 10000ms 之间' });
  }
  return { valid: errors.length === 0, errors };
}

function validateAll(settings: AppSettings): ValidationResult {
  const results = [
    validateLLM(settings.llm),
    validateImage(settings.image),
    validateGame(settings.game),
  ];
  const errors = results.flatMap((r) => r.errors);
  return { valid: errors.length === 0, errors };
}

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

const FieldErrorMsg: React.FC<{ error?: string }> = ({ error }) => {
  if (!error) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1 mt-1.5"
    >
      <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
      <span className="text-[11px] text-red-400">{error}</span>
    </motion.div>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input: React.FC<InputProps> = ({ error, className = '', ...props }) => (
  <div>
    <input
      {...props}
      className={`w-full rounded-md border bg-gray-800/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:ring-1 focus:ring-red-900/40 ${
        error
          ? 'border-red-700 focus:border-red-600'
          : 'border-gray-700 focus:border-red-700'
      } ${className}`}
    />
    <FieldErrorMsg error={error} />
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

const Select: React.FC<SelectProps> = ({ error, className = '', ...props }) => (
  <div>
    <select
      {...props}
      className={`w-full rounded-md border bg-gray-800/60 px-3 py-2 text-sm text-gray-200 outline-none transition-colors focus:ring-1 focus:ring-red-900/40 ${
        error
          ? 'border-red-700 focus:border-red-600'
          : 'border-gray-700 focus:border-red-700'
      } ${className}`}
    />
    <FieldErrorMsg error={error} />
  </div>
);

const Slider: React.FC<{
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  error?: string;
}> = ({ min, max, step = 1, value, onChange, suffix, error }) => (
  <div>
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
    <FieldErrorMsg error={error} />
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

interface SettingsPageProps {
  fromGame?: boolean;
  /** Phase 2-E: 以模态框方式显示 */
  isModal?: boolean;
  /** 模态框关闭回调 */
  onClose?: () => void;
  /** Phase 2-E: 外部传入的设置命令（自然语言触发） */
  externalCommand?: SettingsCommand | null;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  fromGame = false,
  isModal = false,
  onClose,
  externalCommand,
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('llm');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

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

  // Validation state
  const validation = useMemo(() => {
    const s = useSettingsStore.getState();
    return validateAll(s);
  }, [llm, image, game]);

  const llmValidation = useMemo(() => validateLLM(llm), [llm]);
  const imageValidation = useMemo(() => validateImage(image), [image]);
  const gameValidation = useMemo(() => validateGame(game), [game]);

  const getFieldError = useCallback(
    (field: string, tab: TabKey): string | undefined => {
      if (!touched[field]) return undefined;
      const v = tab === 'llm' ? llmValidation : tab === 'image' ? imageValidation : gameValidation;
      return v.errors.find((e) => e.field === field)?.message;
    },
    [touched, llmValidation, imageValidation, gameValidation]
  );

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  // Phase 2-E: 处理外部设置命令（自然语言直接调整）
  useEffect(() => {
    if (!externalCommand) return;

    const { action, target, value, direction, tab } = externalCommand;

    if (tab) {
      setActiveTab(tab);
    }

    if (action === 'adjust' && target) {
      const state = useSettingsStore.getState();
      let confirmMsg = '';

      switch (target) {
        case 'soundEnabled': {
          const newVal = typeof value === 'boolean' ? value : !state.game.soundEnabled;
          setGame({ soundEnabled: newVal });
          confirmMsg = `音效已${newVal ? '开启' : '关闭'}`;
          break;
        }
        case 'fontSize': {
          let newVal = state.game.fontSize;
          if (direction === 'increase') newVal = Math.min(32, newVal + 2);
          else if (direction === 'decrease') newVal = Math.max(10, newVal - 2);
          else if (typeof value === 'number') newVal = value;
          setGame({ fontSize: newVal });
          confirmMsg = `字体大小已调整为 ${newVal}px`;
          break;
        }
        case 'typewriterSpeed': {
          let newVal = state.game.typewriterSpeed;
          // 注意：值越小越快，方向与直觉相反
          if (direction === 'increase') newVal = Math.min(500, newVal + 10);
          else if (direction === 'decrease') newVal = Math.max(0, newVal - 10);
          else if (typeof value === 'number') newVal = value;
          setGame({ typewriterSpeed: newVal });
          confirmMsg = `打字机速度已调整为 ${newVal}ms`;
          break;
        }
        case 'fullscreen': {
          const newVal = typeof value === 'boolean' ? value : !state.game.fullscreen;
          setGame({ fullscreen: newVal });
          if (newVal) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          } else {
            if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
          }
          confirmMsg = `全屏模式已${newVal ? '开启' : '关闭'}`;
          break;
        }
        case 'autoAdvanceDelay': {
          let newVal = state.game.autoAdvanceDelay;
          if (typeof value === 'number') newVal = value;
          else if (direction === 'increase') newVal = Math.min(5000, newVal + 500);
          else if (direction === 'decrease') newVal = Math.max(0, newVal - 500);
          setGame({ autoAdvanceDelay: newVal });
          confirmMsg = `自动前进延迟已调整为 ${newVal}ms`;
          break;
        }
        case 'skipUnread': {
          const newVal = typeof value === 'boolean' ? value : !state.game.skipUnread;
          setGame({ skipUnread: newVal });
          confirmMsg = `跳过未读文本已${newVal ? '开启' : '关闭'}`;
          break;
        }
        case 'themeMode': {
          const newMode = (value as 'dark' | 'light' | 'auto') || (state.theme.mode === 'dark' ? 'light' : 'dark');
          setTheme({ mode: newMode });
          confirmMsg = `主题已切换为${newMode === 'dark' ? '深色' : newMode === 'light' ? '浅色' : '跟随系统'}`;
          break;
        }
      }

      if (confirmMsg) {
        showToast(confirmMsg, 'success');
        // 短暂显示后自动保存到后端
        const timer = setTimeout(() => {
          state.saveToBackend().catch(() => {});
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [externalCommand, setGame, setTheme, showToast]);
  useEffect(() => {
    loadFromBackend();
     
  }, []);

  // Apply theme on mount / change
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (theme.mode === 'dark') {
      body.classList.add('dark');
      body.classList.remove('light');
    } else if (theme.mode === 'light') {
      body.classList.add('light');
      body.classList.remove('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      body.classList.toggle('dark', prefersDark);
      body.classList.toggle('light', !prefersDark);
    }

    for (const [k, v] of Object.entries(theme.customVars)) {
      if (v) root.style.setProperty(k, v);
    }

    root.style.setProperty('--agm-font-size', `${game.fontSize}px`);
  }, [theme.mode, theme.customVars, game.fontSize]);

  const handleSave = useCallback(async () => {
    // Touch all fields to show errors
    const allFields = [
      'provider', 'model', 'baseUrl', 'apiKey', 'maxTokens', 'temperature', 'timeout',
      'unsplashKey', 'dalleKey',
      'typewriterSpeed', 'fontSize', 'autoAdvanceDelay',
    ];
    setTouched(Object.fromEntries(allFields.map((f) => [f, true])));

    const result = validateAll(useSettingsStore.getState());
    if (!result.valid) {
      showToast(`有 ${result.errors.length} 项设置不符合要求，请检查后重试`, 'error');
      setSaveMsg({ type: 'err', text: `校验失败：${result.errors[0].message}` });
      setTimeout(() => setSaveMsg(null), 4000);
      return;
    }

    setSaving(true);
    setSaveMsg(null);
    try {
      await saveToBackend();
      setSaveMsg({ type: 'ok', text: '设置已保存' });
      showToast('设置已保存', 'success');
    } catch (err: any) {
      setSaveMsg({ type: 'err', text: err.message || '保存失败' });
      showToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }, [saveToBackend, showToast]);

  const toggleKeyVisibility = (key: string) =>
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderLLM = () => (
    <div className="space-y-5">
      <SectionCard title="提供商与模型">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label required>提供商</Label>
            <Select
              value={llm.provider}
              error={getFieldError('provider', 'llm')}
              onChange={(e) => {
                markTouched('provider');
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
              error={getFieldError('model', 'llm')}
              onChange={(e) => {
                markTouched('model');
                setLLM({ model: e.target.value });
              }}
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
              error={getFieldError('baseUrl', 'llm')}
              onChange={(e) => {
                markTouched('baseUrl');
                setLLM({ baseUrl: e.target.value });
              }}
              onBlur={() => markTouched('baseUrl')}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div>
            <Label>API Key</Label>
            <div className="relative">
              <Input
                type={showKeys['llmApiKey'] ? 'text' : 'password'}
                value={llm.apiKey}
                error={getFieldError('apiKey', 'llm')}
                onChange={(e) => {
                  markTouched('apiKey');
                  setLLM({ apiKey: e.target.value });
                }}
                onBlur={() => markTouched('apiKey')}
                placeholder="sk-..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('llmApiKey')}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Max Tokens</Label>
            <Input
              type="number"
              min={64}
              max={8192}
              value={llm.maxTokens}
              error={getFieldError('maxTokens', 'llm')}
              onChange={(e) => {
                markTouched('maxTokens');
                setLLM({ maxTokens: Number(e.target.value) });
              }}
              onBlur={() => markTouched('maxTokens')}
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
              error={getFieldError('temperature', 'llm')}
              onChange={(e) => {
                markTouched('temperature');
                setLLM({ temperature: Number(e.target.value) });
              }}
              onBlur={() => markTouched('temperature')}
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
              error={getFieldError('timeout', 'llm')}
              onChange={(e) => {
                markTouched('timeout');
                setLLM({ timeout: Number(e.target.value) });
              }}
              onBlur={() => markTouched('timeout')}
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
                error={getFieldError('unsplashKey', 'image')}
                onChange={(e) => {
                  markTouched('unsplashKey');
                  setImage({ unsplashKey: e.target.value });
                }}
                onBlur={() => markTouched('unsplashKey')}
                placeholder="可选，用于图片搜索"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('unsplashKey')}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
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
                error={getFieldError('dalleKey', 'image')}
                onChange={(e) => {
                  markTouched('dalleKey');
                  setImage({ dalleKey: e.target.value });
                }}
                onBlur={() => markTouched('dalleKey')}
                placeholder="可选，用于 AI 图片生成"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => toggleKeyVisibility('dalleKey')}
                className="absolute right-2 top-2 text-gray-500 hover:text-gray-300"
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
              error={getFieldError('typewriterSpeed', 'game')}
              onChange={(v) => {
                markTouched('typewriterSpeed');
                setGame({ typewriterSpeed: v });
              }}
              suffix="ms"
            />
            <p className="mt-1 text-[11px] text-gray-600">0 = 即时显示</p>
          </div>
          <div>
            <Label>字体大小</Label>
            <Slider
              min={12}
              max={24}
              step={1}
              value={game.fontSize}
              error={getFieldError('fontSize', 'game')}
              onChange={(v) => {
                markTouched('fontSize');
                setGame({ fontSize: v });
              }}
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
              error={getFieldError('autoAdvanceDelay', 'game')}
              onChange={(v) => {
                markTouched('autoAdvanceDelay');
                setGame({ autoAdvanceDelay: v });
              }}
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

      <SectionCard title="音频与显示">
        <div className="space-y-4">
          <Toggle
            checked={game.soundEnabled}
            onChange={(v) => setGame({ soundEnabled: v })}
            label="启用音效"
          />
          <Toggle
            checked={game.fullscreen}
            onChange={(v) => {
              setGame({ fullscreen: v });
              // 即时应用全屏设置
              if (v) {
                document.documentElement.requestFullscreen?.().catch(() => {});
              } else {
                if (document.fullscreenElement) {
                  document.exitFullscreen?.().catch(() => {});
                }
              }
            }}
            label="默认全屏模式"
          />
          <p className="text-[11px] text-gray-600">
            游戏中按 F11 也可快速切换全屏
          </p>
        </div>
      </SectionCard>
    </div>
  );

  const renderTheme = () => (
    <div className="space-y-5">
      <SectionCard title="外观模式">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['auto', 'dark', 'light'] as ThemeMode[]).map((m) => (
            <motion.button
              key={m}
              onClick={() => setTheme({ mode: m })}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`rounded-md border px-3 py-2.5 text-sm transition-colors ${
                theme.mode === m
                  ? 'border-red-700 bg-red-900/20 text-red-300'
                  : 'border-gray-700 bg-gray-800/40 text-gray-400 hover:bg-gray-800/60'
              }`}
            >
              {m === 'auto' ? '🌓 跟随系统' : m === 'dark' ? '🌑 深色' : '☀️ 浅色'}
            </motion.button>
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
            <div key={key} className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3 items-center">
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
          <motion.button
            onClick={() => setTheme({ customVars: {} })}
            whileHover={{ scale: 1.01 }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <RotateCcw size={12} />
            重置自定义变量
          </motion.button>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <div className={`w-full h-full flex flex-col bg-gray-950 text-gray-200 overflow-hidden ${isModal ? 'rounded-xl' : ''}`}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-800/60 px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <motion.button
        onClick={isModal ? onClose : () => navigate(fromGame ? '/play' : '/')}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        {isModal ? <X size={16} /> : <ChevronLeft size={16} />}
        {isModal ? '关闭' : fromGame ? '返回游戏' : '返回'}
      </motion.button>
          <h1 className="text-base font-bold text-red-400 tracking-wide">设置</h1>
          {!loaded && <span className="text-[11px] text-gray-600">加载中...</span>}
        </div>
        <div className="flex items-center gap-3">
          {saveMsg && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-1 text-xs ${
                saveMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {saveMsg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
              {saveMsg.text}
            </motion.span>
          )}
          <motion.button
            onClick={handleSave}
            disabled={saving}
            whileHover={{ scale: saving ? 1 : 1.03 }}
            whileTap={{ scale: saving ? 1 : 0.97 }}
            className="flex items-center gap-1.5 rounded-md bg-red-800/60 hover:bg-red-700/60 disabled:opacity-50 px-4 py-1.5 text-sm transition-colors"
          >
            <Save size={14} />
            {saving ? '保存中...' : '保存'}
          </motion.button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden flex-col sm:flex-row">
        {/* Sidebar */}
        <nav className="w-full sm:w-48 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-800/60 p-3 space-y-1 overflow-x-auto sm:overflow-visible flex sm:flex-col gap-1 sm:gap-0">
          {TABS.map((t) => {
            const hasErrors =
              t.key === 'llm'
                ? llmValidation.errors.length > 0
                : t.key === 'image'
                ? imageValidation.errors.length > 0
                : t.key === 'game'
                ? gameValidation.errors.length > 0
                : false;
            return (
              <motion.button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={`w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap ${
                  activeTab === t.key
                    ? 'bg-red-900/20 text-red-300 border border-red-800/30'
                    : 'text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
                }`}
              >
                {t.icon}
                {t.label}
                {hasErrors && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-red-500 shrink-0" />
                )}
              </motion.button>
            );
          })}
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
