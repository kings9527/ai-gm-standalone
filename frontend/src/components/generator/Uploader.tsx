import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText, Image, ClipboardPaste, X, FileCheck } from 'lucide-react';

export interface UploadResult {
  type: 'text' | 'image';
  content: string;
  filename?: string;
  size?: number;
}

interface UploaderProps {
  onUpload: (result: UploadResult) => void;
  maxSizeMB?: number;
  acceptText?: string;
  acceptImage?: string;
}

/**
 * Uploader 组件
 * 支持：拖拽上传 txt/md、点击上传、粘贴文本、图片 OCR（placeholder）
 */
export const Uploader: React.FC<UploaderProps> = ({
  onUpload,
  maxSizeMB = 10,
  acceptText = '.txt,.md,.markdown',
  acceptImage = 'image/*',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [showPasteInput, setShowPasteInput] = useState(false);
  const [recentFiles, setRecentFiles] = useState<UploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const maxBytes = maxSizeMB * 1024 * 1024;

  // 读取文本文件
  const readTextFile = (file: File): Promise<UploadResult> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          type: 'text',
          content: String(e.target?.result || ''),
          filename: file.name,
          size: file.size,
        });
      };
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  };

  // 图片 OCR placeholder - 实际项目中接入 OCR API
  const processImage = (file: File): Promise<UploadResult> => {
    return new Promise((resolve) => {
      // 目前使用占位提示，实际应调用后端 OCR API
      resolve({
        type: 'image',
        content: `[图片上传: ${file.name}]\n[OCR 识别结果占位 - 请接入 OCR 服务]`,
        filename: file.name,
        size: file.size,
      });
    });
  };

  // 处理文件
  const handleFile = async (file: File) => {
    if (file.size > maxBytes) {
      alert(`文件过大，最大支持 ${maxSizeMB}MB`);
      return;
    }

    let result: UploadResult;
    if (file.type.startsWith('image/')) {
      result = await processImage(file);
    } else if (
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.markdown') ||
      file.type === 'text/plain' ||
      file.type === 'text/markdown'
    ) {
      result = await readTextFile(file);
    } else {
      // 尝试作为文本读取
      try {
        result = await readTextFile(file);
      } catch {
        alert('不支持的文件类型，请上传 txt/md 或图片文件');
        return;
      }
    }

    setRecentFiles((prev) => [result, ...prev.slice(0, 4)]);
    onUpload(result);
  };

  // 拖拽事件
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFile(files[0]);
      }
    },
    []
  );

  // 点击上传
  const onClickUpload = () => {
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  // 粘贴文本
  const onPasteFromClipboard = async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      let handled = false;

      for (const item of clipboardItems) {
        // 优先处理图片
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: imageType });
          await handleFile(file);
          handled = true;
          break;
        }

        // 处理文本
        const textType = item.types.find((t) => t === 'text/plain');
        if (textType) {
          const blob = await item.getType(textType);
          const text = await blob.text();
          const result: UploadResult = {
            type: 'text',
            content: text,
            filename: `clipboard-${Date.now()}.txt`,
            size: text.length,
          };
          setRecentFiles((prev) => [result, ...prev.slice(0, 4)]);
          onUpload(result);
          handled = true;
          break;
        }
      }

      if (!handled) {
        setShowPasteInput(true);
        setTimeout(() => pasteRef.current?.focus(), 100);
      }
    } catch {
      // 剪贴板 API 不可用，显示手动输入
      setShowPasteInput(true);
      setTimeout(() => pasteRef.current?.focus(), 100);
    }
  };

  // 提交手动粘贴的文本
  const submitPastedText = () => {
    if (!pastedText.trim()) return;
    const result: UploadResult = {
      type: 'text',
      content: pastedText.trim(),
      filename: `manual-paste-${Date.now()}.txt`,
      size: pastedText.length,
    };
    setRecentFiles((prev) => [result, ...prev.slice(0, 4)]);
    onUpload(result);
    setPastedText('');
    setShowPasteInput(false);
  };

  // 移除最近文件
  const removeRecent = (index: number) => {
    setRecentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="w-full">
      {/* 拖拽区域 */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onClickUpload}
        className={`
          relative w-full rounded-xl border-2 border-dashed cursor-pointer
          transition-all duration-200 p-8 flex flex-col items-center justify-center gap-3
          ${isDragging
            ? 'border-red-500 bg-red-950/20 scale-[1.02]'
            : 'border-gray-600 bg-gray-900/50 hover:border-gray-400 hover:bg-gray-800/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={`${acceptText},${acceptImage}`}
          onChange={onFileChange}
          className="hidden"
        />
        <Upload
          className={`w-10 h-10 transition-colors ${isDragging ? 'text-red-400' : 'text-gray-500'}`}
        />
        <div className="text-center">
          <p className="text-sm text-gray-300 font-medium">
            拖拽文件到此处，或点击上传
          </p>
          <p className="text-xs text-gray-500 mt-1">
            支持 .txt .md 或图片（最大 {maxSizeMB}MB）
          </p>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={onClickUpload}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            bg-gray-800/50 border border-gray-700/50 text-sm text-gray-300
            hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
        >
          <FileText className="w-4 h-4" />
          选择文件
        </button>
        <button
          onClick={onPasteFromClipboard}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
            bg-gray-800/50 border border-gray-700/50 text-sm text-gray-300
            hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
        >
          <ClipboardPaste className="w-4 h-4" />
          粘贴文本
        </button>
      </div>

      {/* 手动粘贴输入框 */}
      {showPasteInput && (
        <div className="mt-3 p-3 rounded-lg bg-gray-900/80 border border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">粘贴文本内容</span>
            <button
              onClick={() => setShowPasteInput(false)}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            ref={pasteRef}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="在此粘贴你的故事文本..."
            className="w-full h-32 bg-gray-950 border border-gray-700 rounded-md p-3
              text-sm text-gray-200 placeholder-gray-600 resize-none
              focus:outline-none focus:border-red-800/60"
          />
          <button
            onClick={submitPastedText}
            disabled={!pastedText.trim()}
            className="mt-2 w-full py-2 rounded-md bg-red-900/40 border border-red-800/40
              text-sm text-red-200 hover:bg-red-800/40 disabled:opacity-30 disabled:cursor-not-allowed
              transition-colors"
          >
            确认提交
          </button>
        </div>
      )}

      {/* 最近上传列表 */}
      {recentFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">最近上传</p>
          <div className="flex flex-col gap-1.5">
            {recentFiles.map((file, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg
                  bg-gray-900/40 border border-gray-800/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {file.type === 'image' ? (
                    <Image className="w-4 h-4 text-gray-500 shrink-0" />
                  ) : (
                    <FileCheck className="w-4 h-4 text-green-600 shrink-0" />
                  )}
                  <span className="text-xs text-gray-300 truncate">
                    {file.filename}
                  </span>
                  <span className="text-xs text-gray-600 shrink-0">
                    {(file.size || 0) > 1024
                      ? `${((file.size || 0) / 1024).toFixed(1)}KB`
                      : `${file.size}B`}
                  </span>
                </div>
                <button
                  onClick={() => removeRecent(i)}
                  className="text-gray-600 hover:text-red-400 shrink-0 ml-2"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Uploader;
