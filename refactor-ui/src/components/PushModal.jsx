import { useState } from 'react';
import { X, Send, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { API } from '../theme.js';

export default function PushModal({ C, analysisId, repoUrl, onClose }) {
  const [branch, setBranch]   = useState('refactor/ml-suggestions');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState(null);

  const doPush = async () => {
    setLoading(true); setErr(null); setResult(null);
    try {
      const resp = await fetch(`${API}/api/push`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, repoUrl, branch }),
      });
      const data = await resp.json();
      if (!resp.ok) setErr(data.error || 'Неизвестная ошибка');
      else setResult(data.branch);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="scale-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 28, width: 440, boxShadow: C.shadowLg }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Send size={16} color={C.accent} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Отправить в GitHub</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex' }}><X size={16} /></button>
        </div>

        {result ? (
          <div className="scale-in">
            <div style={{ padding: 18, borderRadius: 12, background: C.successBg, border: `1px solid ${C.successBorder}`, marginBottom: 18 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle2 size={18} color={C.success} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontWeight: 700, color: C.success, fontSize: 14, marginBottom: 5 }}>Успешно отправлено!</div>
                  <div style={{ fontSize: 12.5, color: C.textSub }}>
                    Создана ветка <code style={{ background: C.accentLight, padding: '1px 6px', borderRadius: 5, color: C.accent, fontSize: 12 }}>{result}</code>
                  </div>
                  <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6 }}>
                    Откройте Pull Request на GitHub для проверки изменений
                  </div>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ width: '100%', padding: '11px', borderRadius: 10, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 7, display: 'block', letterSpacing: '0.04em' }}>НАЗВАНИЕ ВЕТКИ</label>
              <input
                value={branch} onChange={e => setBranch(e.target.value)}
                style={{ width: '100%', padding: '10px 13px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: 'none', fontFamily: 'monospace', transition: 'border-color 0.15s' }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border}
              />
            </div>
            <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10, background: C.accentLight, border: `1px solid ${C.border}`, fontSize: 12, color: C.textSub, display: 'flex', gap: 8, alignItems: 'center' }}>
              <CheckCircle2 size={14} color={C.success} />
              <span>Будет использован токен из вашей GitHub-авторизации</span>
            </div>
            {err && (
              <div style={{ marginBottom: 16, padding: '11px 13px', borderRadius: 10, background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger, fontSize: 12.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{err}</span>
              </div>
            )}
            <button
              onClick={doPush}
              disabled={loading || !branch}
              style={{
                width: '100%', padding: '12px', borderRadius: 10,
                background: !branch ? C.border : C.accent,
                color: !branch ? C.textMuted : '#fff',
                border: 'none', cursor: loading || !branch ? 'not-allowed' : 'pointer',
                fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.15s',
              }}
            >
              {loading
                ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />Отправка…</>
                : <><Send size={15} />Отправить в ветку</>
              }
            </button>
          </>
        )}
      </div>
    </div>
  );
}
