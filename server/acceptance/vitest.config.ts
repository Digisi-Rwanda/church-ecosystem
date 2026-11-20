import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['acceptance/scheduling-preview.test.ts'],env:{JWT_SECRET:'test-secret',NODE_ENV:'test',CORS_ORIGIN:process.env.SCHEDULING_PREVIEW_ORIGIN ?? 'http://127.0.0.1:5173'},testTimeout:1200000,hookTimeout:60000}});
