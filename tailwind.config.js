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
        // Off-white (dark) / ink (light) — THE one action colour, driven by CSS
        // vars so the light theme flips it automatically. No brand hue; hues
        // below are data (teal readiness, coral protein, ...).
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
        // Ledger: SF Pro via the system stack (the Manrope Google-font import
        // is dropped in index.css). Numerals stay tabular-nums via the
        // .font-technical/.hero-metric utilities; `font-mono` stays mapped so
        // legacy micro-labels inherit the same voice.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif'],
      },
      // ── Type scale: seven named steps (brand guide, Foundations > Type) ──
      //   micro 11/14 · caption 12/16 · body 14/20 · emph 15/20 · title 17/22
      //   display 28/32 · hero 44/44
      // Use `text-micro` ... `text-hero` in new code. The stock Tailwind keys
      // are re-pointed at the NEAREST step so every existing `text-*` class
      // lands on the scale with no JSX edits. xs (12) and sm (14) are
      // unchanged. Shifts: base 16->15, lg 18->17, xl 20->17, 2xl 24->28,
      // 3xl 30->28, 4xl 36->28, 5xl+ 48/60/72/96/128->44. Nothing is below 11.
      // Arbitrary `text-[Npx]` classes in JSX bypass this and need a codemod.
      // CAUTION: tailwind-merge (button.jsx, card.jsx) does not know the named
      // steps and treats `text-body` like a colour (it would drop `text-ink`).
      // Inside twMerge'd className strings use `text-[14px]`-style on-scale px.
      fontSize: {
        micro:   ['11px', { lineHeight: '14px' }],
        caption: ['12px', { lineHeight: '16px' }],
        body:    ['14px', { lineHeight: '20px' }],
        emph:    ['15px', { lineHeight: '20px' }],
        title:   ['17px', { lineHeight: '22px' }],
        display: ['28px', { lineHeight: '32px' }],
        hero:    ['44px', { lineHeight: '44px' }],
        xs:   ['12px', { lineHeight: '16px' }],
        sm:   ['14px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '20px' }],
        lg:   ['17px', { lineHeight: '22px' }],
        xl:   ['17px', { lineHeight: '22px' }],
        '2xl': ['28px', { lineHeight: '32px' }],
        '3xl': ['28px', { lineHeight: '32px' }],
        '4xl': ['28px', { lineHeight: '32px' }],
        '5xl': ['44px', { lineHeight: '44px' }],
        '6xl': ['44px', { lineHeight: '44px' }],
        '7xl': ['44px', { lineHeight: '44px' }],
        '8xl': ['44px', { lineHeight: '44px' }],
        '9xl': ['44px', { lineHeight: '44px' }],
      },
      // ── Weights: 400 text / 600 emphasis / 700 numerals only ─────────────
      // `font-bold`, `font-extrabold` and `font-black` resolve to 600 (brand
      // guide: quieter texture; ~377 call sites, no JSX edits). Numerals keep
      // 700 via the CSS classes `.hero-metric` and `.type-display` in
      // index.css, which set font-weight directly and are unaffected.
      // `font-medium` (500) is left alone. Tabular-nums rules are untouched.
      fontWeight: {
        bold: '600',
        extrabold: '600',
        black: '600',
      },
      // ── Radius: exactly three brand tokens ───────────────────────────────
      //   module 0 · control 10px · pill 9999px   (CSS: --r-module/-control/-pill)
      // Legacy keys stay valid and collapse onto them: every stepped size
      // (sm .. 3xl, DEFAULT) is the control radius, `full` is the pill.
      // Modules are additionally forced to 0 by `.surface/.glass/.tile`.
      borderRadius: {
        none: '0px',
        module: '0px',
        control: '10px',
        pill: '9999px',
        'sm': '10px',
        'DEFAULT': '10px',
        'md': '10px',
        'lg': '10px',
        'xl': '10px',
        '2xl': '10px',
        '3xl': '10px',
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
