import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Trash2, RotateCcw, X, Clock, MapPin, AlertCircle } from 'lucide-react';
import { useSaveStore, TOTAL_SLOTS, QUICK_SAVE_SLOT } from '../../stores/saveStore';
import type { Campaign, Module } from '../../types/module';

interface SaveLoadPanelProps {
  mode: 'save' | 'load';
  isOpen: boolean;
  onClose: () => void;
  campaign: Campaign | null;
  module: Module | null;
  currentSceneId: string | null;
  onLoadSave?: (saveId: string) => void;
  onSaveComplete?: () => void;
  onSnapshotRequest?: () => Promise<{ snapshot: any; thumbnail: string } | null>;
}

/**
 * SaveLoadPanel
 * Displays 10 save slots (0 = auto-save, 1-9 = manual).
 * Shows save name, timestamp, and scene thumbnail.
 */
export const SaveLoadPanel: React.FC<SaveLoadPanelProps> = ({
  mode,
  isOpen,
  onClose,
  campaign,
  module,
  currentSceneId,
  onLoadSave,
  onSaveComplete,
  onSnapshotRequest,
}) => {
  const { saves, isLoading, error, loadSaves, createSave, deleteSave, clearError } = useSaveStore();
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [saveName, setSaveName] = useState('');
  const [justSaved, setJustSaved] = useState<number | null>(null);

  // Load saves when panel opens
  useEffect(() => {
    if (isOpen && module) {
      loadSaves(module.id);
    }
  }, [isOpen, module, loadSaves]);

  // Clear notification after 2s
  useEffect(() => {
    if (justSaved !== null) {
      const t = setTimeout(() => setJustSaved(null), 2000);
      return () => clearTimeout(t);
    }
  }, [justSaved]);

  const handleSave = useCallback(
    async (slotNumber: number) => {
      if (!campaign || !module) return;
      clearError();

      // 获取 VN 快照和缩略图（优先从引擎截图）
      let thumbnail: string | undefined = undefined;
      let vnSnapshot: any | undefined = undefined;

      if (onSnapshotRequest) {
        try {
          const result = await onSnapshotRequest();
          if (result) {
            thumbnail = result.thumbnail;
            vnSnapshot = result.snapshot;
          }
        } catch (err) {
          console.warn('[SaveLoadPanel] Snapshot request failed:', err);
        }
      }

      // 降级：使用场景背景图
      if (!thumbnail) {
        const scene = module.scenes[currentSceneId || campaign.current_scene];
        thumbnail = scene?.bg || undefined;
      }

      try {
        await createSave({
          slotNumber,
          name: slotNumber === QUICK_SAVE_SLOT ? undefined : saveName || undefined,
          campaign,
          module,
          thumbnail,
          vnSnapshot,
        });
        setSaveName('');
        setJustSaved(slotNumber);
        onSaveComplete?.();
      } catch {
        // Error is already in store
      }
    },
    [campaign, module, currentSceneId, saveName, createSave, clearError, onSaveComplete, onSnapshotRequest]
  );

  const handleLoad = useCallback(
    (slotNumber: number) => {
      const slot = saves[slotNumber];
      if (!slot?.save?.id) return;
      onLoadSave?.(slot.save.id);
    },
    [saves, onLoadSave]
  );

  const handleDelete = useCallback(
    async (slotNumber: number) => {
      const slot = saves[slotNumber];
      if (!slot?.save?.id || !module) return;
      clearError();
      try {
        await deleteSave(slot.save.id, module.id);
        setConfirmDelete(null);
      } catch {
        // Error is in store
      }
    },
    [saves, module, deleteSave, clearError]
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '未知时间';
    }
  };

  const getSceneTitle = (saveSlot: typeof saves[number]) => {
    const sceneId = saveSlot.save?.campaign?.current_scene;
    if (!sceneId) return '未知场景';
    const mod = saveSlot.save?.module || module;
    return mod?.scenes?.[sceneId]?.title || sceneId;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

          {/* Panel */}
          <motion.div
            className="relative z-10 w-full max-w-4xl max-h-[85vh] mx-4 bg-gray-950 border border-red-900/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-red-900/20">
              <div className="flex items-center gap-3">
                {mode === 'save' ? (
                  <Save className="w-5 h-5 text-red-500" />
                ) : (
                  <RotateCcw className="w-5 h-5 text-red-500" />
                )}
                <h2 className="text-lg font-bold text-gray-100">
                  {mode === 'save' ? '保存游戏' : '读取存档'}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-red-950/30 text-gray-400 hover:text-red-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Save name input (only in save mode, for non-auto slots) */}
            {mode === 'save' && (
              <div className="px-6 py-3 border-b border-red-900/10">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="输入存档名称（可选）..."
                  className="w-full px-4 py-2 bg-gray-900/60 border border-red-900/20 rounded-lg text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:border-red-700/50 transition-colors"
                  maxLength={50}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="px-6 py-2 flex items-center gap-2 text-red-400 text-sm bg-red-950/20">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            {/* Slots Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {isLoading && saves.every((s) => !s.save) ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <div className="w-6 h-6 border-2 border-red-800 border-t-transparent rounded-full animate-spin mr-3" />
                  加载存档列表...
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {saves.map((slot) => {
                    const isAuto = slot.slotNumber === QUICK_SAVE_SLOT;
                    const hasSave = !!slot.save;
                    const isConfirming = confirmDelete === slot.slotNumber;

                    return (
                      <motion.div
                        key={slot.slotNumber}
                        className={`relative group rounded-xl border overflow-hidden transition-all ${
                          isAuto
                            ? 'border-amber-900/30 bg-amber-950/10'
                            : hasSave
                            ? 'border-red-900/30 bg-gray-900/60 hover:border-red-700/50'
                            : 'border-gray-800/40 bg-gray-900/30 hover:border-gray-700/50'
                        } ${
                          mode === 'load' && !hasSave
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer'
                        }`}
                        whileHover={mode === 'load' && !hasSave ? {} : { scale: 1.03 }}
                        whileTap={mode === 'load' && !hasSave ? {} : { scale: 0.98 }}
                        onClick={() => {
                          if (mode === 'save') {
                            handleSave(slot.slotNumber);
                          } else if (hasSave) {
                            handleLoad(slot.slotNumber);
                          }
                        }}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-video relative overflow-hidden bg-gray-950">
                          {slot.save?.thumbnail ? (
                            <img
                              src={slot.save.thumbnail}
                              alt=""
                              className="w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {isAuto ? (
                                <Clock className="w-6 h-6 text-amber-700/50" />
                              ) : (
                                <Save className="w-6 h-6 text-gray-700/50" />
                              )}
                            </div>
                          )}

                          {/* Slot number badge */}
                          <div
                            className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isAuto
                                ? 'bg-amber-900/60 text-amber-300'
                                : 'bg-gray-900/60 text-gray-400'
                            }`}
                          >
                            {isAuto ? '自动' : `槽位 ${slot.slotNumber}`}
                          </div>

                          {/* Delete button (only for existing manual saves) */}
                          {hasSave && !isAuto && mode === 'save' && (
                            <button
                              className="absolute top-2 right-2 p-1 rounded bg-red-950/60 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-900/80"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDelete(slot.slotNumber);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}

                          {/* Just saved indicator */}
                          {justSaved === slot.slotNumber && (
                            <motion.div
                              className="absolute inset-0 flex items-center justify-center bg-green-950/60"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
                              <span className="text-green-400 text-sm font-bold">已保存</span>
                            </motion.div>
                          )}

                          {/* Confirm delete overlay */}
                          {isConfirming && (
                            <div
                              className="absolute inset-0 bg-red-950/80 flex flex-col items-center justify-center gap-2 z-10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-red-300 text-xs">确认删除?</span>
                              <div className="flex gap-2">
                                <button
                                  className="px-3 py-1 rounded bg-red-700 text-white text-xs hover:bg-red-600"
                                  onClick={() => handleDelete(slot.slotNumber)}
                                >
                                  删除
                                </button>
                                <button
                                  className="px-3 py-1 rounded bg-gray-700 text-gray-300 text-xs hover:bg-gray-600"
                                  onClick={() => setConfirmDelete(null)}
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3">
                          <div className="text-xs font-medium text-gray-200 truncate mb-1">
                            {hasSave
                              ? slot.save!.name || '未命名存档'
                              : isAuto
                              ? '自动存档槽'
                              : '空槽位'}
                          </div>
                          {hasSave && (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <MapPin className="w-3 h-3" />
                                <span className="truncate">{getSceneTitle(slot)}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-gray-600">
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(slot.save!.timestamp)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-6 py-3 border-t border-red-900/10 text-[10px] text-gray-600 text-center">
              {mode === 'save'
                ? '点击任意槽位保存当前进度 · 槽位 0 为自动存档'
                : '点击有存档的槽位读取游戏 · 自动存档（槽位 0）在场景切换时自动保存'}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SaveLoadPanel;
