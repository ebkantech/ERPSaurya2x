/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Primary — deep royal sapphire. Used for actions, links, the sidebar.
        brand: {
          50:  '#eef3ff',
          100: '#dbe4ff',
          200: '#bccdff',
          300: '#90aaff',
          400: '#6180f6',
          500: '#2d4ecc',  // primary
          600: '#2440ae',
          700: '#1e348f',
          800: '#182a70',
          900: '#0e1a3c',  // sidebar base
          950: '#0a1229',
        },
        // Accent — restrained gold, for highlights / active emphasis only.
        accent: {
          50:  '#fbf7ec',
          100: '#f5eccf',
          200: '#ead79b',
          300: '#e0c570',
          400: '#d4af37',  // classic gold
          500: '#bf9a2d',
          600: '#9c7c24',
          700: '#7c621f',
        },
        // Neutrals.
        surface: {
          50:  '#f7f9fc',
          100: '#eef2f7',
          200: '#e3e9f1',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card:        '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)',
        'card-hover':'0 10px 28px -8px rgba(16,24,40,.18), 0 3px 8px -3px rgba(16,24,40,.08)',
        sidebar:     '0 0 40px rgba(0,0,0,.25)',
        'btn':       '0 1px 2px rgba(16,24,40,.08), 0 2px 8px -2px rgba(45,78,204,.35)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
}
