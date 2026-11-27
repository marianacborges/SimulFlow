// Contas do SimulFlow na PLANILHA DE USUÁRIOS (apps-script/contas/Contas.gs), separada da planilha da Presença.
// Só usuários e senhas (em hash) são compartilhados, para a mesma conta entrar em qualquer aparelho
// conectado; os outros dados continuam no aparelho. A senha é sempre conferida aqui no navegador.
import { chamar, validarUrl } from './conexao.js';
import { config } from './config.js';

const CHAVE = 'simulflow.contas.conexao';

/** Conexão salva neste aparelho (o host, com token admin): { url, token, perfil, nome, tipo }. */
export function conexaoContasLocal() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; }
}

/** Conexão embutida no site (config/app.json › planilhaUsuarios): token de LEITURA, igual para todos os aparelhos. */
export function conexaoContasEmbutida() {
  const p = config.app?.planilhaUsuarios;
  return p?.url && p?.token ? { url: p.url, token: p.token, perfil: 'leitura', tipo: 'contas', nome: 'Site' } : null;
}

/** Conexão em uso: a do aparelho (host) ou, se não houver, a embutida no site. */
export function conexaoContas() {
  const local = conexaoContasLocal();
  return local?.tipo === 'contas' ? local : conexaoContasEmbutida();
}

export function salvarConexaoContas(c) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { throw new Error('Não foi possível guardar a conexão neste navegador'); }
}

export function limparConexaoContas() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem acesso */ }
}

export const podeContas = c => !!c && c.tipo === 'contas' && ['leitura', 'aparelho', 'admin'].includes(c.perfil);
export const podeGravarContas = c => podeContas(c) && ['aparelho', 'admin'].includes(c.perfil);
export const adminContas = c => podeContas(c) && c.perfil === 'admin';

/** Prova de senha usada na troca da própria senha: SHA-256 de "login:senha" (só a planilha guarda, nunca devolve). */
export async function verificador(login, senha) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(login || '').trim().toLowerCase() + ':' + String(senha || '')));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Host (token admin): grava o verificador da senha que acabou de definir ou com que entrou. */
export async function registrarVerificador(login, senha, con = conexaoContas()) {
  if (!adminContas(con)) return false;
  await chamar('contas.verificador', { login, verificador: await verificador(login, senha) }, con);
  return true;
}

/**
 * Leva para a planilha a troca da própria senha feita neste aparelho (o usuário já com a credencial nova).
 * Com token de leitura, prova a senha atual; com token aparelho/admin, envia a conta e o verificador novo.
 */
export async function trocarSenhaNaPlanilha(store, usuario, senhaAtual, senhaNova, con = conexaoContas()) {
  if (!podeContas(con) || !usuario) return false;
  if (podeGravarContas(con)) {
    await enviarContas(store, con, true);
    if (adminContas(con)) await registrarVerificador(usuario.login, senhaNova, con);
    return true;
  }
  await chamar('contas.senha', {
    login: usuario.login, prova: await verificador(usuario.login, senhaAtual), credencial: usuario.credencial,
    verificador: await verificador(usuario.login, senhaNova), atualizadoEm: usuario.atualizadoEm,
  }, con);
  return true;
}

/** Testa URL + token da planilha de usuários (recusa a URL da planilha da Presença). */
export async function testarConexaoContas(url, token) {
  const base = { url: validarUrl(url), token: String(token || '').trim() };
  if (!base.token) throw new Error('Informe o token de acesso');
  const st = await chamar('status', {}, base);
  const c = { ...base, perfil: st.perfil, nome: st.nome, tipo: st.tipo };
  if (st.tipo !== 'contas' || !podeContas(c)) {
    throw new Error('Esta URL ou token não é da planilha de usuários. Use a URL e o token gerados na planilha de usuários (menu SimulFlow Contas), não os da Presença.');
  }
  return c;
}

const comLimite = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('A planilha de usuários demorou para responder')), ms))]);

/** Traz as contas da planilha para este aparelho. Devolve quantas mudaram. */
export async function puxarContas(store, con = conexaoContas(), limiteMs = 10000) {
  if (!podeContas(con)) return 0;
  const r = await comLimite(chamar('contas.listar', {}, con), limiteMs);
  return store.mesclarUsuarios(r.usuarios || []);
}

const enviado = new WeakMap();
let ultimoEnvio = null;
export const ultimaSincronizacao = () => ultimoEnvio;

/** Envia as contas deste aparelho (a planilha guarda só o que for mais novo). */
export async function enviarContas(store, con = conexaoContas(), forcar = false) {
  if (!podeGravarContas(con)) return false;
  const usuarios = store.todos('usuarios');
  if (!usuarios.length) return false;
  const json = JSON.stringify(usuarios);
  if (!forcar && enviado.get(store) === json) return false;
  await chamar('contas.salvar', { usuarios }, con);
  enviado.set(store, json);
  ultimoEnvio = new Date();
  return true;
}

/** Envia as contas sempre que algo mudar neste aparelho (cadastro, edição, troca de senha) e ao voltar a internet. */
export function ligarEnvioContas(store) {
  let timer = null;
  const agendar = () => { clearTimeout(timer); timer = setTimeout(() => enviarContas(store).catch(() => {}), 800); };
  const desligar = store.assinar(agendar);
  globalThis.addEventListener?.('online', agendar);
  agendar();
  return () => { desligar(); globalThis.removeEventListener?.('online', agendar); clearTimeout(timer); };
}

/** Acessos da planilha de usuários (só com token admin). */
export const listarAcessosContas = () => chamar('acessos.listar', {}, conexaoContas()).then(r => r.acessos);
export const criarAcessoContas = (nome, perfil) => chamar('acessos.criar', { nome, perfil }, conexaoContas()).then(r => r.acesso);
export const revogarAcessoContas = id => chamar('acessos.revogar', { id }, conexaoContas());
