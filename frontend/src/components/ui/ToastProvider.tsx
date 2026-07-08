import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />,
  error: <XCircle className="w-4 h-4 shrink-0 text-red-400" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />,
  info: <Info className="w-4 h-4 shrink-0 text-blue-400" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-green-950/90 border-green-800/40 text-green-200',
  error: 'bg-red-950/90 border-red-800/40 text-red-200',
  warning: 'bg-amber-950/90 border-amber-800/40 text-amber-200',
  info: 'bg-gray-900/90 border-gray-700/40 text-gray-200',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = `toast-${++idRef.current}`;
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* Toast container - top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-xl border backdrop-blur-sm min-w-[240px] max-w-[400px] ${STYLES[toast.type]}`}
            >
              {ICONS[toast.type]}
              <span className="text-sm flex-1">{toast.message}</span>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 ml-1"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
              {/* Progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-b-lg overflow-hidden">
                <motion.div
                  className="h-full bg-current opacity-40"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: (toast.duration || 3500) / 1000, ease: 'linear' }}
                />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;
