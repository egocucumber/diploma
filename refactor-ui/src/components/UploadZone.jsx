import { useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';

export default function UploadZone({ C, onUpload, isAnalyzing }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  const handle = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { alert('Поддерживаются только ZIP-архивы'); return; }
    const fd = new FormData();
    fd.append('file', file);
    onUpload(fd);
  };
  return (
    <div
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onClick={() => !isAnalyzing && inputRef.current?.click()}
      style={{
        flex: 1, maxWidth: 420, padding: '8px 14px', borderRadius: 10,
        cursor: isAnalyzing ? 'not-allowed' : 'pointer',
        border: `2px dashed ${drag ? C.accent : C.border}`,
        background: drag ? C.accentLight : C.bg,
        display: 'flex', alignItems: 'center', gap: 9,
        transition: 'all 0.15s', opacity: isAnalyzing ? 0.5 : 1,
      }}
    >
      <FolderOpen size={14} color={C.textMuted} />
      <span style={{ fontSize: 12.5, color: C.textMuted, userSelect: 'none' }}>
        Перетащите ZIP-архив или <span style={{ color: C.accent, fontWeight: 600 }}>выберите файл</span>
      </span>
      <input ref={inputRef} type="file" accept=".zip" hidden onChange={e => handle(e.target.files[0])} />
    </div>
  );
}
