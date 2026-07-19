/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1a4a7a',
        'primary-light': '#1a73e8',
        'primary-dark': '#0d2b4a',
        accent: '#d4a017',
        'accent-light': '#f0c75e',
        bg: '#f0f2f5',
        card: '#ffffff',
        text: '#1a1a2e',
        'text-secondary': '#5a6378',
        border: '#e2e5ea',
        danger: '#dc2626',
        success: '#16a34a',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
