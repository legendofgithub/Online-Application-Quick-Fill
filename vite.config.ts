import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

// base './':打包后由 Electron 以 file:// 加载 dist/index.html,必须用相对路径引用资源
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        ball: fileURLToPath(new URL('./ball.html', import.meta.url)),
      },
    },
  },
})
