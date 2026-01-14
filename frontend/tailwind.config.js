/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          blue: '#1E3A8A',
          gold: '#D4AF37',
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        background: '#F9FAFB',
        text: {
          primary: '#111827',
          secondary: '#6B7280',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
