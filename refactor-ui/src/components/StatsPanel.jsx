import { X, BarChart2 } from 'lucide-react';
import { LANG_META } from '../theme.js';
import { patternRu } from '../utils.js';

export default function StatsPanel({ C, stats, totalFiles, onClose }) {
  const topLangs    = Object.entries(stats.byLang    || {}).sort((a,b) => b[1]-a[1]).slice(0,4);
  const topPatterns = Object.entries(stats.byPattern || {}).sort((a,b) => b[1]-a[1]).slice(0,4);
  return (
    <div className="slide-up" style={{
      margin: '0 12px 10px', borderRadius: 14, background: C.surface,
      border: `1px solid ${C.border}`, boxShadow: C.shadowMd, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: C.accentLight, borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart2 size={14} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>Сводка анализа</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex' }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Файлов проверено',      value: totalFiles,                                       color: C.accent },
          { label: 'Требуют рефакторинга',  value: stats.totalResults,                               color: C.warning },
          { label: 'Средняя уверенность',   value: `${Math.round((stats.avgConfidence||0)*100)}%`,  color: C.success },
          { label: 'Строк сэкономлено',     value: stats.linesSaved > 0 ? `-${stats.linesSaved}` : '~0', color: C.success },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: C.bg }}>
            <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: '-0.03em' }}>{value}</div>
            <div style={{ fontSize: 10.5, color: C.textMuted, marginTop: 3, lineHeight: 1.3 }}>{label}</div>
          </div>
        ))}
      </div>
      {(topLangs.length > 0 || topPatterns.length > 0) && (
        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {topLangs.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 7, letterSpacing: '0.08em' }}>ПО ЯЗЫКУ</div>
              {topLangs.map(([lang, count]) => (
                <div key={lang} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: LANG_META[lang]?.color || C.textMuted, display: 'inline-block' }} />
                    <span style={{ color: C.textSub }}>{LANG_META[lang]?.label || lang}</span>
                  </div>
                  <span style={{ color: C.text, fontWeight: 700 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
          {topPatterns.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 7, letterSpacing: '0.08em' }}>ПО ПАТТЕРНУ</div>
              {topPatterns.map(([pattern, count]) => (
                <div key={pattern} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4 }}>
                  <span style={{ color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>{patternRu(pattern)}</span>
                  <span style={{ color: C.text, fontWeight: 700, flexShrink: 0 }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
