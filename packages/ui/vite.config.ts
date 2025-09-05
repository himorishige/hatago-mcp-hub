import honox from 'honox/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [honox()],
  css: {
    postcss: './postcss.config.js'
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'HatagoUI',
      fileName: () => 'index.js',
      formats: ['es']
    },
    rollupOptions: {
      external: ['hono', '@himorishige/hatago-core', '@himorishige/hatago-hub'],
      output: {
        exports: 'named'
      }
    }
  }
});
