// Utilitários gerais (sem acesso ao DOM no carregamento: podem ser importados pelo node nos testes).

/** Data local de hoje em AAAA-MM-DD (não usa UTC, para não "virar o dia" à noite). */
export function hoje(agora = new Date()) {
  const d = new Date(agora);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(dia, n) {
  const d = new Date(dia + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return hoje(d);
}

/** Número do dia (para diferenças em dias inteiros). */
export function numeroDia(dia) {
  return Date.parse(String(dia).slice(0, 10) + 'T00:00:00Z') / 86400000;
}

export function diasEntre(inicio, fim) {
  return numeroDia(fim) - numeroDia(inicio);
}

export function agoraISO() {
  return new Date().toISOString();
}

/** dd/mm/aaaa a partir de AAAA-MM-DD ou ISO. */
export function data(valor) {
  if (!valor) return '—';
  const s = String(valor);
  if (s.length <= 10) return s.slice(0, 10).split('-').reverse().join('/');
  return new Date(s).toLocaleDateString('pt-BR');
}

export function hora(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR');
}

export function numero(n, casas = 1) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

/** Identificador único curto. */
export function uid(prefixo = '') {
  const r = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefixo + r;
}

export function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

/** Busca sem acento/maiúsculas, por vários termos (todos precisam aparecer). */
export function combinaTexto(consulta, valores) {
  const texto = normalizar((valores || []).filter(v => v !== undefined && v !== null && v !== '').join(' '));
  return normalizar(consulta).trim().split(/\s+/).filter(Boolean).every(t => texto.includes(t));
}

export function porCampo(campo, desc = false) {
  return (a, b) => {
    const x = a?.[campo] ?? '', y = b?.[campo] ?? '';
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true });
    return desc ? -r : r;
  };
}

export function unicos(lista) {
  return [...new Set(lista.filter(v => v !== undefined && v !== null && v !== ''))];
}

export function clonar(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

export function iniciais(nome) {
  return String(nome || '?').split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

export function limitar(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
