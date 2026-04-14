import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { patternRu } from './utils.js';
import { DiffEditor } from '@monaco-editor/react';
import {
  Play, Loader2, X, Download,
  AlertCircle, GitBranch, FileCode, CheckCircle2, Sparkles, Code2,
  Moon, Sun, History, Upload, Search, BarChart2, Keyboard,
  Copy, Check, ChevronDown, ChevronRight, Info,
  Filter, ArrowDownCircle, Send,
} from 'lucide-react';

import { T, API, LANG_META } from './theme.js';
import { getLang, basename, dirname, pluralFiles } from './utils.js';
import { LangChip } from './components/LangBadge.jsx';
import { FileCard, Skeleton } from './components/FileCard.jsx';
import StatsPanel from './components/StatsPanel.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import ShortcutsHelp from './components/ShortcutsHelp.jsx';
import UploadZone from './components/UploadZone.jsx';
import PushModal from './components/PushModal.jsx';

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ml-refactor-theme') || 'light');
  const C = T[theme];

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(u => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch(`${API}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const [inputMode, setInputMode]     = useState('url');
  const [repoUrl, setRepoUrl]         = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [error, setError]             = useState(null);
  const [progress, setProgress]       = useState({ current: 0, total: 0, file: '', status: '' });
  const [analysisId, setAnalysisId]   = useState(null);
  const [analysisRepoUrl, setAnalysisRepoUrl] = useState('');
  const [totalFiles, setTotalFiles]   = useState(0);
  const [cleanCount, setCleanCount]   = useState(0);
  const [skippedFiles, setSkippedFiles] = useState([]);

  const [historyOpen, setHistoryOpen]     = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pushOpen, setPushOpen]           = useState(false);
  const [showStats, setShowStats]         = useState(false);

  const [searchQuery, setSearchQuery]     = useState('');
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [langFilter, setLangFilter]       = useState(new Set());
  const [groupBy, setGroupBy]             = useState('none');
  const [showFilters, setShowFilters]     = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const [hotFiles, setHotFiles] = useState([]);
  const [copied, setCopied] = useState(false);

  const firstShown = useRef(false);
  const esRef      = useRef(null);

  useEffect(() => { localStorage.setItem('ml-refactor-theme', theme); }, [theme]);

  const stats = useMemo(() => {
    if (!results.length) return null;
    const byLang = {}, byPattern = {};
    let totalConf = 0, linesSaved = 0;
    for (const r of results) {
      const lang = getLang(r.fileName);
      byLang[lang] = (byLang[lang] || 0) + 1;
      byPattern[r.pattern] = (byPattern[r.pattern] || 0) + 1;
      totalConf += r.confidence;
      linesSaved += Math.max(0, (r.linesOriginal || 0) - (r.linesRefactored || 0));
    }
    return { totalResults: results.length, avgConfidence: totalConf / results.length, byLang, byPattern, linesSaved };
  }, [results]);

  const filteredResults = useMemo(() => {
    let r = results;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      r = r.filter(f => f.fileName.toLowerCase().includes(q) || f.pattern.toLowerCase().includes(q));
    }
    if (confidenceMin > 0) r = r.filter(f => f.confidence * 100 >= confidenceMin);
    if (langFilter.size > 0) r = r.filter(f => langFilter.has(getLang(f.fileName)));
    return r;
  }, [results, searchQuery, confidenceMin, langFilter]);

  const groupedResults = useMemo(() => {
    if (groupBy === 'none') return { '': filteredResults };
    const groups = {};
    for (const r of filteredResults) {
      const key = groupBy === 'pattern' ? r.pattern : getLang(r.fileName);
      (groups[key] = groups[key] || []).push(r);
    }
    return groups;
  }, [filteredResults, groupBy]);

  const toggleGroup = key => setCollapsedGroups(prev => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const availableLangs = useMemo(() => {
    const s = new Set();
    results.forEach(r => s.add(getLang(r.fileName)));
    return [...s];
  }, [results]);

  const handleSSEEvent = useCallback((evtName, dataStr) => {
    try {
      const data = JSON.parse(dataStr);
      if (evtName === 'status')   setProgress(v => ({ ...v, status: data.message }));
      else if (evtName === 'total')    { setProgress(v => ({ ...v, total: data.count, status: '' })); setTotalFiles(data.count); }
      else if (evtName === 'progress') setProgress({ current: data.current, total: data.total, file: data.file, status: '' });
      else if (evtName === 'result')   {
        setResults(prev => [...prev, data]);
        if (!firstShown.current) { firstShown.current = true; setSelected(data); }
      }
      else if (evtName === 'done') {
        setIsAnalyzing(false);
        setAnalysisId(data.analysis_id || null);
        setShowStats(true);
        if (data.total_results === 0) setError('В этом репозитории не найдено предложений по рефакторингу.');
      }
      else if (evtName === 'commit_history') { setHotFiles(data.hotFiles || []); }
      else if (evtName === 'clean')         { setCleanCount(v => v + 1); }
      else if (evtName === 'skipped_files') { setSkippedFiles(data.files || []); }
      else if (evtName === 'file_error')    { /* silent — already counted in progress */ }
      else if (evtName === 'error') { setIsAnalyzing(false); setError(data.message || 'Неизвестная ошибка'); }
    } catch { }
  }, []);

  const startScan = () => {
    if (!repoUrl || isAnalyzing) return;
    setIsAnalyzing(true); setError(null); setShowStats(false);
    setResults([]); setSelected(null); setAnalysisId(null); setTotalFiles(0); setHotFiles([]);
    setCleanCount(0); setSkippedFiles([]);
    setAnalysisRepoUrl(repoUrl);
    setProgress({ current: 0, total: 0, file: '', status: '' });
    firstShown.current = false;
    if (esRef.current) esRef.current.close();

    const p = new URLSearchParams({ repoUrl });
    const es = new EventSource(`${API}/api/analyze/stream?${p}`, { withCredentials: true });
    esRef.current = es;
    ['status','total','progress','result','done','error','commit_history','clean','skipped_files','file_error'].forEach(evt => {
      es.addEventListener(evt, e => { if (evt==='done'||evt==='error') es.close(); handleSSEEvent(evt, e.data); });
    });
    es.onerror = () => { es.close(); setIsAnalyzing(false); setError('Нет связи с сервером. Убедитесь, что Go (:8080) и Python (:8001) запущены.'); };
  };

  const startUpload = async (formData) => {
    setIsAnalyzing(true); setError(null); setShowStats(false);
    setResults([]); setSelected(null); setAnalysisId(null); setTotalFiles(0); setHotFiles([]);
    setCleanCount(0); setSkippedFiles([]);
    setAnalysisRepoUrl('');
    setProgress({ current: 0, total: 0, file: '', status: 'Загрузка архива...' });
    firstShown.current = false;
    try {
      const resp = await fetch(`${API}/api/analyze/upload`, { method: 'POST', body: formData, credentials: 'include' });
      if (!resp.ok) { const j = await resp.json().catch(() => ({})); setError(j.error || `Ошибка: ${resp.status}`); setIsAnalyzing(false); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const chunk of parts) {
          let evtName = 'message', dataStr = '';
          for (const line of chunk.split('\n')) {
            if (line.startsWith('event: ')) evtName = line.slice(7).trim();
            if (line.startsWith('data: '))  dataStr = line.slice(6).trim();
          }
          if (dataStr) handleSSEEvent(evtName, dataStr);
        }
      }
    } catch (e) { setError('Ошибка загрузки: ' + e.message); setIsAnalyzing(false); }
  };

  const loadHistory = useCallback((id) => {
    setError(null); setShowStats(false);
    setResults([]); setSelected(null); setAnalysisId(id); setAnalysisRepoUrl('');
    fetch(`${API}/api/history/${id}/results`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data) || !data.length) { setError('Результаты для этого анализа не найдены.'); return; }
        setResults(data); setSelected(data[0]); setTotalFiles(data.length); setShowStats(true);
      })
      .catch(() => setError('Не удалось загрузить результаты из истории.'));
  }, []);

  const accept = useCallback(() => {
    if (!selected) return;
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([selected.refactoredCode], { type: 'text/plain' })),
      download: basename(selected.fileName),
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }, [selected]);

  const dismiss = useCallback(() => {
    if (!selected) return;
    const next = results.filter(r => r.id !== selected.id);
    setResults(next); setSelected(next[0] ?? null);
  }, [selected, results]);

  const copyCode = useCallback(() => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.refactoredCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [selected]);

  const navigate = useCallback((dir) => {
    const idx = filteredResults.findIndex(r => r.id === selected?.id);
    if (idx === -1) return;
    const next = filteredResults[idx + dir];
    if (next) setSelected(next);
  }, [filteredResults, selected]);

  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((shortcutsOpen || historyOpen || pushOpen) && e.key === 'Escape') {
        setShortcutsOpen(false); setHistoryOpen(false); setPushOpen(false); return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); navigate(-1); }
      if (e.key === 'a' || e.key === 'A') accept();
      if (e.key === 'd' || e.key === 'D') dismiss();
      if (e.key === 'c' || e.key === 'C') copyCode();
      if (e.key === '?') setShortcutsOpen(v => !v);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate, accept, dismiss, copyCode, shortcutsOpen, historyOpen, pushOpen]);

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const canPush = !!analysisId && !!analysisRepoUrl;

  const iconBtn = (icon, title, action, disabled = false) => (
    <button key={title} onClick={action} title={title} disabled={disabled}
      style={{
        padding: '7px 9px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
        background: 'none', border: `1px solid ${C.border}`,
        color: disabled ? C.textMuted : C.textSub,
        display: 'flex', alignItems: 'center', transition: 'all 0.15s',
        opacity: disabled ? 0.35 : 1,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.accentLight; e.currentTarget.style.color = C.accent; e.currentTarget.style.borderColor = C.accent; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = disabled ? C.textMuted : C.textSub; e.currentTarget.style.borderColor = C.border; }}
    >{icon}</button>
  );

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <Loader2 size={32} color={C.accent} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="scale-in" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '48px 42px', width: 420, boxShadow: C.shadowLg, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: `0 4px 16px ${C.accent}40` }}>
            <Code2 size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8, letterSpacing: '-0.03em' }}>RefactorAI</h1>
          <p style={{ fontSize: 14, color: C.textSub, marginBottom: 32, lineHeight: 1.5 }}>
            Сервис автоматического рефакторинга кода<br/>на основе ML-анализа паттернов изменений
          </p>
          <a
            href={`${API}/api/auth/github`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '13px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700,
              background: C.isDark ? '#f0f0f0' : '#24292f', color: C.isDark ? '#24292f' : '#fff',
              textDecoration: 'none', transition: 'opacity 0.15s', cursor: 'pointer',
            }}
            onMouseEnter={e => e.target.style.opacity = '0.85'}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Войти через GitHub
          </a>
          <div style={{ marginTop: 24 }}>
            <button
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: C.textSub, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {C.isDark ? <Sun size={13} /> : <Moon size={13} />} {C.isDark ? 'Светлая тема' : 'Тёмная тема'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, fontFamily: 'Inter, system-ui, sans-serif', color: C.text }}>

      <header style={{
        height: 60, background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px',
        flexShrink: 0, boxShadow: C.shadow,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 8px ${C.accent}50` }}>
            <Code2 size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.03em' }}>ML Рефакторинг</span>
        </div>

        <div style={{ width: 1, height: 28, background: C.border, flexShrink: 0 }} />

        <div style={{ display: 'flex', gap: 2, background: C.bg, padding: 3, borderRadius: 10, flexShrink: 0 }}>
          {[{ id: 'url', icon: <GitBranch size={11} />, label: 'URL' }, { id: 'upload', icon: <Upload size={11} />, label: 'ZIP' }].map(m => (
            <button key={m.id} onClick={() => !isAnalyzing && setInputMode(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: isAnalyzing ? 'not-allowed' : 'pointer', border: 'none',
                background: inputMode === m.id ? C.surface : 'transparent',
                color: inputMode === m.id ? C.accent : C.textMuted,
                boxShadow: inputMode === m.id ? C.shadow : 'none',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >{m.icon}{m.label}</button>
          ))}
        </div>

        {inputMode === 'url' ? (
          <>
            <div style={{ flex: 1, position: 'relative', maxWidth: 480 }}>
              <GitBranch size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, pointerEvents: 'none' }} />
              <input
                style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, borderRadius: 10, outline: 'none', fontFamily: 'monospace', background: C.bg, border: `1px solid ${C.border}`, color: C.text, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                placeholder="github.com/owner/repo"
                value={repoUrl} onChange={e => setRepoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && startScan()}
                onFocus={e => { e.target.style.borderColor = C.accent; e.target.style.boxShadow = `0 0 0 3px ${C.accentLight}`; }}
                onBlur={e  => { e.target.style.borderColor = C.border;  e.target.style.boxShadow = 'none'; }}
                disabled={isAnalyzing}
              />
            </div>
            <button onClick={startScan} disabled={isAnalyzing || !repoUrl}
              style={{
                padding: '8px 20px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                cursor: isAnalyzing || !repoUrl ? 'not-allowed' : 'pointer',
                opacity: !repoUrl ? 0.45 : 1,
                background: isAnalyzing ? (C.isDark ? '#2a3a3a' : '#b2dde3') : C.accent,
                border: 'none', color: '#fff', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'background 0.15s', fontFamily: 'inherit',
                boxShadow: repoUrl && !isAnalyzing ? `0 3px 12px ${C.accent}50` : 'none',
              }}
              onMouseEnter={e => { if (!isAnalyzing && repoUrl) e.currentTarget.style.background = C.accentHover; }}
              onMouseLeave={e => { if (!isAnalyzing && repoUrl) e.currentTarget.style.background = C.accent; }}
            >
              {isAnalyzing
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Анализ…</>
                : <><Play size={14} /> Анализировать</>
              }
            </button>
          </>
        ) : (
          <>
            <UploadZone C={C} onUpload={startUpload} isAnalyzing={isAnalyzing} />
            {isAnalyzing && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.accent, flexShrink: 0, fontWeight: 600 }}>
                <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Анализ…
              </div>
            )}
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {canPush && (
            <button onClick={() => setPushOpen(true)}
              style={{ padding: '7px 13px', borderRadius: 10, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, background: C.accentLight, color: C.accent, border: `1px solid ${C.accent}`, fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.accent; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.accentLight; e.currentTarget.style.color = C.accent; }}
            ><Send size={13} /> Git Push</button>
          )}
          {analysisId && (
            <a href={`${API}/api/export/${analysisId}`} download
              style={{ padding: '7px 13px', borderRadius: 10, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, background: C.successBg, color: C.success, border: `1px solid ${C.successBorder}`, transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.success; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.successBg; e.currentTarget.style.color = C.success; }}
            ><ArrowDownCircle size={13} /> Экспорт ZIP</a>
          )}
          <div style={{ width: 1, height: 26, background: C.border }} />
          {iconBtn(<History size={15} />, 'История', () => setHistoryOpen(true))}
          {iconBtn(<BarChart2 size={15} />, 'Статистика', () => setShowStats(v => !v), !stats)}
          {iconBtn(C.isDark ? <Sun size={15} /> : <Moon size={15} />, 'Тема', () => setTheme(t => t === 'light' ? 'dark' : 'light'))}
          {iconBtn(<Keyboard size={15} />, 'Горячие клавиши (?)', () => setShortcutsOpen(true))}
          {user && (
            <>
              <div style={{ width: 1, height: 26, background: C.border }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <img src={user.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${C.border}` }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: C.textSub }}>{user.login}</span>
                <button onClick={handleLogout} title="Выйти"
                  style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: C.textMuted, fontSize: 11, fontFamily: 'inherit', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.dangerBorder; e.currentTarget.style.color = C.danger; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted; }}
                >Выйти</button>
              </div>
            </>
          )}
        </div>
      </header>

      <div style={{ height: 3, background: C.borderLight, flexShrink: 0, overflow: 'hidden', position: 'relative' }}>
        {isAnalyzing && (
          progress.total > 0
            ? <div style={{ height: '100%', width: `${pct}%`, background: C.accent, transition: 'width 0.35s ease', borderRadius: 2 }} />
            : <div className="progress-indeterminate" style={{ height: '100%', background: C.accent, position: 'absolute', borderRadius: 2 }} />
        )}
        {!isAnalyzing && results.length > 0 && (
          <div style={{ height: '100%', width: '100%', background: C.success }} />
        )}
      </div>

      {showStats && stats && (
        <StatsPanel C={C} stats={stats} totalFiles={totalFiles} onClose={() => setShowStats(false)} />
      )}

      {hotFiles.length > 0 && (
        <div style={{ margin: '0 16px 12px', padding: '10px 14px', borderRadius: 8, background: C.cardBg, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <GitBranch size={13} /> Часто изменяемые файлы (история коммитов)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hotFiles.map(f => (
              <span key={f.Name} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: C.accent + '22', color: C.accent, border: `1px solid ${C.accent}44` }}>
                {basename(f.Name)} ×{f.Count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <aside style={{ width: 288, display: 'flex', flexDirection: 'column', background: C.surface, borderRight: `1px solid ${C.border}`, flexShrink: 0 }}>

          {isAnalyzing && (
            <div style={{ padding: '11px 14px', borderBottom: `1px solid ${C.borderLight}`, background: C.accentLight }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Loader2 size={12} color={C.accent} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.accent }}>
                  {progress.status || 'Анализ репозитория…'}
                </span>
              </div>
              {progress.total > 0 && (
                <>
                  <div style={{ height: 4, background: C.isDark ? '#1a2a2a' : '#c5e8ec', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: C.accent, borderRadius: 99, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'monospace' }}>
                      {progress.file ? basename(progress.file) : ''}
                    </span>
                    <span style={{ fontSize: 10.5, color: C.accent, fontWeight: 700, flexShrink: 0 }}>
                      {progress.current}/{progress.total}
                    </span>
                  </div>
                  {(cleanCount > 0 || skippedFiles.length > 0) && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {cleanCount > 0 && (
                        <span style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <CheckCircle2 size={10} color="#22c55e" />
                          {cleanCount} чистых
                        </span>
                      )}
                      {skippedFiles.length > 0 && (
                        <span title={skippedFiles.join('\n')} style={{ fontSize: 10, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 3, cursor: 'help', borderBottom: `1px dashed ${C.textMuted}` }}>
                          <Info size={10} />
                          {skippedFiles.length} пропущено
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <div className="slide-up" style={{ margin: '10px 10px 0', padding: '10px 12px', borderRadius: 10, fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start', background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, color: C.danger, lineHeight: 1.5 }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          {results.length > 0 && (
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ position: 'relative', marginBottom: 7 }}>
                <Search size={11} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, pointerEvents: 'none' }} />
                <input
                  style={{ width: '100%', padding: '6px 9px 6px 27px', fontSize: 12, borderRadius: 8, outline: 'none', fontFamily: 'inherit', background: C.bg, border: `1px solid ${C.border}`, color: C.text, transition: 'border-color 0.15s' }}
                  placeholder="Поиск по файлам и паттернам…"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onFocus={e => e.target.style.borderColor = C.accent}
                  onBlur={e  => e.target.style.borderColor = C.border}
                />
              </div>
              <button onClick={() => setShowFilters(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: showFilters ? C.accent : C.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '1px 0', fontFamily: 'inherit', fontWeight: showFilters ? 600 : 400 }}
              >
                <Filter size={10} />
                {showFilters ? 'Скрыть фильтры' : 'Фильтры и группировка'}
                {(confidenceMin > 0 || langFilter.size > 0 || groupBy !== 'none') && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block' }} />
                )}
              </button>

              {showFilters && (
                <div className="slide-up" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: C.textMuted }}>Мин. уверенность</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent }}>{confidenceMin}%</span>
                    </div>
                    <input type="range" min={0} max={90} step={5} value={confidenceMin}
                      onChange={e => setConfidenceMin(Number(e.target.value))}
                      style={{ width: '100%', accentColor: C.accent }}
                    />
                  </div>
                  {availableLangs.length > 1 && (
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Язык</div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {availableLangs.map(lang => {
                          const active = langFilter.has(lang);
                          const m = LANG_META[lang];
                          return (
                            <button key={lang} onClick={() => setLangFilter(prev => { const n = new Set(prev); active ? n.delete(lang) : n.add(lang); return n; })}
                              style={{ padding: '3px 9px', borderRadius: 99, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', color: m?.color || C.textSub, background: active ? (C.isDark ? m?.darkBg : m?.bg) : C.bg, border: `1px solid ${active ? m?.color : C.border}` }}
                            >{m?.label || lang}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: C.textMuted, marginBottom: 6 }}>Группировка</div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {[{ id: 'none', label: 'Нет' }, { id: 'pattern', label: 'Паттерн' }, { id: 'language', label: 'Язык' }].map(g => (
                        <button key={g.id} onClick={() => setGroupBy(g.id)}
                          style={{ padding: '3px 9px', borderRadius: 7, fontSize: 11, cursor: 'pointer', background: groupBy === g.id ? C.accentLight : C.bg, color: groupBy === g.id ? C.accent : C.textSub, border: `1px solid ${groupBy === g.id ? C.accent : C.border}`, fontFamily: 'inherit', fontWeight: groupBy === g.id ? 700 : 400 }}
                        >{g.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: C.textMuted, letterSpacing: '0.08em' }}>ПРЕДЛОЖЕНИЯ</span>
            {filteredResults.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 99, background: C.accentLight, color: C.accent }}>
                {filteredResults.length}{results.length !== filteredResults.length ? `/${results.length}` : ''}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {isAnalyzing && results.length === 0 && <Skeleton C={C} />}

            {groupBy === 'none'
              ? filteredResults.map(f => <FileCard key={f.id} file={f} isActive={selected?.id === f.id} onClick={() => setSelected(f)} C={C} />)
              : Object.entries(groupedResults).map(([group, files]) => (
                <div key={group}>
                  <button onClick={() => toggleGroup(group)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', background: C.isDark ? '#1a1a1a' : '#f4f9fa', border: 'none', borderTop: `1px solid ${C.borderLight}`, cursor: 'pointer', color: C.textSub, fontSize: 11.5, fontWeight: 700 }}
                  >
                    {collapsedGroups.has(group) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group}</span>
                    <span style={{ fontSize: 10.5, color: C.textMuted }}>{files.length}</span>
                  </button>
                  {!collapsedGroups.has(group) && files.map(f => <FileCard key={f.id} file={f} isActive={selected?.id === f.id} onClick={() => setSelected(f)} C={C} />)}
                </div>
              ))
            }

            {!isAnalyzing && results.length === 0 && !error && (
              <div style={{ padding: '40px 22px', textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, background: C.bg, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                  <FileCode size={26} color={C.border} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.textSub, marginBottom: 5 }}>Нет результатов</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>Введите URL репозитория или загрузите ZIP-архив</div>
              </div>
            )}

            {!isAnalyzing && results.length > 0 && filteredResults.length === 0 && (
              <div style={{ padding: '28px 18px', textAlign: 'center' }}>
                <Filter size={22} color={C.border} style={{ margin: '0 auto 8px', display: 'block' }} />
                <div style={{ fontSize: 12.5, color: C.textMuted }}>Нет файлов по заданным фильтрам</div>
              </div>
            )}
          </div>

          {results.length > 0 && !isAnalyzing && (
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', gap: 7 }}>
              <CheckCircle2 size={13} color={C.success} />
              <span style={{ fontSize: 12, color: C.textSub, fontWeight: 500 }}>
                {pluralFiles(results.length)} готово к проверке
              </span>
            </div>
          )}
        </aside>

        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
          {selected ? (
            <div className="fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: 12, borderRadius: 14, boxShadow: C.shadowMd, border: `1px solid ${C.border}` }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <LangChip filename={selected.fileName} C={C} />
                <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>{basename(selected.fileName)}</span>
                <span style={{ fontSize: 11.5, color: C.textMuted, fontFamily: 'monospace' }}>{dirname(selected.fileName)}</span>
                <span style={{ fontSize: 11.5, color: C.textSub, padding: '3px 9px', borderRadius: 99, background: C.bg, border: `1px solid ${C.border}`, fontWeight: 500 }}>
                  {patternRu(selected.pattern)}
                </span>
                {selected.complexityBefore > 0 && (
                  <span title="Цикломатическая сложность до → после" style={{ fontSize: 11, color: C.textMuted, padding: '3px 9px', borderRadius: 99, background: C.bg, border: `1px solid ${C.border}` }}>
                    CC {selected.complexityBefore}→{selected.complexityAfter}
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
                  <button onClick={copyCode} title="Скопировать (C)"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: copied ? C.successBg : C.bg, color: copied ? C.success : C.textSub, border: `1px solid ${copied ? C.successBorder : C.border}`, fontFamily: 'inherit', transition: 'all 0.15s' }}
                  >{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Скопировано!' : 'Копировать'}</button>
                  <button onClick={dismiss} title="Отклонить (D)"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, borderRadius: 8, cursor: 'pointer', background: C.bg, color: C.textSub, border: `1px solid ${C.border}`, fontFamily: 'inherit', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.dangerBg; e.currentTarget.style.color = C.danger; e.currentTarget.style.borderColor = C.dangerBorder; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textSub; e.currentTarget.style.borderColor = C.border; }}
                  ><X size={13} /> Отклонить</button>
                  <button onClick={accept} title="Применить и скачать (A)"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', boxShadow: `0 2px 8px ${C.accent}50`, fontFamily: 'inherit', transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
                    onMouseLeave={e => e.currentTarget.style.background = C.accent}
                  ><Download size={13} /> Применить и скачать</button>
                </div>
              </div>

              <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.borderLight}`, flexShrink: 0 }}>
                <div style={{ flex: 1, padding: '6px 16px', borderRight: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: C.textMuted, letterSpacing: '0.07em' }}>ОРИГИНАЛ</span>
                  {selected.linesOriginal > 0 && <span style={{ fontSize: 10.5, color: C.textMuted }}>{selected.linesOriginal} строк</span>}
                </div>
                <div style={{ flex: 1, padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Sparkles size={11} color={C.accent} />
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: '0.07em' }}>РЕФАКТОРИНГ</span>
                  {selected.linesRefactored > 0 && <span style={{ fontSize: 10.5, color: C.textMuted }}>{selected.linesRefactored} строк</span>}
                </div>
              </div>

              <div style={{ flex: 1, overflow: 'hidden' }}>
                <DiffEditor
                  original={selected.originalCode}
                  modified={selected.refactoredCode}
                  language={getLang(selected.fileName)}
                  theme={C.monacoTheme}
                  options={{ renderSideBySide: true, readOnly: true, minimap: { enabled: false }, fontSize: 13, lineHeight: 22, padding: { top: 14 }, scrollBeyondLastLine: false, renderLineHighlight: 'gutter', overviewRulerBorder: false, folding: false, fontFamily: 'JetBrains Mono, Fira Code, monospace' }}
                />
              </div>

              {selected.explanation && (
                <div style={{ padding: '10px 16px', background: C.surface, borderTop: `1px solid ${C.borderLight}`, display: 'flex', gap: 9, alignItems: 'flex-start', flexShrink: 0 }}>
                  <Info size={13} color={C.accent} style={{ marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65 }}>{selected.explanation}</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
              <div style={{ width: 72, height: 72, borderRadius: 20, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: C.shadowMd }}>
                <Sparkles size={32} color={C.border} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.textSub, marginBottom: 6, letterSpacing: '-0.02em' }}>
                  {isAnalyzing ? 'Ожидание первого результата…' : 'Выберите файл для просмотра'}
                </div>
                <div style={{ fontSize: 13, color: C.textMuted }}>
                  {isAnalyzing ? 'Результаты появятся здесь по мере анализа' : 'Запустите анализ для поиска возможностей рефакторинга'}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {historyOpen  && <HistoryPanel C={C} onClose={() => setHistoryOpen(false)} onLoad={loadHistory} />}
      {shortcutsOpen && <ShortcutsHelp C={C} onClose={() => setShortcutsOpen(false)} />}
      {pushOpen && <PushModal C={C} analysisId={analysisId} repoUrl={analysisRepoUrl} onClose={() => setPushOpen(false)} />}
    </div>
  );
}
