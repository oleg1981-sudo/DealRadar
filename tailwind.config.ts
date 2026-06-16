import type { Config } from 'tailwindcss';

/**
 * Design tokens — DealRadar.
 * White base, warm orange accent (interactive), semantic red reserved for the
 * discount badge only. Neutral grays from Tailwind's `zinc` ramp.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#EA580C', // orange-600
          hover: '#C2410C',   // orange-700
          soft: '#FFF1E7',    // warm peach tint
        },
        deal: {
          DEFAULT: '#DC2626', // red-600 — discount badge only
          soft: '#FEF2F2',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 4px -1px rgb(0 0 0 / 0.06)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 6px -2px rgb(0 0 0 / 0.06)',
        // ~2x the card-hover shadow — used for the deal-card hover lift cue.
        'card-hover-lg': '0 8px 24px -4px rgb(0 0 0 / 0.20), 0 4px 12px -4px rgb(0 0 0 / 0.12)',
      },
      keyframes: {
        // Bell swing + accent tint, used on the price-alert button on card hover.
        'bell-alert': {
          '0%': { transform: 'rotate(0)', color: '#EA580C' },
          '15%': { transform: 'rotate(18deg)' },
          '30%': { transform: 'rotate(-15deg)' },
          '45%': { transform: 'rotate(12deg)' },
          '60%': { transform: 'rotate(-9deg)' },
          '75%': { transform: 'rotate(5deg)' },
          '100%': { transform: 'rotate(0)', color: '#EA580C' },
        },
        // Fades a chevron in then out; staggered across the 3 stacked chevrons
        // it reads as a downward "push" hint.
        'chevron-hint': {
          '0%, 100%': { opacity: '0.2' },
          '35%': { opacity: '1' },
        },
      },
      animation: {
        // 1s delay, then a 1s ring; `forwards` keeps it red while hovering.
        'bell-alert': 'bell-alert 1s ease-in-out 1s forwards',
        'chevron-hint': 'chevron-hint 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
