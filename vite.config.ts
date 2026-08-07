import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

// `base: './'` keeps asset URLs relative so the production build works from a
// GitHub Pages project subpath without hard-coding the repository name.
export default defineConfig({
  base: './',
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
