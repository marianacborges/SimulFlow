// Conexão deste aparelho com a planilha Google (URL do app da Web do Apps Script + token de acesso).
// Fica no localStorage do aparelho; o token define o perfil: leitor, planejamento ou admin.

const CHAVE = 'simulflow.presenca.conexao';

export function conexao() {
  try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; }
}

export function salvarConexao(c) {
  try { localStorage.setItem(CHAVE, JSON.stringify(c)); } catch { throw new Error('Não foi possível guardar a conexão neste navegador'); }
}

export function limparConexao() {
  try { localStorage.removeItem(CHAVE); } catch { /* sem acesso */ }
}

export function validarUrl(url) {
  const u = String(url || '').trim();
  if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(u)) return u;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(u)) return u; // emulador local (node tools/simulflow.js emular-planilha)
  if (/^https:\/\//.test(u)) return u;
  throw new Error('Informe a URL do app da Web (https://script.google.com/macros/s/…/exec)');
}

function erro(mensagem, status, detalhes) {
  const e = new Error(mensagem);
  e.status = status;
  e.detalhes = detalhes;
  return e;
}

/** Chama a API da planilha. Usa text/plain para não exigir preflight de CORS no Apps Script. */
export async function chamar(acao, dados = {}, con = conexao()) {
  if (!con?.url || !con?.token) throw erro('Conexão com a planilha não configurada neste aparelho', 'sem-conexao');
  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), 30000);
  let resp;
  try {
    resp = await fetch(con.url, {
      method: 'POST', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...dados, acao, token: con.token }),
    });
  } catch (e) {
    throw erro(e.name === 'AbortError' ? 'A planilha demorou demais para responder' : 'Sem conexão com a planilha Google', 'rede');
  } finally {
    clearTimeout(limite);
  }
  let j;
  try { j = await resp.json(); } catch { throw erro('Resposta inválida da planilha. Confira se a URL é a do app da Web (termina em /exec).', 'resposta'); }
  if (!j.ok) throw erro(j.erro || 'Erro na planilha', j.status, j.detalhes);
  return j;
}

/** Testa URL + token e devolve o status (perfil, nome do acesso, turno). */
export async function testarConexao(url, token) {
  const c = { url: validarUrl(url), token: String(token || '').trim() };
  if (!c.token) throw new Error('Informe o token de acesso');
  const st = await chamar('status', {}, c);
  return { ...c, perfil: st.perfil, nome: st.nome, planilhaUrl: st.planilhaUrl || '' };
}

export const podePlanejar = c => !!c && ['planejamento', 'admin'].includes(c.perfil);
export const ehAdminPlanilha = c => !!c && c.perfil === 'admin';

/** Link para configurar o celular de uma vez (o token vai no fragmento, que não é enviado a servidores). */
export function linkCelular(url, token) {
  const base = new URL('leitura.html', location.href);
  base.hash = new URLSearchParams({ url, token }).toString();
  return base.href;
}
