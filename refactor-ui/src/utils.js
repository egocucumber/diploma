import { LANG_MAP } from './theme.js';

const PATTERN_RU = {
  'Empty Catch Block':    'Пустой блок catch',
  'Deep Nesting':         'Глубокая вложенность',
  'God Function':         'Функция-бог',
  'Long Method':          'Длинный метод',
  'Long Parameter List':  'Длинный список параметров',
  'Magic Numbers':        'Магические числа',
  'Dead Code':            'Мёртвый код',
  'Commented-Out Code':   'Закомментированный код',
  'Redundant Code':       'Избыточный код',
  'High Complexity':      'Высокая сложность',
  'Clean Code':           'Чистый код',
  'Duplicate Code':       'Дублирование кода',
  'Too Many Returns':     'Много точек выхода',
  'Large Class':          'Большой класс',
  'Inconsistent Naming':  'Несогласованные имена',
  'Feature Envy':         'Зависть к чужим данным',
};

export function patternRu(p) {
  return PATTERN_RU[p] || p;
}

export function getLang(f) {
  return f ? (LANG_MAP[f.split('.').pop().toLowerCase()] || 'plaintext') : 'plaintext';
}

export function basename(f) { return f ? f.split(/[/\\]/).pop() : ''; }

export function dirname(f) {
  const parts = f ? f.split(/[/\\]/) : [];
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

export function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('ru-RU'); } catch { return iso; }
}

export function pluralFiles(n) {
  if (n % 10 === 1 && n % 100 !== 11) return `${n} файл`;
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return `${n} файла`;
  return `${n} файлов`;
}
