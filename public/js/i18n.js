// Interface translations. English text is the key, so anything untranslated simply shows in English.
// To add a language: create js/lang/<code>.js exporting a default { "English text": "translation" } and
// add it to UI_LANGS below.
let dict = {};
let current = 'en';

export const UI_LANGS = [
  ['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు'], ['ta', 'தமிழ்'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'],
];

export const RTL = new Set(['ar', 'he', 'fa', 'ur']);

export async function setLanguage(code) {
  current = UI_LANGS.some((l) => l[0] === code) ? code : 'en';
  dict = {};
  if (current !== 'en') {
    try { dict = (await import(`./lang/${current}.js`)).default; } catch { dict = {}; }
  }
  document.documentElement.lang = current;
  document.documentElement.dir = RTL.has(current) ? 'rtl' : 'ltr';
  return current;
}

export const currentLanguage = () => current;

/** "1 song" / "12 songs" */
export const nSongs = (n) => `${n} ${t(n === 1 ? 'song' : 'songs')}`;

export function t(s, vars) {
  let out = dict[s] ?? s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
}
