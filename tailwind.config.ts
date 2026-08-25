import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        mist: 'rgb(var(--color-mist) / <alpha-value>)',
        paper: 'rgb(var(--color-paper) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        forest: '#7F00FF',
        coral: '#d76d55',
        sky: '#4d7caa',
        amber: '#b9822f',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
} satisfies Config;
