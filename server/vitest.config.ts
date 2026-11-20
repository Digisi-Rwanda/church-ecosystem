import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Many suites build the whole app in a hook; on a busy machine that can pass 10s.
    hookTimeout: 60_000,
    testTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    env: { JWT_SECRET: 'test-secret', NODE_ENV: 'test' },
  },
});
