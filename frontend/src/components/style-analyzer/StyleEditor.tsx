import React, { useState, useEffect } from 'react';
import {
  Save, Palette, Type, Lightbulb, Sparkles, Image, Tag, Wand2,
  RotateCcw, ChevronDown, ChevronUp, Check, X
} from 'lucide-react';
import { useStyleStore, type StyleJson } from '../../stores/styleStore';
import { electronAPI } from '../../api/electron';

/**
 * StyleEditor 风格参数手动微调编辑器
 * 支持：调色板、氛围、时代、艺术风格、光照、字体、特效
 */
export interface StyleEditorProps {
  style: StyleJson;
  onChange: (style: StyleJson) => void;
  onSave: () => void;
  isSaving?: boolean;
}

const ATMOSPHERE_OPTIONS = [
  'horror', 'mystery', 'adventure', 'slice_of_life', 'fantasy', 'sci-fi',
  'dark_fantasy', 'cosmic_horror', 'noir', 'steampunk', 'post_apocalyptic', 'romance',
];

const ERA_OPTIONS = [
  'victorian', 'modern', 'fantasy', 'sci-fi', 'ancient', 'medieval',
  '1920s', 'cyberpunk', 'post_apocalyptic', 'western', 'feudal_japan',
];

const ART_STYLE_OPTIONS = [
  'dark_realistic', 'anime', 'pixel', 'watercolor', 'minimalist',
  'oil_painting', 'sketch', 'vaporwave', 'retro', '3d_render',
];

const LIGHTING_OPTIONS = [
  'oil_lamp', 'neon', 'daylight', 'moonlight', 'torch', 'none',
  'flickering', 'strobe', 'warm_glow', 'cold_blue', 'purple_haze',
];

const FONT_OPTIONS = [
  { value: 'serif', label: '衬线体 (Serif)', sample: '落霞与孤鹜齐飞' },
  { value: 'sans-serif', label: '无衬线 (Sans-serif)', sample: '落霞与孤鹜齐飞' },
  { value: 'monospace', label: '等宽 (Monospace)', sample: '落霞与孤鹜齐飞' },
  { value: 'pixel', label: '像素 (Pixel)', sample: '落霞与孤鹜齐飞' },
];

const EFFECT_OPTIONS = [
  'grain', 'vignette', 'chromatic_aberration', 'scanlines', 'bloom',
  'film_grain', 'dust', 'rain', 'snow', 'fog', 'light_leak', 'sepia',
];

