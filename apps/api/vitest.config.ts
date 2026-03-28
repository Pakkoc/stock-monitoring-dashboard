import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.interface.ts',
      ],
    },
    setupFiles: ['./test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
