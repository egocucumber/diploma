import { useState } from 'react';

export default function Btn({ children, onClick, disabled, variant = 'default', small, title, style: sx, C, ...rest }) {
  const [hover, setHover] = useState(false);
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: small ? '5px 12px' : '8px 18px',
    borderRadius: 10, fontSize: small ? 12 : 13, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', border: 'none', transition: 'all 0.15s',
    opacity: disabled ? 0.45 : 1,
    ...sx,
  };
  const variants = {
    primary:  { background: hover && !disabled ? C.accentHover : C.accent, color: '#fff', boxShadow: !disabled ? `0 2px 10px ${C.accent}40` : 'none' },
    ghost:    { background: hover && !disabled ? C.accentLight : 'transparent', color: C.textSub, border: `1px solid ${C.border}` },
    success:  { background: hover && !disabled ? '#15803d' : C.success, color: '#fff' },
    danger:   { background: 'transparent', color: hover && !disabled ? C.danger : C.textSub, border: `1px solid ${hover && !disabled ? C.dangerBorder : C.border}` },
    default:  { background: hover && !disabled ? C.accentLight : C.surfaceAlt, color: C.textSub, border: `1px solid ${C.border}` },
  };
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >{children}</button>
  );
}
