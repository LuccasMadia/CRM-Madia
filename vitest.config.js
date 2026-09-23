import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: { name: 'server', include: ['server/**/*.test.js'], environment: 'node' },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          include: ['web/**/*.test.{js,jsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['web/src/test/setup.js'],
        },
      },
    ],
  },
});
