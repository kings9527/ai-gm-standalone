import React, { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, RotateCcw, Settings, LogOut, Play, X } from 'lucide-react';

interface InGameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onLoad: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onResume: () => void;
}

/**
 * InGameMenu
 * ESC key overlay menu for in-game actions.
 * Dark translucent backdrop with centered action buttons.
 */
export const InGameMenu: React.FC<InGameMenuProps> = ({
  isOpen,
  onClose,
  onSave,
  onLoad,
  onSettings,
  onQuit,
  onResume,
}) => {
  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const menuItems = [
    { icon: Play, label: '继续游戏', action: onResume, color: 'text-green-400', border: 'border-green-900/30', hover: 'hover:bg-green-950/20 hover:border-green-800/40' },
    { icon: Save, label: '保存游戏', action: onSave, color: 'text-red-400', border: 'border-red-900/30', hover: 'hover:bg-red-950/20 hover:border-red-800/40' },
    { icon: RotateCcw, label: '读取存档', action: onLoad, color: 'text-amber-400', border: 'border-amber-900/30', hover: 'hover:bg-amber-950/20 hover:border-amber-800/40' },
    { icon: Settings, label: '设置', action: onSettings, color: 'text-blue-400', border: 'border-blue-900/30', hover: 'hover:bg-blue-950/20 hover:border-blue-800/40' },
    { icon: LogOut, label: '退出到主菜单', action: onQuit, color: 'text-gray-400', border: 'border-gray-800/40', hover: 'hover:bg-gray-900/40 hover:border-gray-700/40' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Menu Card */}
          <motion.div
            className="relative z-10 w-full max-w-sm mx-4"
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              className="absolute -top-10 right-0 p-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="bg-gray-950/90 border border-red-900/30 rounded-2xl p-6 shadow-2xl">
              {/* Title */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold text-gray-100 tracking-wider">游戏菜单</h2>
                <div className="w-12 h-0.5 bg-red-900/40 mx-auto mt-2" />
              </div>

              {/* Menu Items */}
              <div className="flex flex-col gap-2">
                {menuItems.map((item, index) => (
                  <motion.button
                    key={item.label}
                    className={`flex items-center gap-3 px-5 py-3.5 rounded-xl border transition-all duration-200 ${item.border} ${item.hover}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 + 0.1 }}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={item.action}
                  >
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                    <span className="text-sm font-medium text-gray-200">{item.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Hint */}
              <div className="mt-4 text-center text-[10px] text-gray-600">
                按 ESC 键关闭菜单
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InGameMenu;
