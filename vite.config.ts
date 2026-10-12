import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative base => works on GitHub Pages sub-paths, Netlify, Vercel or any static host
  base: './',
  resolve: {
    // three/addons import 'three'; point it at the WebGPU build so only one copy of Three.js is bundled
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
