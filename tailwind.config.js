/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,html}'],
  theme: {
    extend: {},
  },
  plugins: [
    // Custom variant so nav.js can write `nav-active:text-indigo-600` etc.
    // and have it apply only when the nav button carries the `.nav-active`
    // class app.js toggles on route changes (see updateNavActiveState).
    function ({ addVariant }) {
      addVariant('nav-active', '&.nav-active');
    },
  ],
};
