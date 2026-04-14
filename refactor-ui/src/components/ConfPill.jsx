export default function ConfPill({ value, C }) {
  const pct = Math.round(value * 100);
  const [color, bg, border] =
    pct >= 75 ? [C.success, C.successBg, C.successBorder]
    : pct >= 50 ? [C.warning, C.warningBg, C.warningBorder]
    : [C.danger, C.dangerBg, C.dangerBorder];
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 99,
      color, background: bg, border: `1px solid ${border}`, flexShrink: 0,
    }}>{pct}%</span>
  );
}
