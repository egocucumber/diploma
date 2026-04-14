import { X, Keyboard } from 'lucide-react';

export default function ShortcutsHelp({ C, onClose }) {
  const shortcuts = [
    ['↑ / ↓', 'Навигация по предложениям'],
    ['A', 'Применить и скачать файл'],
    ['D', 'Отклонить предложение'],
    ['C', 'Скопировать рефакторинг'],
    ['?', 'Открыть/закрыть это окно'],
    ['Escape', 'Закрыть диалог'],
  ];
  return (
    <div className="fade-in" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: C.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="scale-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, padding: 28, minWidth: 360, boxShadow: C.shadowLg }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Keyboard size={16} color={C.accent} />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Горячие клавиши</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, display: 'flex' }}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {shortcuts.map(([key, desc]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <kbd style={{ padding: '4px 10px', borderRadius: 7, fontSize: 12, fontFamily: 'monospace', background: C.accentLight, color: C.accent, border: `1px solid ${C.borderLight}`, fontWeight: 700 }}>{key}</kbd>
              <span style={{ fontSize: 12.5, color: C.textSub }}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
