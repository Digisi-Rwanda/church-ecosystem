import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { prodEnvProblems } from './scripts/prodEnvGuard.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Fails the build when VITE_APP_ENV=production but the settings are demo ones.
  const problems = prodEnvProblems(loadEnv(mode, process.cwd(), 'VITE_'))
  if (problems.length) {
    throw new Error('Refusing to build the production site:\n  - ' + problems.join('\n  - '))
  }
  return {
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  }
})
