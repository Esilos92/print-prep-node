/**
 * Without this file PostCSS never runs Tailwind, so the @tailwind directives
 * in globals.css produce nothing and every utility class in the markup is
 * inert — `grid` computes to `display: block`, `rounded-full` to `0px`.
 *
 * It was missing, which is why the components had accumulated so many inline
 * style attributes: the classes silently did nothing and inline styles were
 * the only thing that worked.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
