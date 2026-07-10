import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Download, Sparkles, Upload, Image, Trash2, X,
  FolderOpen, Loader2, Check, AlertCircle, RefreshCw,
  ImageIcon, Palette, ChevronLeft, Grid, AlertTriangle,
} from 'lucide-react';
import { electronAPI } from '../../api/electron';
import type { ImageItem } from '../../types/module';

interface ImageSelectorProps {
  /** 默认图片类型过滤 */
  type?: 'bg' | 'sprite' | 'portrait' | 'all';
  /** 选中回调 */
  onSelect?: (image: ImageItem) => void;
  /** 关闭回调 */
  onClose?: () => void;
  /** 是否显示为弹窗 */
  modal?: boolean;
  /** 标题 */
  title?: string;
}

type TabKey = 'local' | 'search' | 'generate' | 'upload';

interface SearchResult {
  id: string;
  url: string;
  thumb: string;
  source: string;
  type: string;
  description?: string;
  author?: string;
}

/**
 * ImageSelector
 * 图片选择器：浏览本地缓存、搜索新图、AI生成、上传本地图片
 */
export const ImageSelector: React.FC<ImageSelectorProps> = ({
  type = 'all',
  onSelect,
  onClose,
  modal = true,
  title = '图片选择器',
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('local');
  const [localImages, setLocalImages] = useState<ImageItem[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchType, setSearchType] = useState<'bg' | 'sprite' | 'portrait'>(type === 'all' ? 'bg' : type as any);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generateType, setGenerateType] = useState<'bg' | 'sprite' | 'portrait'>(type === 'all' ? 'bg' : type as any);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImageItem | SearchResult | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmImage, setDeleteConfirmImage] = useState<ImageItem | null>(null);
  const [uploadType, setUploadType] = useState<'bg' | 'sprite' | 'portrait' | 'upload'>('upload');

  // 加载本地图片
  const loadLocalImages = useCallback(async () => {
    setLoadingLocal(true);
    setError(null);
    try {
      const results = await electronAPI.imageList(type === 'all' ? '' : type);
      setLocalImages(results || []);
    } catch (err: any) {
      setError(err.message || '加载本地图片失败');
    } finally {
      setLoadingLocal(false);
    }
  }, [type]);

  useEffect(() => {
    loadLocalImages();
  }, [loadLocalImages]);

  // 搜索图片
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    setError(null);
    try {
      const res = await electronAPI.imageSearch(searchQuery + (searchType ? `&type=${searchType}` : ''));
      setSearchResults(res.results || []);
    } catch (err: any) {
      setError(err.message || '搜索失败');
    } finally {
      setLoadingSearch(false);
    }
  };

  // 下载搜索到的图片
  const handleDownload = async (result: SearchResult) => {
    setDownloadingIds((prev) => new Set(prev).add(result.id));
    setError(null);
    try {
      await electronAPI.imageDownload({ url: result.url, type: result.type || searchType });
      // 刷新本地列表
      await loadLocalImages();
      // 如果当前在搜索页，自动切换到本地页
      setActiveTab('local');
    } catch (err: any) {
      setError(err.message || '下载失败');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(result.id);
        return next;
      });
    }
  };

  // 生成图片
  const handleGenerate = async () => {
    if (!generatePrompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      await electronAPI.imageGenerate({ prompt: generatePrompt, type: generateType });
      await loadLocalImages();
      setGeneratePrompt('');
      setActiveTab('local');
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  // 上传图片
  const handleUpload = async () => {
    setUploading(true);
    setError(null);
    try {
      const file = await electronAPI.imageDialog();
      if (!file) {
        setUploading(false);
        return;
      }
      await electronAPI.imageUpload({
        data: file.data,
        filename: file.filename,
        type: uploadType,
      });
      await loadLocalImages();
      setActiveTab('local');
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  // 删除图片
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      await electronAPI.imageDelete(id);
      await loadLocalImages();
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  // 选中图片
  const handleSelect = (img: ImageItem | SearchResult) => {
    if ('local_path' in img && img.local_path) {
      // 已经是本地图片
      onSelect?.(img as ImageItem);
    } else {
      // 搜索/生成的结果，需要先下载
      handleDownload(img as SearchResult);
    }
    onClose?.();
  };

  // 图片类型标签
  const typeLabels: Record<string, string> = {
    bg: '背景',
    sprite: '立绘',
    portrait: '头像',
    upload: '上传',
    generated: 'AI生成',
    downloaded: '下载',
  };

  const typeColors: Record<string, string> = {
    bg: 'bg-blue-900/50 border-blue-700/40 text-blue-300',
    sprite: 'bg-purple-900/50 border-purple-700/40 text-purple-300',
    portrait: 'bg-amber-900/50 border-amber-700/40 text-amber-300',
    upload: 'bg-green-900/50 border-green-700/40 text-green-300',
    generated: 'bg-red-900/50 border-red-700/40 text-red-300',
    downloaded: 'bg-gray-900/50 border-gray-700/40 text-gray-300',
  };

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'local', label: '本地缓存', icon: <FolderOpen size={16} /> },
    { key: 'search', label: '搜索图片', icon: <Search size={16} /> },
    { key: 'generate', label: 'AI生成', icon: <Sparkles size={16} /> },
    { key: 'upload', label: '上传图片', icon: <Upload size={16} /> },
  ];

  const content = (
    <div className="w-full h-full flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
        <div className="flex items-center gap-2">
          <ImageIcon size={18} className="text-red-400" />
          <span className="text-sm font-semibold text-gray-200">{title}</span>
        </div>
        {modal && onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800/50 transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800/60">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(null); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-red-500 text-red-400 bg-red-950/20'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 bg-red-950/30 border-b border-red-800/30 flex items-center gap-2 text-xs text-red-400"
          >
            <AlertCircle size={14} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-300">
              <X size={12} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* 本地缓存 */}
          {activeTab === 'local' && (
            <motion.div
              key="local"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">
                  共 {localImages.length} 张图片
                  {type !== 'all' && ` · 类型: ${typeLabels[type] || type}`}
                </span>
                <button
                  onClick={loadLocalImages}
                  disabled={loadingLocal}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-800/50 hover:text-gray-300 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={loadingLocal ? 'animate-spin' : ''} />
                  刷新
                </button>
              </div>

              {loadingLocal ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">加载中...</span>
                </div>
              ) : localImages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
                  <Image size={40} />
                  <span className="text-sm">暂无本地图片</span>
                  <span className="text-xs text-gray-700">切换到搜索或生成标签来获取图片</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {localImages.map((img) => (
                    <motion.div
                      key={img.id}
                      layout
                      className="group relative aspect-square rounded-lg overflow-hidden border border-gray-800/40 bg-gray-900/50 cursor-pointer hover:border-red-700/40 transition-all"
                      onClick={() => handleSelect(img)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* 图片预览 */}
                      <img
                        src={img.local_path ? `file://${img.local_path}` : img.url || ''}
                        alt={img.id}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '';
                          (e.target as HTMLImageElement).className = 'w-full h-full object-cover bg-gray-800/50';
                        }}
                      />
                      {/* 悬浮信息层 */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                        <span className="text-xs text-gray-300 px-2 text-center line-clamp-2">
                          {img.id}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${typeColors[img.type] || typeColors.downloaded}`}>
                          {typeLabels[img.type] || img.type}
                        </span>
                        {img.source && (
                          <span className="text-[10px] text-gray-500">{img.source}</span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelect(img);
                            }}
                            className="p-1.5 rounded bg-red-600/80 text-white hover:bg-red-500 transition-colors"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmImage(img);
                            }}
                            disabled={deletingId === img.id}
                            className="p-1.5 rounded bg-gray-700/80 text-gray-300 hover:bg-red-700/80 transition-colors disabled:opacity-50"
                          >
                            {deletingId === img.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </div>
                      {/* 类型角标 */}
                      <div className={`absolute top-1 left-1 text-[10px] px-1 py-0.5 rounded border ${typeColors[img.type] || typeColors.downloaded}`}>
                        {typeLabels[img.type] || img.type}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* 搜索 */}
          {activeTab === 'search' && (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full flex flex-col p-4 overflow-y-auto"
            >
              {/* 搜索栏 */}
              <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="搜索图片关键词..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-200 placeholder-gray-600 focus:border-red-700/40 focus:outline-none transition-colors"
                  />
                </div>
                <select
                  value={searchType}
                  onChange={(e) => setSearchType(e.target.value as any)}
                  className="px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-xs text-gray-300 focus:border-red-700/40 focus:outline-none"
                >
                  <option value="bg">背景</option>
                  <option value="sprite">立绘</option>
                  <option value="portrait">头像</option>
                </select>
                <button
                  onClick={handleSearch}
                  disabled={loadingSearch || !searchQuery.trim()}
                  className="px-4 py-2 rounded-lg bg-red-900/40 border border-red-800/40 text-xs text-red-300 hover:bg-red-800/40 transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  {loadingSearch ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  搜索
                </button>
              </div>

              {/* 搜索结果 */}
              {loadingSearch ? (
                <div className="flex-1 flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">搜索中...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600">
                  <Search size={40} />
                  <span className="text-sm">输入关键词搜索图片</span>
                  <span className="text-xs text-gray-700">支持 Unsplash 和 Picsum 图片源</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {searchResults.map((result) => (
                    <motion.div
                      key={result.id}
                      className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-800/40 bg-gray-900/50 cursor-pointer hover:border-red-700/40 transition-all"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <img
                        src={result.thumb || result.url}
                        alt={result.description || result.id}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).className = 'w-full h-full bg-gray-800/50';
                        }}
                      />
                      {/* 悬浮操作层 */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                        <span className="text-xs text-gray-300 text-center line-clamp-2">
                          {result.description || result.id}
                        </span>
                        {result.author && (
                          <span className="text-[10px] text-gray-500">by {result.author}</span>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(result);
                            }}
                            disabled={downloadingIds.has(result.id)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-red-600/80 text-white text-xs hover:bg-red-500 transition-colors disabled:opacity-50"
                          >
                            {downloadingIds.has(result.id) ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            {downloadingIds.has(result.id) ? '下载中' : '下载'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* AI生成 */}
          {activeTab === 'generate' && (
            <motion.div
              key="generate"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-14">图片类型</label>
                  <select
                    value={generateType}
                    onChange={(e) => setGenerateType(e.target.value as any)}
                    className="px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-xs text-gray-300 focus:border-red-700/40 focus:outline-none flex-1"
                  >
                    <option value="bg">背景 (1792x1024)</option>
                    <option value="sprite">立绘 (1024x1792)</option>
                    <option value="portrait">头像 (1024x1792)</option>
                  </select>
                </div>
                <div className="flex items-start gap-2">
                  <label className="text-xs text-gray-500 w-14 pt-2">提示词</label>
                  <div className="flex-1 flex gap-2">
                    <textarea
                      value={generatePrompt}
                      onChange={(e) => setGeneratePrompt(e.target.value)}
                      placeholder="描述你想要的图片... 例如：一个阴暗的哥特式城堡，月光照耀，雾气弥漫"
                      rows={4}
                      className="flex-1 px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-sm text-gray-200 placeholder-gray-600 focus:border-red-700/40 focus:outline-none transition-colors resize-none"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleGenerate}
                    disabled={generating || !generatePrompt.trim()}
                    className="px-5 py-2.5 rounded-lg bg-red-900/40 border border-red-800/40 text-sm text-red-300 hover:bg-red-800/40 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {generating ? '生成中...' : '生成图片'}
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-600 border border-dashed border-gray-800/40 rounded-lg p-8">
                <Sparkles size={40} />
                <span className="text-sm">输入提示词，使用 DALL-E 生成图片</span>
                <span className="text-xs text-gray-700 text-center max-w-md">
                  需要配置 OpenAI API Key。在设置中设置 OPENAI_API_KEY。
                </span>
              </div>
            </motion.div>
          )}

          {/* 上传 */}
          {activeTab === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="w-full h-full flex flex-col p-4 overflow-y-auto"
            >
              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-14">保存类型</label>
                  <select
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as any)}
                    className="px-3 py-2 rounded-lg bg-gray-900/50 border border-gray-800/40 text-xs text-gray-300 focus:border-red-700/40 focus:outline-none flex-1"
                  >
                    <option value="bg">背景</option>
                    <option value="sprite">立绘</option>
                    <option value="portrait">头像</option>
                    <option value="upload">未分类</option>
                  </select>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex flex-col items-center gap-3 px-8 py-10 rounded-lg border-2 border-dashed border-gray-700/40 hover:border-red-700/40 bg-gray-900/20 hover:bg-red-950/10 transition-all cursor-pointer disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 size={40} className="text-red-400 animate-spin" />
                  ) : (
                    <Upload size={40} className="text-gray-500" />
                  )}
                  <span className="text-sm text-gray-400">
                    {uploading ? '上传中...' : '点击选择本地图片'}
                  </span>
                  <span className="text-xs text-gray-600">
                    支持 JPG, PNG, GIF, WebP, BMP
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirmImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setDeleteConfirmImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm rounded-xl bg-gray-900 border border-gray-700/40 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/40">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h3 className="text-sm font-semibold text-gray-200">确认删除图片</h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-300">
                  确定要删除图片「<strong className="text-red-400">{deleteConfirmImage.id}</strong>」吗？
                </p>
                <p className="text-xs text-gray-500 mt-2">此操作不可撤销。</p>
              </div>
              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-800/40">
                <button
                  onClick={() => setDeleteConfirmImage(null)}
                  className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 transition-colors"
                >
                  取消
                </button>
                <motion.button
                  onClick={() => {
                    handleDelete(deleteConfirmImage.id);
                    setDeleteConfirmImage(null);
                  }}
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

  if (modal) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-[90vw] max-w-4xl h-[80vh] max-h-[700px] rounded-xl border border-gray-800/40 bg-gray-950 overflow-hidden shadow-2xl"
        >
          {content}
        </motion.div>
      </motion.div>
    );
  }

  return content;
};

export default ImageSelector;
