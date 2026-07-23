import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  ClipboardPaste,
  Link2,
  FileJson,
  FileArchive,
  Copy,
  Play,
  Trash2,
  Search,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Package,
  Users,
  MapPin,
  ChevronDown,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../ui/ToastProvider';
import { useModuleStore } from '../../stores/moduleStore';
import { ModuleImporter, type ImportResult, type ConflictInfo } from '../../modshare/importer';
import { ModuleExporter } from '../../modshare/exporter';
import { ModuleValidator } from '../../modshare/validator';
import type { Module } from '../../types/module';

/**
 * ModuleManagerPage
 * Full module management UI: list, search, sort, import/export, delete.
 * NEW: Drag & drop file upload support.
 */

const SYSTEM_LABELS: Record<string, string> = {
  coc: '克苏鲁的呼唤',
  dnd5e: 'D&D 5e',
  custom: '自定义',
};

const SYSTEM_COLORS: Record<string, string> = {
  coc: 'bg-purple-900/40 text-purple-300 border-purple-800/40',
  dnd5e: 'bg-amber-900/40 text-amber-300 border-amber-800/40',
  custom: 'bg-gray-800/40 text-gray-300 border-gray-700/40',
};

type SortField = 'name' | 'system' | 'date' | 'scenes';
type SortOrder = 'asc' | 'desc';

const ModuleManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    modules,
    currentModule,
    setCurrentModule,
    addModule,
    removeModule,
    updateModule,
    loadFromStorage,
  } = useModuleStore();

  // Search and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Modals
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [conflictModal, setConflictModal] = useState<{
    conflict: ConflictInfo;
    onResolve: (action: 'overwrite' | 'rename' | 'cancel') => void;
  } | null>(null);
  const [validationModal, setValidationModal] = useState<ImportResult | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Module | null>(null);
  const [exportMenuModule, setExportMenuModule] = useState<string | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from storage on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  /* ── Drag & Drop Handlers ───────────────────────────────────── */

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const jsonFiles = files.filter((f) =>
        f.name.endsWith('.json') || f.type === 'application/json'
      );

      if (jsonFiles.length === 0) {
        showToast('仅支持 .json 格式的模组文件', 'warning');
        return;
      }

      for (const file of jsonFiles) {
        const result = await ModuleImporter.fromFile(file);
        await handleImportResult(result);
      }

      if (jsonFiles.length > 0) {
        showToast(`已处理 ${jsonFiles.length} 个文件`, 'success');
      }
    },
    [showToast]
  );

  /* ── Import Handlers ────────────────────────────────────────── */

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const result = await ModuleImporter.fromFile(file);
    await handleImportResult(result);
  };

  const handleClipboardImport = async () => {
    const result = await ModuleImporter.fromClipboard();
    await handleImportResult(result);
  };

  const handlePasteImport = async () => {
    if (!pasteText.trim()) {
      showToast('请输入模组 JSON 文本', 'error');
      return;
    }
    const result = ModuleImporter.fromText(pasteText);
    await handleImportResult(result);
    setPasteModalOpen(false);
    setPasteText('');
  };

  const handleURLHashImport = () => {
    const hash = window.location.hash;
    if (!hash || hash === '#') {
      showToast('当前 URL 没有 Hash 数据', 'error');
      return;
    }
    const result = ModuleImporter.fromURLHash(hash);
    handleImportResult(result);
  };

  const handleImportResult = async (result: ImportResult) => {
    if (!result.success || !result.module) {
      if (result.validation) {
        setValidationModal(result);
      } else {
        showToast(result.error || '导入失败', 'error');
      }
      return;
    }

    const module = result.module;
    const conflict = ModuleImporter.checkConflict(module, modules);

    if (conflict) {
      setConflictModal({
        conflict,
        onResolve: (action) => {
          setConflictModal(null);
          if (action === 'cancel') {
            showToast('已取消导入', 'info');
            return;
          }
          let finalModule = module;
          if (action === 'rename') {
            finalModule = ModuleImporter.renameModule(module, modules);
          }
          addModule(finalModule);
          showToast(`模组「${finalModule.name}」导入成功`, 'success');
        },
      });
    } else {
      addModule(module);
      showToast(`模组「${module.name}」导入成功`, 'success');
    }
  };

  /* ── Export Handlers ────────────────────────────────────────── */

  const handleExportJSON = (module: Module) => {
    const result = ModuleExporter.exportToJSON(module);
    if (result.success) {
      showToast(`已导出 ${result.filename}`, 'success');
    } else {
      showToast(result.error || '导出失败', 'error');
    }
    setExportMenuModule(null);
  };

  const handleExportZip = async (module: Module) => {
    showToast('正在打包 ZIP...', 'info');
    const result = await ModuleExporter.exportToZip(module);
    if (result.success) {
      showToast(`已导出 ${result.filename}`, 'success');
    } else {
      showToast(result.error || 'ZIP 导出失败', 'error');
    }
    setExportMenuModule(null);
  };

  const handleCopyURL = async (module: Module) => {
    const result = await ModuleExporter.copyShareURL(module);
    if (result.success) {
      showToast('分享链接已复制到剪贴板', 'success');
    } else {
      showToast(result.error || '复制失败', 'error');
    }
    setExportMenuModule(null);
  };

  const handleCopyJSON = async (module: Module) => {
    const result = await ModuleExporter.exportToClipboard(module);
    if (result.success) {
      showToast('JSON 已复制到剪贴板', 'success');
    } else {
      showToast(result.error || '复制失败', 'error');
    }
    setExportMenuModule(null);
  };

  const handlePlay = (module: Module) => {
    setCurrentModule(module);
    navigate('/play');
  };

  const handleDelete = (module: Module) => {
    removeModule(module.id);
    showToast(`模组「${module.name}」已删除`, 'info');
    setDeleteConfirm(null);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setSortMenuOpen(false);
  };

  const sortLabel = {
    name: '名称',
    system: '系统',
    date: '导入时间',
    scenes: '场景数',
  }[sortField];

  // Filtered and sorted modules
  const filteredModules = useMemo(() => {
    let result = [...modules];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          SYSTEM_LABELS[m.system]?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name, 'zh-CN');
          break;
        case 'system':
          cmp = a.system.localeCompare(b.system);
          break;
        case 'date':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'scenes':
          cmp = Object.keys(a.scenes).length - Object.keys(b.scenes).length;
          break;
        default:
          // 未知排序字段
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [modules, searchQuery, sortField, sortOrder]);

  return (
    <div
      className="w-full h-full bg-gray-950 text-gray-100 flex flex-col overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/40 bg-gray-900/30 shrink-0">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-red-400 shrink-0" />
          <h1 className="text-lg font-bold text-red-400">模组管理</h1>
          <span className="text-xs text-gray-500 ml-2 hidden sm:inline">
            {modules.length} 个模组
          </span>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => navigate('/')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="px-3 py-1.5 text-sm rounded-lg bg-gray-800/40 border border-gray-700/40 hover:bg-gray-700/40 transition-colors"
          >
            返回主页
          </motion.button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 flex items-center gap-3 border-b border-gray-800/20 flex-wrap shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模组名称、ID..."
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-800/40 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <motion.button
            onClick={() => setSortMenuOpen((prev) => !prev)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm hover:bg-gray-800/40 transition-colors"
          >
            <ArrowUpDown className="w-4 h-4 text-gray-400" />
            <span className="text-gray-300 hidden sm:inline">{sortLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          </motion.button>
          <AnimatePresence>
            {sortMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-1 right-0 z-20 min-w-[140px] rounded-lg bg-gray-900 border border-gray-700/40 shadow-xl py-1"
              >
                {(['name', 'system', 'date', 'scenes'] as SortField[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleSort(f)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-800/40 transition-colors ${
                      sortField === f ? 'text-red-400' : 'text-gray-300'
                    }`}
                  >
                    {sortField === f ? (
                      <span className="mr-2">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    ) : (
                      <span className="mr-2 text-gray-600">•</span>
                    )}
                    {{ name: '名称', system: '系统', date: '导入时间', scenes: '场景数' }[f]}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Import Buttons */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <motion.button
            onClick={() => fileInputRef.current?.click()}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-900/30 border border-red-800/30 text-sm text-red-300 hover:bg-red-800/30 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">文件导入</span>
          </motion.button>
          <motion.button
            onClick={handleClipboardImport}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-300 hover:bg-gray-800/40 transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            <span className="hidden sm:inline">剪贴板</span>
          </motion.button>
          <motion.button
            onClick={() => setPasteModalOpen(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-300 hover:bg-gray-800/40 transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">粘贴文本</span>
          </motion.button>
          <motion.button
            onClick={handleURLHashImport}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-300 hover:bg-gray-800/40 transition-colors"
          >
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">URL Hash</span>
          </motion.button>
        </div>
      </div>

      {/* Module List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {filteredModules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <Package className="w-12 h-12 opacity-20" />
            <p className="text-sm">
              {searchQuery ? '没有找到匹配的模组' : '暂无模组，请导入一个模组'}
            </p>
            <p className="text-xs text-gray-600">拖拽 .json 文件到此处即可导入</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredModules.map((module) => {
              const sceneCount = Object.keys(module.scenes).length;
              const npcCount = Object.keys(module.npcs || {}).length;
              const itemCount = Object.keys(module.items || {}).length;
              const isActive = currentModule?.id === module.id;

              return (
                <motion.div
                  key={module.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`group relative rounded-xl border transition-all duration-200 ${
                    isActive
                      ? 'bg-red-950/20 border-red-800/40 ring-1 ring-red-800/20'
                      : 'bg-gray-900/40 border-gray-800/40 hover:border-gray-700/40 hover:bg-gray-850/40'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-4 pt-4 pb-2">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-200 truncate" title={module.name}>
                          {module.name}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{module.id}</p>
                      </div>
                      <span
                        className={`ml-2 px-2 py-0.5 rounded-md text-xs font-medium border ${
                          SYSTEM_COLORS[module.system] || SYSTEM_COLORS.custom
                        }`}
                      >
                        {SYSTEM_LABELS[module.system] || module.system}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2">
                      {module.style?.atmosphere || '无描述'}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="px-4 py-2 flex items-center gap-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{sceneCount} 场景</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{npcCount} NPC</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" />
                      <span>{itemCount} 物品</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 pt-1 flex items-center gap-2">
                    <motion.button
                      onClick={() => handlePlay(module)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-red-800/40 text-red-300 border border-red-700/40'
                          : 'bg-gray-800/40 text-gray-300 border border-gray-700/40 hover:bg-gray-700/40'
                      }`}
                    >
                      <Play className="w-4 h-4" />
                      {isActive ? '继续游戏' : '开始游戏'}
                    </motion.button>

                    <div className="relative">
                      <motion.button
                        onClick={() =>
                          setExportMenuModule(exportMenuModule === module.id ? null : module.id)
                        }
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800/40 border border-gray-700/40 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span className="hidden sm:inline">导出</span>
                      </motion.button>
                      <AnimatePresence>
                        {exportMenuModule === module.id && (
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            transition={{ duration: 0.12 }}
                            className="absolute bottom-full right-0 mb-1 z-20 min-w-[160px] rounded-lg bg-gray-900 border border-gray-700/40 shadow-xl py-1"
                          >
                            <button
                              onClick={() => handleExportJSON(module)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/40 flex items-center gap-2"
                            >
                              <FileJson className="w-4 h-4 text-amber-400" />
                              导出 JSON
                            </button>
                            <button
                              onClick={() => handleExportZip(module)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/40 flex items-center gap-2"
                            >
                              <FileArchive className="w-4 h-4 text-blue-400" />
                              导出 ZIP
                            </button>
                            <button
                              onClick={() => handleCopyURL(module)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/40 flex items-center gap-2"
                            >
                              <Link2 className="w-4 h-4 text-green-400" />
                              复制分享链接
                            </button>
                            <button
                              onClick={() => handleCopyJSON(module)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-800/40 flex items-center gap-2"
                            >
                              <Copy className="w-4 h-4 text-gray-400" />
                              复制 JSON
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <motion.button
                      onClick={() => setDeleteConfirm(module)}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      className="px-2.5 py-2 rounded-lg bg-gray-800/40 border border-gray-700/40 text-gray-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-800/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>

                  {/* Version badge */}
                  <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-gray-500">v{module.version}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-dashed border-red-500/50 bg-red-950/20"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Upload className="w-12 h-12 text-red-400" />
              </motion.div>
              <div className="text-center">
                <p className="text-lg font-semibold text-red-300">松开鼠标导入模组</p>
                <p className="text-sm text-red-400/60 mt-1">支持 .json 格式的模组文件</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click outside to close menus */}
      <AnimatePresence>
        {(sortMenuOpen || exportMenuModule) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-10"
            onClick={() => {
              setSortMenuOpen(false);
              setExportMenuModule(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Paste Text Modal */}
      <AnimatePresence>
        {pasteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-2xl rounded-xl bg-gray-900 border border-gray-700/40 shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/40">
                <h3 className="text-sm font-semibold text-gray-200">粘贴模组 JSON</h3>
                <button
                  onClick={() => {
                    setPasteModalOpen(false);
                    setPasteText('');
                  }}
                  className="text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder='{"id": "...", "name": "...", "scenes": {...}}'
                  className="w-full h-64 p-3 rounded-lg bg-gray-950 border border-gray-800/40 text-sm text-gray-300 font-mono resize-none focus:outline-none focus:border-red-800/40 transition-colors"
                />
                <p className="mt-2 text-xs text-gray-500">
                  将完整的模组 JSON 粘贴到上方，系统将自动校验并导入。
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800/40">
                <button
                  onClick={() => {
                    setPasteModalOpen(false);
                    setPasteText('');
                  }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  取消
                </button>
                <motion.button
                  onClick={handlePasteImport}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 rounded-lg bg-red-900/40 border border-red-800/40 text-sm text-red-300 hover:bg-red-800/40 transition-colors"
                >
                  导入
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conflict Resolution Modal */}
      <AnimatePresence>
        {conflictModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-700/40 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/40">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-semibold text-gray-200">模组冲突</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-300 mb-3">
                  已存在名为「<strong className="text-red-400">{conflictModal.conflict.newModule.name}</strong>」的模组
                  （ID: {conflictModal.conflict.existingModule.id}）。
                </p>
                <p className="text-sm text-gray-400 mb-4">
                  冲突类型：{conflictModal.conflict.conflictType === 'id' ? 'ID 重复' : '名称重复'}
                </p>
                <div className="space-y-2">
                  <motion.button
                    onClick={() => conflictModal.onResolve('overwrite')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full text-left px-4 py-3 rounded-lg bg-red-950/20 border border-red-800/30 hover:bg-red-900/20 transition-colors"
                  >
                    <div className="font-medium text-red-300 text-sm">覆盖现有模组</div>
                    <div className="text-xs text-red-400/60 mt-0.5">现有数据将被替换</div>
                  </motion.button>
                  <motion.button
                    onClick={() => conflictModal.onResolve('rename')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full text-left px-4 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 hover:bg-gray-700/40 transition-colors"
                  >
                    <div className="font-medium text-gray-300 text-sm">自动重命名</div>
                    <div className="text-xs text-gray-500 mt-0.5">添加序号后缀（如「名称 (2)」）</div>
                  </motion.button>
                  <motion.button
                    onClick={() => conflictModal.onResolve('cancel')}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className="w-full text-left px-4 py-3 rounded-lg bg-gray-800/40 border border-gray-700/40 hover:bg-gray-700/40 transition-colors"
                  >
                    <div className="font-medium text-gray-400 text-sm">取消导入</div>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Validation Error Modal */}
      <AnimatePresence>
        {validationModal && validationModal.validation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-700/40 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/40">
                <XCircle className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-semibold text-gray-200">校验失败</h3>
              </div>
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-gray-400 mb-3">导入的数据不符合模组 Schema，请检查以下错误：</p>
                <div className="space-y-2">
                  {validationModal.validation.errors.map((err, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-950/20 border border-red-800/20"
                    >
                      <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-red-300">{err.field}</div>
                        <div className="text-xs text-red-400/70">{err.message}</div>
                      </div>
                    </div>
                  ))}
                  {validationModal.validation.warnings.map((warn, i) => (
                    <div
                      key={`w-${i}`}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/20 border border-amber-800/20"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-medium text-amber-300">{warn.field}</div>
                        <div className="text-xs text-amber-400/70">{warn.message}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-end px-5 py-4 border-t border-gray-800/40">
                <motion.button
                  onClick={() => setValidationModal(null)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 rounded-lg bg-gray-800/40 border border-gray-700/40 text-sm text-gray-300 hover:bg-gray-700/40 transition-colors"
                >
                  关闭
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-xl bg-gray-900 border border-gray-700/40 shadow-2xl"
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/40">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-semibold text-gray-200">确认删除</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-300">
                  确定要删除模组「<strong className="text-red-400">{deleteConfirm.name}</strong>」吗？
                </p>
                <p className="text-xs text-gray-500 mt-2">此操作不可撤销。</p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800/40">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  取消
                </button>
                <motion.button
                  onClick={() => handleDelete(deleteConfirm)}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2 rounded-lg bg-red-900/40 border border-red-800/40 text-sm text-red-300 hover:bg-red-800/40 transition-colors"
                >
                  删除
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ModuleManagerPage;
