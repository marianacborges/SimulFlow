// Contas do SimulFlow na PLANILHA DE USUÁRIOS (apps-script/contas/Contas.gs), separada da planilha da Presença.
// Só usuários e senhas (em hash) são compartilhados, para a mesma conta entrar em qualquer aparelho
// conectado; os outros dados continuam no aparelho. A senha é sempre conferida aqui no navegador.
import { chamar, validarUrl } from './conexao.js';

const CHAVE = 'simulflow.contas.conexao';

/** Conexão deste aparelho com a planilha de usuários: { url, token, perfil (aparelho|admin), nome }. */
export function conexaoContas() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; }
}

export function salvarConexaoContas(c) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { throw new Error('Não foi possível guardar a conexão neste navegador'); }
}

export function limparConexaoContas() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem acesso */ }
}

export const podeContas = c => !!c && c.tipo === 'contas' && ['aparelho', 'admin'].includes(c.perfil);
export const adminContas = c => !!c && c.perfil === 'admin';

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
  if (!podeContas(con)) return false;
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
