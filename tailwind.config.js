/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Coral — THE action color, driven by CSS vars so the light theme
        // re-tunes it for contrast automatically.
        brand: 'rgb(var(--color-brand-rgb) / <alpha-value>)',
        brandTint: 'var(--brand-tint)',
        // Semantic ink — use these instead of text-white/slate-* in new code.
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        // Tiered surfaces. Legacy `charcoal-*` classes resolve to the same
        // tokens so every existing page re-skins without edits.
        charcoal: {
          DEFAULT: 'var(--color-bg)',
          surface: 'var(--color-surface)',
          surface2: 'var(--color-surface-2)',
          elevated: 'var(--color-elevated)',
          border: 'var(--color-border)',
          borderSoft: 'var(--color-border-soft)',
        },
        // The single "empty track" material for every progress / segment /
        // ring track (readiness + macro bars, picker ticks, calorie ring).
        // Replaces per-surface bg-white/[0.08] + raw rgba ring strokes.
        track: 'var(--color-track)',
        // Hue-coded data — each datum owns one hue (never decoration).
        teal:   'rgb(var(--hue-teal-rgb) / <alpha-value>)',
        coral:  'rgb(var(--hue-coral-rgb) / <alpha-value>)',
        violet: 'rgb(var(--hue-violet-rgb) / <alpha-value>)',
        leaf:   'rgb(var(--hue-green-rgb) / <alpha-value>)',
        carb:   'rgb(var(--hue-blue-rgb) / <alpha-value>)',
        gold:   'rgb(var(--hue-gold-rgb) / <alpha-value>)',
        fat:    'rgb(var(--hue-yellow-rgb) / <alpha-value>)',
        // Data-viz series (charts, macro bars — never status)
        viz: {
          1: 'var(--viz-1)', 2: 'var(--viz-2)', 3: 'var(--viz-3)',
          4: 'var(--viz-4)', 5: 'var(--viz-5)',
        },
        // Physiological spectrum (biometrics only)
        ok: 'rgb(var(--ok-rgb) / <alpha-value>)',
        warn: 'rgb(var(--warn-rgb) / <alpha-value>)',
        bad: 'rgb(var(--bad-rgb) / <alpha-value>)',
        info: 'rgb(var(--info-rgb) / <alpha-value>)',
        // Legacy status scales — recalibrated to the spectrum at the 500 stop.
        primary: {
          50: '#fef4f3', 100: '#fde6e4', 200: '#fbcdc9', 300: '#f7a49d',
          400: '#ef7368', 500: '#ef7368', 600: '#d94f43', 700: '#b53c32',
          800: '#95342d', 900: '#7c302b', 950: '#431512',
        },
        success: {
          50: '#f2fbef', 100: '#e0f5da', 200: '#c2eab8',
          500: '#7bc96f', 600: '#54a849', 700: '#42853a',
        },
        warning: {
          50: '#fdf8ee', 100: '#faedd2',
          500: '#e2a23c', 600: '#c98421', 700: '#a7661c',
        },
        danger: {
          50: '#fef4f3', 100: '#fde6e4', 200: '#fbcdc9', 300: '#f7a49d',
          500: '#ef7368', 600: '#d94f43', 700: '#b53c32', 800: '#95342d',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        // Numerals are Manrope + tabular-nums in this identity; `font-mono`
        // stays mapped so legacy micro-labels inherit the new voice.
        mono: ['Manrope', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'sm': '8px',
        'DEFAULT': '10px',
        'md': '12px',
        'lg': '13px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
        'full': '9999px',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'dark-card': 'var(--shadow-1)',
        'neon': '0 8px 22px rgba(var(--color-brand-rgb) / 0.28)',
        'neon-lg': '0 10px 26px rgba(var(--color-brand-rgb) / 0.34)',
        'energy': '0 8px 22px rgba(var(--color-brand-rgb) / 0.28)',
      },
    },
  },
  plugins: [],
}
