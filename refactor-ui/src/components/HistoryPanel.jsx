import { useState, useEffect, useCallback } from 'react';
import { X, History, Loader2, Trash2 } from 'lucide-react';
import { API } from '../theme.js';
import { fmtDate, pluralFiles } from '../utils.js';

export default function HistoryPanel({ C, onClose, onLoad }) {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/history`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setAnalyses(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const del = (id, e) => {
    e.stopPropagation();
    fetch(`${API}/api/history/${id}`, { method: 'DELETE', credentials: 'include' })
      .then(() => setAnalyses(prev => prev.filter(a => a.id !== id)));
  };

  return (
    <div className="fade-in" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: C.overlay, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div className="slide-up" style={{
        width: 440, height: '100vh', background: C.surface,
        borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column',
        boxShadow: C.shadowLg,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={16} color={C.accent} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>История анализов</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex' }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px', display: 'block' }} />
              Загрузка...
            </div>
          ) : analyses.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <History size={36} color={C.border} style={{ margin: '0 auto 14px', display: 'block' }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textSub }}>История пуста</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 5 }}>Запустите первый анализ</div>
            </div>
          ) : analyses.map(a => (
            <div key={a.id} style={{ padding: '14px 20px', borderBottom: `1px solid ${C.borderLight}`, transition: 'background 0.12s' }}
              onMouseEnter={e => e.currentTarget.style.background = C.isDark ? '#1e1e1e' : '#f4fafb'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.repoUrl.replace(/^https?:\/\//, '').replace(/^upload:/, '📦 ')}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                    {fmtDate(a.startedAt)} · {pluralFiles(a.totalFiles)} · {a.resultCount} предложений
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => { onLoad(a.id); onClose(); }}
                    style={{ padding: '5px 12px', fontSize: 11.5, borderRadius: 8, cursor: 'pointer', background: C.accentLight, color: C.accent, border: `1px solid ${C.accent}`, fontWeight: 600, fontFamily: 'inherit' }}
                  >Загрузить</button>
                  <button onClick={e => del(a.id, e)}
                    style={{ padding: '5px 8px', fontSize: 11, borderRadius: 8, cursor: 'pointer', background: 'none', color: C.textMuted, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center' }}
                  ><Trash2 size={12} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
