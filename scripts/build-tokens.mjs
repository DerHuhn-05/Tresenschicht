// Erzeugt src/styles/tokens.css aus design/tokens.json (Design System „Kneipen-App“).
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url)));
const byName = Object.fromEntries(t.color.tokens.map((x) => [x.name, x]));

function resolve(value, theme) {
  let v = typeof value === 'string' ? value : value[theme] ?? value.light;
  const m = /^\{(.+)\}$/.exec(v);
  return m ? resolve(byName[m[1]].value, theme) : v;
}
function colors(theme) {
  return t.color.tokens.map((x) => `  --${x.name}: ${resolve(x.value, theme)};`).join('\n');
}
const plain = ['spacing', 'radius', 'size', 'stroke']
  .flatMap((f) => t[f].tokens.map((x) => `  --${x.name}: ${x.value};`))
  .join('\n');
const styles = t.type.groups.flatMap((g) => g.styles);
const typeCss = styles
  .map((s) => `.t-${s.name} { font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight};${s.letterSpacing ? ` letter-spacing: ${s.letterSpacing};` : ''} }`)
  .join('\n');

const css = `/* Kneipen-App — generiert aus design/tokens.json (npm run tokens) */
:root {
  --font-sans: ${t.type.families.sans};
${plain}
${colors('light')}
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']):not([data-theme='contrast']) {
${colors('dark')}
    color-scheme: dark;
  }
}
:root[data-theme='dark'] {
${colors('dark')}
  color-scheme: dark;
}
@media (prefers-contrast: more) {
  :root:not([data-theme='light']):not([data-theme='dark']) {
${colors('contrast')}
  }
}
:root[data-theme='contrast'] {
${colors('contrast')}
}
${typeCss}
`;
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css);
console.log('tokens.css geschrieben');
