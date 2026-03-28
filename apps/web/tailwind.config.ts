import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Korean stock market convention (opposite of US)
        stock: {
          up: '#EF4444',       // Red — price increase
          down: '#3B82F6',     // Blue — price decrease
          flat: '#6B7280',     // Gray — no change
          'up-bg': '#FEF2F2',  // Light red background
          'down-bg': '#EFF6FF', // Light blue background
        },
        // Brand colors
        brand: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
          950: '#082F49',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Stock price display sizes
        'price-lg': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'price-md': ['1.125rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'price-sm': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
      },
      animation: {
        'price-flash-up': 'flashUp 0.5s ease-out',
        'price-flash-down': 'flashDown 0.5s ease-out',
      },
      keyframes: {
        flashUp: {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashDown: {
          '0%': { backgroundColor: 'rgba(59, 130, 246, 0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};

export default config;
