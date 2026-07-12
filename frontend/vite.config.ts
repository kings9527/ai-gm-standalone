import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: false,
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 强制拆分第三方库，按依赖优先级从高到低匹配
          if (id.includes('node_modules')) {
            if (id.includes('react/') || id.includes('react-dom/')) return 'vendor-react';
            if (id.includes('react-router') || id.includes('history')) return 'vendor-router';
            if (id.includes('framer-motion')) return 'vendor-motion';
            if (id.includes('zustand')) return 'vendor-zustand';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('jszip')) return 'vendor-jszip';
            if (id.includes('html-to-image')) return 'vendor-html-to-image';
          }
        },
      },
    },
  },
});
