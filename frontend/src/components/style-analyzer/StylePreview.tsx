import React from 'react';
import {
  Palette, Tag, Lightbulb, Type, Wand2, Image as ImageIcon,
  Clock, Star, Film
} from 'lucide-react';
import type { StyleJson } from '../../stores/styleStore';

/**
 * StylePreview 风格预览面板
 * 展示：调色板、氛围标签、推荐效果图、字体预览、特效标签
 */
export interface StylePreviewProps {
  style: StyleJson;
  onApply?: () => void;
  onEdit?: () => void;
}

export const StylePreview: React.FC<StylePreviewProps> = ({ style, onApply, onEdit }) => {
  const palette = style.palette || {};
  const effects = style.effects || [];
  const moodKeywords = style.mood_keywords || [];
  const imageStrategy = style.image_strategy || {};

  // 根据风格生成推荐关键词
  const recommendKeywords = [
    style.atmosphere,
    style.era,
    style.art_style,
    style.lighting,
    ...moodKeywords.slice(0, 3),
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      {/* 顶部概览卡片 */}
      <div className="rounded-lg border border-gray-800/50 overflow-hidden">
        <div
          className="p-4"
          style={{
            background: `linear-gradient(135deg, ${palette.bg || '#0a0a0a'} 0%, ${palette.accent || '#8b0000'}22 100%)`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full border-2 flex items-center justify-center"
              style={{ borderColor: palette.accent || '#8b0000', background: palette.bg || '#0a0a0a' }}
            >
              <Palette className="w-5 h-5" style={{ color: palette.accent || '#8b0000' }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: palette.text || '#e2e8f0' }}>
                {style.name || 'AI 分析风格'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {style.description || `基于 ${style.atmosphere || '未知'} 氛围自动生成`}
              </p>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 bg-gray-900/40 border-t border-gray-800/30 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {style.updatedAt ? new Date(style.updatedAt).toLocaleDateString() : '刚刚'}
            </span>
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              {effects.length} 特效
            </span>
          </div>
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1 rounded text-xs bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                编辑
              </button>
            )}
            {onApply && (
              <button
                onClick={onApply}
                className="px-3 py-1 rounded text-xs bg-red-900/30 border border-red-800/40 text-red-300 hover:bg-red-800/40 transition-colors"
              >
                应用
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 调色板展示 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="w-4 h-4 text-gray-500" />
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">调色板</h4>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { key: 'bg', label: '背景', value: palette.bg || '#0a0a0a' },
            { key: 'accent', label: '强调', value: palette.accent || '#8b0000' },
            { key: 'text', label: '文字', value: palette.text || '#e2e8f0' },
            { key: 'dialogue_bg', label: '对话框', value: palette.dialogue_bg || 'rgba(10,10,10,0.9)' },
          ].map((color) => (
            <div key={color.key} className="text-center">
              <div
                className="w-full aspect-square rounded-lg border border-gray-700/50 mb-1.5 relative overflow-hidden group"
                style={{ background: color.value }}
              >
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                  <span className="text-[10px] text-gray-300 font-mono">{color.value}</span>
                </div>
              </div>
              <div className="text-[10px] text-gray-500">{color.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 氛围标签 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-gray-500" />
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">氛围标签</h4>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {style.atmosphere && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-950/40 border border-red-800/30 text-red-300">
                {style.atmosphere}
              </span>
            )}
            {style.era && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-950/40 border border-amber-800/30 text-amber-300">
                {style.era}
              </span>
            )}
            {style.art_style && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-950/40 border border-blue-800/30 text-blue-300">
                {style.art_style}
              </span>
            )}
            {style.lighting && (
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-950/40 border border-yellow-800/30 text-yellow-300">
                <Lightbulb className="w-3 h-3 inline mr-1" />
                {style.lighting}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {moodKeywords.map((kw) => (
              <span key={kw} className="px-2 py-0.5 rounded text-[10px] bg-gray-800/60 text-gray-400 border border-gray-700/40">
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 字体与特效预览 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Type className="w-4 h-4 text-gray-500" />
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">字体与特效</h4>
        </div>
        <div className="p-3 rounded-md border border-gray-800/40 bg-gray-950/50">
          <p
            className="text-sm leading-relaxed"
            style={{
              fontFamily: style.font_family === 'serif' ? 'Georgia, serif'
                : style.font_family === 'sans-serif' ? 'system-ui, sans-serif'
                : style.font_family === 'monospace' ? '"Courier New", monospace'
                : style.font_family === 'pixel' ? '"Courier New", monospace'
                : style.font_family || 'system-ui',
              color: palette.text || '#e2e8f0',
            }}
          >
            这是预览文本。The quick brown fox jumps over the lazy dog.
            落霞与孤鹜齐飞，秋水共长天一色。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {effects.map((effect) => (
            <span key={effect} className="px-2 py-0.5 rounded text-[10px] bg-purple-950/30 text-purple-300 border border-purple-800/30 flex items-center gap-1">
              <Wand2 className="w-3 h-3" />
              {effect}
            </span>
          ))}
          {effects.length === 0 && (
            <span className="text-[10px] text-gray-600">无特效</span>
          )}
        </div>
      </div>

      {/* 推荐图片关键词 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="w-4 h-4 text-gray-500" />
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">推荐图片关键词</h4>
        </div>
        <div className="p-3 rounded-md bg-gray-950/50 border border-gray-800/40">
          <p className="text-xs text-gray-400 font-mono break-all">{recommendKeywords}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5" />
            <span>背景: {imageStrategy.background || 'search'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5" />
            <span>角色: {imageStrategy.sprites || 'search'}</span>
          </div>
        </div>
      </div>

      {/* 动态 CSS 变量预览 */}
      <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wand2 className="w-4 h-4 text-gray-500" />
          <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider">CSS 变量映射</h4>
        </div>
        <div className="space-y-1.5 font-mono text-[10px] text-gray-500">
          <div className="flex justify-between">
            <span>--agm-bg</span>
            <span className="text-gray-400">{palette.bg || '#0a0a0a'}</span>
          </div>
          <div className="flex justify-between">
            <span>--agm-accent</span>
            <span className="text-gray-400">{palette.accent || '#8b0000'}</span>
          </div>
          <div className="flex justify-between">
            <span>--agm-text</span>
            <span className="text-gray-400">{palette.text || '#e2e8f0'}</span>
          </div>
          <div className="flex justify-between">
            <span>--agm-font-family</span>
            <span className="text-gray-400">{style.font_family || 'system-ui'}</span>
          </div>
          <div className="flex justify-between">
            <span>--agm-lighting</span>
            <span className="text-gray-400">{style.lighting || 'none'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StylePreview;
