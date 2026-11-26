// Autenticação do PROTÓTIPO.
// ATENÇÃO: tudo roda no navegador. O hash PBKDF2 (Web Crypto) evita guardar senhas em texto,
// mas NÃO substitui autenticação em servidor: quem tem acesso ao computador/navegador pode
// ler ou apagar os dados do localStorage. Para uso real é preciso servidor, banco de dados,
// HTTPS, senhas verificadas no servidor e adequação à LGPD.
import { config } from './config.js';

const CHAVE_SESSAO = 'simulflow.sessao';
const CHAVE_TENTATIVAS = 'simulflow.tentativas';
const ITERACOES = 120000;

const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export function normalizarLogin(login) {
  return String(login || '').trim().toLowerCase();
}

export function validarSenha(senha) {
  const min = config.app.senhaMinima || 8;
  if (String(senha || '').length < min) throw new Error(`A senha precisa ter pelo menos ${min} caracteres`);
}

/** Gera {salt, hash, iteracoes} com PBKDF2-SHA256. */
export async function gerarCredencial(senha) {
  if (!globalThis.crypto?.subtle) throw new Error('Este navegador não oferece Web Crypto (abra por http://localhost ou https)');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, salt, ITERACOES);
  return { salt: b64(salt), hash, iteracoes: ITERACOES, alg: 'PBKDF2-SHA256' };
}

async function derivar(senha, salt, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iteracoes }, chave, 256);
  return b64(bits);
}

export async function conferirSenha(senha, credencial) {
  if (!credencial?.salt || !credencial?.hash) return false;
  const h = await derivar(senha, deB64(credencial.salt), credencial.iteracoes || ITERACOES);
  // comparação em tempo constante
  if (h.length !== credencial.hash.length) return false;
  let dif = 0;
  for (let i = 0; i < h.length; i++) dif |= h.charCodeAt(i) ^ credencial.hash.charCodeAt(i);
  return dif === 0;
}

// ---------- Bloqueio por tentativas ----------

function lerTentativas() {
  try { return JSON.parse(localStorage.getItem(CHAVE_TENTATIVAS) || '{}'); } catch { return {}; }
}
function gravarTentativas(t) {
  try { localStorage.setItem(CHAVE_TENTATIVAS, JSON.stringify(t)); } catch { /* sem acesso */ }
}

export function bloqueadoAte(login) {
  const t = lerTentativas()[normalizarLogin(login)];
  return t?.ate && t.ate > Date.now() ? t.ate : 0;
}

function registrarFalha(login) {
  const todas = lerTentativas();
  const k = normalizarLogin(login);
  const t = todas[k] && !(todas[k].ate && todas[k].ate <= Date.now()) ? todas[k] : { n: 0 };
  t.n = (t.n || 0) + 1;
  if (t.n >= (config.app.tentativasLogin || 5)) { t.ate = Date.now() + (config.app.bloqueioMinutos || 15) * 60000; t.n = 0; }
  todas[k] = t;
  gravarTentativas(todas);
}

function limparFalhas(login) {
  const todas = lerTentativas();
  delete todas[normalizarLogin(login)];
  gravarTentativas(todas);
}

// ---------- Login / sessão ----------

/** Confere login e senha. Mensagem genérica para não revelar se o usuário existe. */
export async function entrar(store, login, senha) {
  const ate = bloqueadoAte(login);
  if (ate) throw new Error(`Muitas tentativas. Tente novamente às ${new Date(ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`);
  const u = store.achar('usuarios', x => x.login === normalizarLogin(login));
  const ok = u ? await conferirSenha(senha, u.credencial) : false;
  if (!ok || !u.ativo) {
    registrarFalha(login);
    throw new Error(u && ok && !u.ativo ? 'Usuário desativado. Procure o host.' : 'Não foi possível entrar. Verifique usuário e senha.');
  }
  limparFalhas(login);
  gravarSessao({ id: u.id, ultimoUso: Date.now() });
  return u;
}

function gravarSessao(s) {
  try { sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch { /* sem acesso */ }
}

export function iniciarSessao(u) {
  gravarSessao({ id: u.id, ultimoUso: Date.now() });
}

/** Usuário da sessão atual (ou null se expirou por inatividade, foi desativado ou não existe). */
export function usuarioDaSessao(store) {
  let s;
  try { s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null'); } catch { s = null; }
  if (!s) return null;
  const limite = (config.app.sessaoMinutos || 30) * 60000;
  if (Date.now() - s.ultimoUso > limite) { sair(); return null; }
  const u = store.obter('usuarios', s.id);
  if (!u || !u.ativo) { sair(); return null; }
  return u;
}

let ultimoToque = 0;
export function tocarSessao() {
  const agora = Date.now();
  if (agora - ultimoToque < 15000) return;
  ultimoToque = agora;
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) || 'null');
    if (s) gravarSessao({ ...s, ultimoUso: agora });
  } catch { /* sem acesso */ }
}

export function sair() {
  try {
    sessionStorage.removeItem(CHAVE_SESSAO);
    for (const k of Object.keys(sessionStorage)) if (k.startsWith('simulflow.filtros')) sessionStorage.removeItem(k);
  } catch { /* sem acesso */ }
}
