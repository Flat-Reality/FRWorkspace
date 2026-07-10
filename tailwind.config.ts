import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#18181b',
        mist: '#f4f4f5',
        paper: '#ffffff',
        line: '#e4e4e7',
        forest: '#7F00FF',
        coral: '#d76d55',
        sky: '#4d7caa',
        amber: '#b9822f',
      },
      boxShadow: {
        soft: '0 18px 45px rgba(24, 24, 27, 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
