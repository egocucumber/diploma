import { getLang } from '../utils.js';
import { LANG_META } from '../theme.js';

export function LangDot({ filename }) {
  const m = LANG_META[getLang(filename)] || LANG_META.plaintext;
  return (
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.color, flexShrink: 0, display: 'inline-block' }} />
  );
}

export function LangChip({ filename, C }) {
  const lang = getLang(filename);
  const m = LANG_META[lang] || LANG_META.plaintext;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      color: m.color, background: C.isDark ? m.darkBg : m.bg, flexShrink: 0,
      letterSpacing: '0.03em',
    }}>{m.label}</span>
  );
}
