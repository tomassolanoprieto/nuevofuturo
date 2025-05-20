import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    // Configure server to handle SPA routing
    proxy: {},
  },
  // Add base URL configuration
  base: '/',
  // Configure build options
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Generate SPA fallback
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});