export const StyleEditor: React.FC<StyleEditorProps> = ({
  style,
  onChange,
  onSave,
  isSaving = false,
}) => {
  const [localStyle, setLocalStyle] = useState<StyleJson>(style);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['palette', 'atmosphere']));
  const [imageKeyword, setImageKeyword] = useState('');
  const [imageResults, setImageResults] = useState<{ url: string; thumb: string }[]>([]);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    setLocalStyle(style);
  }, [style]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const updatePalette = (key: keyof StyleJson['palette'], value: string) => {
    const updated = {
      ...localStyle,
      palette: { ...localStyle.palette, [key]: value },
    };
    setLocalStyle(updated);
    onChange(updated);
  };

  const updateField = (key: keyof StyleJson, value: any) => {
    const updated = { ...localStyle, [key]: value };
    setLocalStyle(updated);
    onChange(updated);
  };

  const toggleEffect = (effect: string) => {
    const current = localStyle.effects || [];
    const next = current.includes(effect)
      ? current.filter((e) => e !== effect)
      : [...current, effect];
    updateField('effects', next);
  };

  const searchImages = async () => {
    if (!imageKeyword.trim()) return;
    setImageLoading(true);
    try {
      const results = await electronAPI.imageSearch(imageKeyword);
      const mapped = (results?.results || results || []).map((r: any) => ({
        url: r.urls?.regular || r.url || r,
        thumb: r.urls?.thumb || r.thumb || r.urls?.small || r.url || r,
      }));
      setImageResults(mapped.slice(0, 8));
    } catch (err) {
      console.error('Image search failed:', err);
    } finally {
      setImageLoading(false);
    }
  };

  const Section = ({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) => (
    <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 overflow-hidden">
      <button
        onClick={() => toggleExpand(id)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Icon className="w-4 h-4 text-gray-500" />
          {title}
        </div>
        {expanded.has(id) ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>
      {expanded.has(id) && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 名称与描述 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider">风格名称</label>
          <input
            type="text"
            value={localStyle.name || ''}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
              focus:outline-none focus:border-red-700/60 transition-colors"
            placeholder="未命名风格"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider">描述</label>
          <textarea
            value={localStyle.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
            className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
              focus:outline-none focus:border-red-700/60 transition-colors resize-none"
            placeholder="简短描述这个风格的视觉特征..."
          />
        </div>
      </div>

      {/* 调色板 */}
      <Section id="palette" title="调色板" icon={Palette}>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: 'bg' as const, label: '背景色', default: '#0a0a0a' },
            { key: 'accent' as const, label: '强调色', default: '#8b0000' },
            { key: 'text' as const, label: '文字色', default: '#e2e8f0' },
            { key: 'dialogue_bg' as const, label: '对话框背景', default: 'rgba(10,10,10,0.9)' },
          ].map((item) => (
            <div key={item.key}>
              <label className="text-xs text-gray-500">{item.label}</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={localStyle.palette?.[item.key]?.startsWith('#') ? localStyle.palette[item.key] : item.default}
                  onChange={(e) => updatePalette(item.key, e.target.value)}
                  className="w-8 h-8 rounded border border-gray-700 bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={localStyle.palette?.[item.key] || item.default}
                  onChange={(e) => updatePalette(item.key, e.target.value)}
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-200
                    focus:outline-none focus:border-red-700/60 font-mono"
                />
              </div>
            </div>
          ))}
        </div>
        {/* 实时预览色块 */}
        <div className="flex gap-2 mt-2">
          <div
            className="flex-1 h-12 rounded-md border border-gray-700/50 flex items-center justify-center text-xs"
            style={{ background: localStyle.palette?.bg || '#0a0a0a', color: localStyle.palette?.text || '#e2e8f0' }}
          >
            背景 + 文字
          </div>
          <div
            className="flex-1 h-12 rounded-md border border-gray-700/50 flex items-center justify-center text-xs"
            style={{ background: localStyle.palette?.accent || '#8b0000', color: '#fff' }}
          >
            强调色
          </div>
          <div
            className="flex-1 h-12 rounded-md border border-gray-700/50 flex items-center justify-center text-xs"
            style={{ background: localStyle.palette?.dialogue_bg || 'rgba(10,10,10,0.9)', color: localStyle.palette?.text || '#e2e8f0' }}
          >
            对话框
          </div>
        </div>
      </Section>

      {/* 氛围与标签 */}
      <Section id="atmosphere" title="氛围与标签" icon={Tag}>
        <div>
          <label className="text-xs text-gray-500">氛围</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {ATMOSPHERE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => updateField('atmosphere', opt)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  localStyle.atmosphere === opt
                    ? 'bg-red-900/30 border-red-700/50 text-red-300'
                    : 'bg-gray-950 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">情绪关键词</label>
          <input
            type="text"
            value={(localStyle.mood_keywords || []).join(', ')}
            onChange={(e) => updateField('mood_keywords', e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean))}
            className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
              focus:outline-none focus:border-red-700/60 transition-colors"
            placeholder="悬疑, 紧张, 未知..."
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(localStyle.mood_keywords || []).map((kw) => (
              <span key={kw} className="px-2 py-0.5 rounded text-[10px] bg-gray-800/60 text-gray-300 border border-gray-700/40">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </Section>

      {/* 时代与艺术风格 */}
      <Section id="era" title="时代与艺术风格" icon={Sparkles}>
        <div>
          <label className="text-xs text-gray-500">时代</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {ERA_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => updateField('era', opt)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  localStyle.era === opt
                    ? 'bg-red-900/30 border-red-700/50 text-red-300'
                    : 'bg-gray-950 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">艺术风格</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {ART_STYLE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => updateField('art_style', opt)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  localStyle.art_style === opt
                    ? 'bg-red-900/30 border-red-700/50 text-red-300'
                    : 'bg-gray-950 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* 光照与字体 */}
      <Section id="lighting" title="光照与字体" icon={Lightbulb}>
        <div>
          <label className="text-xs text-gray-500">光照效果</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {LIGHTING_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => updateField('lighting', opt)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                  localStyle.lighting === opt
                    ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                    : 'bg-gray-950 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">字体</label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.value}
                onClick={() => updateField('font_family', font.value)}
                className={`p-3 rounded-md border text-left transition-all ${
                  localStyle.font_family === font.value
                    ? 'bg-red-900/20 border-red-700/50'
                    : 'bg-gray-950 border-gray-700/50 hover:border-gray-600'
                }`}
              >
                <div className="text-xs font-medium text-gray-300">{font.label}</div>
                <div className="text-sm mt-1" style={{ fontFamily: font.sample }}>
                  <span className={localStyle.font_family === font.value ? 'text-red-300' : 'text-gray-500'}>
                    {font.sample}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* 视觉特效 */}
      <Section id="effects" title="视觉特效" icon={Wand2}>
        <div className="flex flex-wrap gap-2">
          {EFFECT_OPTIONS.map((effect) => {
            const active = (localStyle.effects || []).includes(effect);
            return (
              <button
                key={effect}
                onClick={() => toggleEffect(effect)}
                className={`px-2.5 py-1 rounded-md text-xs border transition-all flex items-center gap-1.5 ${
                  active
                    ? 'bg-purple-900/30 border-purple-700/50 text-purple-300'
                    : 'bg-gray-950 border-gray-700/50 text-gray-400 hover:border-gray-600'
                }`}
              >
                {active && <Check className="w-3 h-3" />}
                {effect}
              </button>
            );
          })}
        </div>
        <div className="mt-3 p-3 rounded-md bg-gray-950/50 border border-gray-800/40">
          <p className="text-xs text-gray-500">已启用特效：</p>
          <p className="text-xs text-gray-300 mt-1">
            {(localStyle.effects || []).length > 0 ? (localStyle.effects || []).join(', ') : '无'}
          </p>
        </div>
      </Section>

      {/* 图片策略 */}
      <Section id="images" title="图片策略与推荐" icon={Image}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500">背景图策略</label>
            <select
              value={localStyle.image_strategy?.background || 'search'}
              onChange={(e) => updateField('image_strategy', { ...localStyle.image_strategy, background: e.target.value as any })}
              className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
                focus:outline-none focus:border-red-700/60"
            >
              <option value="search">搜索 (Unsplash/Pexels)</option>
              <option value="generate">AI 生成</option>
              <option value="upload">手动上传</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">角色图策略</label>
            <select
              value={localStyle.image_strategy?.sprites || 'search'}
              onChange={(e) => updateField('image_strategy', { ...localStyle.image_strategy, sprites: e.target.value as any })}
              className="w-full mt-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
                focus:outline-none focus:border-red-700/60"
            >
              <option value="search">搜索 (Unsplash/Pexels)</option>
              <option value="generate">AI 生成</option>
              <option value="upload">手动上传</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-gray-500">关键词搜索推荐图片</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={imageKeyword}
              onChange={(e) => setImageKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchImages()}
              className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200
                focus:outline-none focus:border-red-700/60"
              placeholder={`尝试 "${localStyle.mood_keywords?.[0] || 'dark'} ${localStyle.atmosphere || 'mystery'}"`}
            />
            <button
              onClick={searchImages}
              disabled={imageLoading}
              className="px-4 py-2 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300
                hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {imageLoading ? '搜索中...' : '搜索'}
            </button>
          </div>
          {imageResults.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {imageResults.map((img, i) => (
                <div key={i} className="aspect-square rounded-md border border-gray-700/50 overflow-hidden bg-gray-950">
                  <img src={img.thumb} alt="result" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* 保存按钮 */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            bg-red-900/30 border border-red-800/40 text-sm text-red-300
            hover:bg-red-800/40 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSaving ? '保存中...' : '保存风格到后端'}
        </button>
        <button
          onClick={() => {
            setLocalStyle(style);
            onChange(style);
          }}
          className="px-4 py-2.5 rounded-lg bg-gray-800/50 border border-gray-700/40 text-sm text-gray-300
            hover:bg-gray-700/50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default StyleEditor;
