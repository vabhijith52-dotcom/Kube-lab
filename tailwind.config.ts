import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { k8s: { 50: '#eef4ff', 100: '#dce8ff', 500: '#326CE5', 600: '#2858c4', 700: '#1f469c' } },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -8px rgba(16,24,40,.10)',
        lift: '0 2px 4px rgba(16,24,40,.05), 0 14px 32px -10px rgba(50,108,229,.28)',
      },
      keyframes: {
        flash: { '0%': { boxShadow: '0 0 0 0 rgba(50,108,229,.55)' }, '100%': { boxShadow: '0 0 0 12px rgba(50,108,229,0)' } },
        pop: { '0%': { transform: 'scale(.92)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        dash: { to: { strokeDashoffset: '-24' } },
      },
      animation: {
        flash: 'flash .9s ease-out',
        pop: 'pop .35s cubic-bezier(.2,.9,.3,1.2)',
        dash: 'dash 1s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
