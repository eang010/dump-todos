import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { notionApi } from './vite-plugin-notion-api.js'

export default defineConfig({
  plugins: [react(), notionApi()],
})
