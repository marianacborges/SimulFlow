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
  if (/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(u)) {
    throw new Error('Este é o endereço da planilha. Use a URL do app da Web: no Apps Script, Implantar › Gerenciar implantações › copie a URL que começa com https://script.google.com/macros/s/ e termina em /exec');
  }
  if (/^https:\/\/script\.google\.com\//i.test(u) && !/\/exec\/?$/.test(u)) {
    throw new Error('Esta URL do Apps Script não é a do app da Web. Copie a URL em Implantar › Gerenciar implantações (termina em /exec)');
  }
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
  const textoResp = await resp.text().catch(() => '');
  let j;
  try { j = JSON.parse(textoResp); } catch { throw erro(explicarRespostaInvalida(resp, textoResp), 'resposta'); }
  if (!j.ok) throw erro(j.erro || 'Erro na planilha', j.status, j.detalhes);
  return j;
}

/** Quando o Google devolve uma página (HTML) em vez de JSON, diz o motivo provável e mostra o início da resposta. */
export function explicarRespostaInvalida(resp, texto) {
  const t = String(texto || '');
  const limpo = t.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const url = String(resp?.url || '');
  let causa;
  if (resp?.status === 401 || resp?.status === 403 || /accounts\.google\.com|ServiceLogin|Fazer login|Sign in/i.test(url + ' ' + t)) {
    causa = 'O Google pediu login: em Implantar › Gerenciar implantações › editar, deixe "Executar como: Eu" e "Quem pode acessar: Qualquer pessoa" (não "com conta do Google"), escolha "Nova versão" e implante.';
  } else if (/fun[çc][ãa]o de script n[ãa]o encontrada|script function not found/i.test(limpo)) {
    causa = 'A implantação está com uma versão antiga do código: em Implantar › Gerenciar implantações › editar, escolha "Nova versão" e implante.';
  } else if (/autoriza|authoriz/i.test(limpo)) {
    causa = 'O script precisa ser autorizado de novo: no Apps Script, execute a função instalarGatilho e aceite as permissões.';
  } else {
    causa = 'Confira se a URL é a do app da Web (termina em /exec) e se a implantação está com a versão mais nova do código.';
  }
  const trecho = limpo ? ` Resposta do Google (HTTP ${resp?.status ?? '?'}): "${limpo.slice(0, 180)}${limpo.length > 180 ? '…' : ''}"` : ` Resposta vazia do Google (HTTP ${resp?.status ?? '?'}).`;
  return 'Resposta inválida da planilha. ' + causa + trecho;
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
