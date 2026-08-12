import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 5174 — 옆 폴더의 healthcare-ai-webapp(5173)와 동시에 띄울 수 있도록 포트를 비켜 둔다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
