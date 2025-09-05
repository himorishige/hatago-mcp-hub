/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {}
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        hatago: {
          primary: '#d97706', // 橙色（Hatagoのテーマカラー）
          secondary: '#7c3aed',
          accent: '#fbbf24',
          neutral: '#2a2e37',
          'base-100': '#ffffff',
          'base-200': '#f3f4f6',
          'base-300': '#e5e7eb',
          info: '#3abff8',
          success: '#36d399',
          warning: '#fbbd23',
          error: '#f87272'
        }
      },
      'dark',
      'light'
    ]
  }
};
