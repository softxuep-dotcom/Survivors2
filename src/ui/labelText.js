// Decorative prefixes used by the locale dictionaries. Keep this explicit:
// the Android Douyin VM rejects Unicode property escapes at script parse time.
const PREFIX_ICONS = new Set(['🎬', '🏆', 'ℹ', '↪', '\uFE0F', '\u200D']);

export function stripLeadingIcon(label, extraIcons = '') {
  const text = label.replace(/^\s+/, '');
  let length = 0;
  for (const character of text) {
    if (!PREFIX_ICONS.has(character) && !extraIcons.includes(character)) break;
    length += character.length;
  }
  return length ? text.slice(length).replace(/^\s+/, '') : label;
}
