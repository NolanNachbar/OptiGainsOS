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
        // Primary brand colors — Volt Neon Green
        primary: {
          50: '#f7ffe0',
          100: '#eeffb3',
          200: '#e0ff80',
          300: '#d6ff4d',
          400: '#d4ff1a',
          500: '#ccff00',
          600: '#a3cc00',
          700: '#7a9900',
          800: '#526600',
          900: '#293300',
          950: '#141a00',
        },
        // Cyber Charcoal backgrounds
        charcoal: {
          DEFAULT: '#121212',
          surface: '#1a1a1a',
          surface2: '#202020',
          elevated: '#242424',
          border: '#2a2a2a',
          borderSoft: '#222222',
        },
        // Status colors
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '6px',
        'lg': '8px',
        'xl': '10px',
        '2xl': '10px',
        '3xl': '10px',
        'full': '9999px',
      },
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'dark-card': '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -2px rgba(0, 0, 0, 0.4)',
        'neon': '0 0 20px rgba(204, 255, 0, 0.25)',
        'neon-lg': '0 0 40px rgba(204, 255, 0, 0.3)',
      },
    },
  },
  plugins: [],
}
