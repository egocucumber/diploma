import { useState } from 'react';
import { LangDot } from './LangBadge.jsx';
import ConfPill from './ConfPill.jsx';
import { basename, dirname, patternRu } from '../utils.js';

export function FileCard({ file, isActive, onClick, C }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={isActive ? '' : 'slide-up'}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        padding: '11px 14px',
        background: isActive
          ? C.accentLight
          : hover ? (C.isDark ? '#1e1e1e' : '#f0fbfc')
          : 'transparent',
        border: 'none',
        borderLeft: `3px solid ${isActive ? C.accent : 'transparent'}`,
        transition: 'background 0.12s, border-color 0.12s',
        display: 'flex', flexDirection: 'column', gap: 5,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <LangDot filename={file.fileName} />
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 600,
          color: isActive ? C.accent : C.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}>{basename(file.fileName)}</span>
        <ConfPill value={file.confidence} C={C} />
      </div>
      {dirname(file.fileName) && (
        <span style={{ fontSize: 10.5, color: C.textMuted, paddingLeft: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dirname(file.fileName)}
        </span>
      )}
      <div style={{ paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: isActive ? C.accent : C.textMuted, fontStyle: 'italic', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {patternRu(file.pattern)}
        </span>
        {file.linesOriginal > 0 && (
          <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
            {file.linesOriginal}→{file.linesRefactored} стр.
          </span>
        )}
      </div>
    </button>
  );
}

export function Skeleton({ C }) {
  return [65, 80, 50].map((w, i) => (
    <div key={i} style={{ padding: '11px 14px', borderLeft: '3px solid transparent', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.border }} />
        <div style={{ height: 11, borderRadius: 6, background: C.border, width: `${w}%`, animation: 'fadeIn 0.5s ease infinite alternate' }} />
        <div style={{ height: 17, borderRadius: 99, background: C.border, width: 32, marginLeft: 'auto' }} />
      </div>
      <div style={{ height: 9, borderRadius: 6, background: C.borderLight, width: '45%', marginLeft: 16 }} />
    </div>
  ));
}
