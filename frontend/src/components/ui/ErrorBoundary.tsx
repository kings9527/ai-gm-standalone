import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * GlobalErrorBoundary
 * 捕获渲染错误的全局错误边界，提供友好的错误恢复界面。
 */
export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onReset?.();
  };

  handleGoHome = () => {
    window.location.hash = '/';
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="w-full h-screen flex items-center justify-center bg-gray-950 text-gray-200 p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-lg w-full text-center space-y-6"
          >
            <motion.div
              animate={{ rotate: [0, -5, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
              className="inline-block"
            >
              <AlertTriangle className="w-16 h-16 text-red-500 mx-auto" />
            </motion.div>

            <div>
              <h1 className="text-2xl font-bold text-red-400 mb-2">程序遇到了错误</h1>
              <p className="text-gray-400 text-sm">
                别担心，错误已被捕获。你可以尝试重置或返回主页。
              </p>
            </div>

            {this.state.error && (
              <div className="rounded-lg border border-red-800/30 bg-red-950/30 p-4 text-left">
                <p className="text-red-300 text-sm font-mono break-all">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300">
                      堆栈跟踪
                    </summary>
                    <pre className="mt-2 text-[11px] text-red-400/70 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-800/40 border border-red-700/40 text-red-300 hover:bg-red-700/40 transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                重试
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-800/40 border border-gray-700/40 text-gray-300 hover:bg-gray-700/40 transition-colors text-sm"
              >
                <Home className="w-4 h-4" />
                返回主页
              </button>
            </div>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default GlobalErrorBoundary;
