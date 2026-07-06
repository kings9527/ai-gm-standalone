import React, { useState } from 'react';
import {
  Save, Download, Play, ChevronDown, ChevronRight,
  Plus, Trash2, Edit3, Check, X, MapPin, Users, Package,
  Sparkles, AlertTriangle, Image as ImageIcon
} from 'lucide-react';
import type { Module, Scene, NPC, Item, Event, StyleConfig } from '../../types/module';
import { electronAPI } from '../../api/electron';

interface ModulePreviewProps {
  module: Module;
  onUpdate: (module: Module) => void;
  onSave: () => void;
  onPlay: () => void;
  onExport: () => void;
  generating?: boolean;
  generateProgress?: string;
}

type TabType = 'overview' | 'scenes' | 'npcs' | 'items' | 'events' | 'style';

/**
 * 模组预览与编辑界面
 * 支持：JSON 树形浏览、字段编辑、场景连接可视化
 */
export const ModulePreview: React.FC<ModulePreviewProps> = ({
  module,
  onUpdate,
  onSave,
  onPlay,
  onExport,
  generating = false,
  generateProgress = '',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (fieldPath: string, currentValue: string) => {
    setEditingField(fieldPath);
    setEditValue(currentValue);
  };

  const commitEdit = () => {
    if (!editingField) return;
    // 简单的路径解析: scenes.scene_1.title
    const parts = editingField.split('.');
    const updated = JSON.parse(JSON.stringify(module));
    let target: any = updated;
    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = editValue;
    onUpdate(updated);
    setEditingField(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'overview', label: '概览', icon: <Sparkles className="w-4 h-4" />, count: undefined },
    { key: 'scenes', label: '场景', icon: <MapPin className="w-4 h-4" />, count: Object.keys(module.scenes || {}).length },
    { key: 'npcs', label: '角色', icon: <Users className="w-4 h-4" />, count: Object.keys(module.npcs || {}).length },
    { key: 'items', label: '物品', icon: <Package className="w-4 h-4" />, count: Object.keys(module.items || {}).length },
    { key: 'events', label: '事件', icon: <AlertTriangle className="w-4 h-4" />, count: Object.keys(module.events || {}).length },
    { key: 'style', label: '风格', icon: <ImageIcon className="w-4 h-4" />, count: undefined },
  ];

  // 编辑字段渲染器
  const EditableField = ({ path, value, multiline = false }: { path: string; value: string; multiline?: boolean }) => {
    const isEditing = editingField === path;
    if (isEditing) {
      return (
        <div className="flex gap-1 items-start">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 bg-gray-950 border border-red-800/50 rounded px-2 py-1 text-xs text-gray-200
                focus:outline-none focus:border-red-600 resize-none"
              rows={3}
              autoFocus
            />
          ) : (
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="flex-1 bg-gray-950 border border-red-800/50 rounded px-2 py-1 text-xs text-gray-200
                focus:outline-none focus:border-red-600"
              autoFocus
            />
          )}
          <button onClick={commitEdit} className="text-green-500 hover:text-green-400 p-0.5"><Check className="w-3.5 h-3.5" /></button>
          <button onClick={cancelEdit} className="text-red-500 hover:text-red-400 p-0.5"><X className="w-3.5 h-3.5" /></button>
        </div>
      );
    }
    return (
      <div
        onClick={() => startEdit(path, String(value || ''))}
        className="cursor-pointer group flex items-center gap-1"
      >
        <span className={`text-xs ${multiline ? 'text-gray-300 leading-relaxed' : 'text-gray-200'} group-hover:text-red-300 transition-colors`}>
          {value || <span className="text-gray-600 italic">empty</span>}
        </span>
        <Edit3 className="w-3 h-3 text-gray-700 group-hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-all" />
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-950">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-200">模组预览</h2>
          {generating && (
            <span className="text-xs text-amber-500 animate-pulse flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {generateProgress}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
              bg-red-900/30 border border-red-800/30 text-red-300
              hover:bg-red-800/40 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            保存
          </button>
          <button
            onClick={onPlay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
              bg-green-900/30 border border-green-800/30 text-green-300
              hover:bg-green-800/40 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            试玩
          </button>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs
              bg-gray-800/50 border border-gray-700/30 text-gray-300
              hover:bg-gray-700/50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex border-b border-gray-800/50 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors
              ${activeTab === tab.key
                ? 'border-red-700 text-red-300'
                : 'border-transparent text-gray-500 hover:text-gray-300'
              }
            `}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">基本信息</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">模组名称</label>
                  <EditableField path="name" value={module.name} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">ID</label>
                  <div className="text-xs text-gray-500 font-mono">{module.id}</div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">规则系统</label>
                  <EditableField path="system" value={module.system} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">版本</label>
                  <EditableField path="version" value={module.version} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 uppercase">起始场景</label>
                  <EditableField path="start_scene" value={module.start_scene} />
                </div>
              </div>
            </div>

            {/* 统计 */}
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">内容统计</h3>
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="场景" value={Object.keys(module.scenes || {}).length} />
                <StatCard label="角色" value={Object.keys(module.npcs || {}).length} />
                <StatCard label="物品" value={Object.keys(module.items || {}).length} />
                <StatCard label="事件" value={Object.keys(module.events || {}).length} />
              </div>
            </div>

            {/* 场景连接图 */}
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">场景连接</h3>
              <SceneGraph scenes={module.scenes || {}} startScene={module.start_scene} />
            </div>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="space-y-2">
            {Object.entries(module.scenes || {}).map(([id, scene]) => (
              <CollapsibleCard
                key={id}
                id={id}
                title={scene.title}
                expanded={expandedItems.has(id)}
                onToggle={() => toggleExpand(id)}
              >
                <div className="space-y-2">
                  <FieldRow label="描述" />
                  <EditableField path={`scenes.${id}.description`} value={scene.description} multiline />
                  <FieldRow label="背景" />
                  <EditableField path={`scenes.${id}.bg`} value={scene.bg} />
                  <FieldRow label="对话" />
                  <div className="pl-2 border-l-2 border-gray-800">
                    <div className="text-[10px] text-gray-500">发言者</div>
                    <EditableField path={`scenes.${id}.dialogue.speaker`} value={scene.dialogue?.speaker || ''} />
                    <div className="text-[10px] text-gray-500 mt-1">文本</div>
                    <EditableField path={`scenes.${id}.dialogue.text`} value={scene.dialogue?.text || ''} multiline />
                  </div>
                  {scene.choices && scene.choices.length > 0 && (
                    <>
                      <FieldRow label={`选项 (${scene.choices.length})`} />
                      {scene.choices.map((choice, i) => (
                        <div key={i} className="pl-2 border-l-2 border-gray-800 py-1">
                          <EditableField path={`scenes.${id}.choices.${i}.text`} value={choice.text} />
                          <span className="text-[10px] text-gray-600 ml-2">→ {choice.target || 'next'}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {scene.exits && scene.exits.length > 0 && (
                    <>
                      <FieldRow label="出口" />
                      {scene.exits.map((exit, i) => (
                        <div key={i} className="text-xs text-gray-500 pl-2">
                          {exit.label} → {exit.target}
                        </div>
                      ))}
                    </>
                  )}
                  {scene.npcs && scene.npcs.length > 0 && (
                    <>
                      <FieldRow label="在场 NPC" />
                      <div className="text-xs text-gray-500 pl-2">{scene.npcs.join(', ')}</div>
                    </>
                  )}
                </div>
              </CollapsibleCard>
            ))}
          </div>
        )}

        {activeTab === 'npcs' && (
          <div className="space-y-2">
            {Object.entries(module.npcs || {}).map(([id, npc]) => (
              <CollapsibleCard
                key={id}
                id={id}
                title={npc.name}
                expanded={expandedItems.has(`npc_${id}`)}
                onToggle={() => toggleExpand(`npc_${id}`)}
              >
                <div className="space-y-2">
                  <FieldRow label="描述" />
                  <EditableField path={`npcs.${id}.description`} value={npc.description} multiline />
                  <FieldRow label="性格" />
                  <EditableField path={`npcs.${id}.personality`} value={npc.personality || ''} />
                  <FieldRow label="立场" />
                  <EditableField path={`npcs.${id}.role`} value={npc.role} />
                  <FieldRow label="态度" />
                  <EditableField path={`npcs.${id}.attitude`} value={npc.attitude} />
                  <FieldRow label="HP / 理智" />
                  <div className="text-xs text-gray-300">{npc.hp} / {npc.sanity || '-'}</div>
                  <FieldRow label="属性" />
                  <div className="text-xs text-gray-400 font-mono">{JSON.stringify(npc.stats)}</div>
                </div>
              </CollapsibleCard>
            ))}
          </div>
        )}

        {activeTab === 'items' && (
          <div className="space-y-2">
            {Object.entries(module.items || {}).map(([id, item]) => (
              <CollapsibleCard
                key={id}
                id={id}
                title={item.name}
                expanded={expandedItems.has(`item_${id}`)}
                onToggle={() => toggleExpand(`item_${id}`)}
              >
                <div className="space-y-2">
                  <FieldRow label="描述" />
                  <EditableField path={`items.${id}.description`} value={item.description} multiline />
                  {item.readable && item.content && (
                    <>
                      <FieldRow label="内容" />
                      <EditableField path={`items.${id}.content`} value={item.content} multiline />
                    </>
                  )}
                  <div className="flex gap-4 text-xs">
                    <span className={item.readable ? 'text-green-500' : 'text-gray-600'}>可读</span>
                    <span className={item.usable ? 'text-green-500' : 'text-gray-600'}>可用</span>
                  </div>
                </div>
              </CollapsibleCard>
            ))}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-2">
            {Object.keys(module.events || {}).length === 0 ? (
              <div className="text-center text-gray-600 py-8 text-sm">暂无事件</div>
            ) : (
              Object.entries(module.events || {}).map(([id, event]) => (
                <CollapsibleCard
                  key={id}
                  id={id}
                  title={event.description.slice(0, 30) + '...'}
                  expanded={expandedItems.has(`event_${id}`)}
                  onToggle={() => toggleExpand(`event_${id}`)}
                >
                  <div className="space-y-2">
                    <FieldRow label="描述" />
                    <EditableField path={`events.${id}.description`} value={event.description} multiline />
                    <FieldRow label="触发条件" />
                    <div className="text-xs text-gray-400 font-mono">{JSON.stringify(event.trigger)}</div>
                    {event.sanity_check && (
                      <div className="text-xs text-amber-500">理智检定: 目标 {event.sanity_check.target}</div>
                    )}
                  </div>
                </CollapsibleCard>
              ))
            )}
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4">
              <h3 className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">配色方案</h3>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(module.style?.palette || {}).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border border-gray-700 shrink-0"
                      style={{ background: String(val) }}
                    />
                    <div className="flex-1">
                      <div className="text-[10px] text-gray-500 uppercase">{key}</div>
                      <EditableField path={`style.palette.${key}`} value={String(val)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-gray-800/50 bg-gray-900/30 p-4 space-y-3">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">风格属性</h3>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">氛围</label>
                <EditableField path="style.atmosphere" value={module.style?.atmosphere || ''} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">时代</label>
                <EditableField path="style.era" value={module.style?.era || ''} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">艺术风格</label>
                <EditableField path="style.art_style" value={module.style?.art_style || ''} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">光照</label>
                <EditableField path="style.lighting" value={module.style?.lighting || ''} />
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">情绪关键词</label>
                <EditableField path="style.mood_keywords" value={(module.style?.mood_keywords || []).join(', ')} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 统计卡片
const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="text-center p-3 rounded-lg bg-gray-950/50 border border-gray-800/30">
    <div className="text-xl font-bold text-gray-200">{value}</div>
    <div className="text-[10px] text-gray-500 uppercase mt-0.5">{label}</div>
  </div>
);

// 字段标签
const FieldRow = ({ label }: { label: string }) => (
  <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-2">{label}</div>
);

// 可折叠卡片
const CollapsibleCard = ({
  id,
  title,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-gray-800/40 bg-gray-900/20 overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-800/30 transition-colors"
    >
      <div className="flex items-center gap-2">
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        )}
        <span className="text-xs font-medium text-gray-300">{title}</span>
        <span className="text-[10px] text-gray-600 font-mono">{id}</span>
      </div>
    </button>
    {expanded && <div className="px-3 pb-3 pt-1 border-t border-gray-800/20">{children}</div>}
  </div>
);

// 场景连接图（简化版）
const SceneGraph = ({ scenes, startScene }: { scenes: Record<string, Scene>; startScene: string }) => {
  const visited = new Set<string>();
  const edges: { from: string; to: string; label: string }[] = [];

  const traverse = (sceneId: string, depth = 0) => {
    if (visited.has(sceneId) || depth > 10) return;
    visited.add(sceneId);
    const scene = scenes[sceneId];
    if (!scene) return;

    scene.choices?.forEach((c) => {
      if (c.target && c.target !== 'next') {
        edges.push({ from: sceneId, to: c.target, label: c.text.slice(0, 15) });
        traverse(c.target, depth + 1);
      }
    });
    scene.exits?.forEach((e) => {
      edges.push({ from: sceneId, to: e.target, label: e.label });
      traverse(e.target, depth + 1);
    });
  };

  traverse(startScene);

  const uniqueScenes = Array.from(new Set([...edges.map((e) => e.from), ...edges.map((e) => e.to)]));

  return (
    <div className="flex flex-wrap gap-2">
      {uniqueScenes.map((sid) => {
        const scene = scenes[sid];
        const isStart = sid === startScene;
        return (
          <div
            key={sid}
            className={`
              px-2.5 py-1.5 rounded-md text-[10px] border
              ${isStart
                ? 'bg-red-950/30 border-red-800/40 text-red-300'
                : 'bg-gray-900/50 border-gray-700/40 text-gray-400'
              }
            `}
          >
            {isStart && <span className="text-red-500 mr-1">★</span>}
            {scene?.title || sid}
          </div>
        );
      })}
      {uniqueScenes.length === 0 && (
        <div className="text-xs text-gray-600">暂无场景连接数据</div>
      )}
    </div>
  );
};

export default ModulePreview;
