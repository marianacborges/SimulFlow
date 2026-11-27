// Inicialização do SimulFlow: configuração, dados, sessão, shell (menu/topo) e roteador de abas.
import { carregarConfig, config } from './core/config.js';
import { criarStore } from './data/store.js';
import { criarAdaptadorLocal } from './data/adapters/local.js';
import { aoPoderInstalar, instalarApp } from './core/instalar.js';
import { escolherJSON } from './core/exportar.js';
import { criarAcoes } from './data/acoes/index.js';
import { dadosDemonstracao } from './data/demo.js';
import { atualizarDemonstracaoSePreciso } from './data/acoes/dados.js';
import * as auth from './core/auth.js';
import { pode, regrasAcesso, ehHost } from './core/permissoes.js';
import { criarRoteador } from './core/router.js';
import { assinar } from './core/eventos.js';
import { aplicarTema, alternarTema, temaEfetivo } from './core/tema.js';
import { html, ic, toast, modal, campo } from './core/ui.js';
import { iniciais, combinaTexto } from './core/util.js';
import { combinaOP, statusExibidoOP, statusExibidoFA } from './data/regras.js';

const raiz = document.getElementById('raiz');
let store, acoes, roteador, usuario = null;

function usuarioAtual() {
  // Relê do store para refletir alterações (ex.: host mudou permissões).
  return usuario ? store.obter('usuarios', usuario.id) || null : null;
}

function contexto() {
  const u = usuarioAtual();
  return {
    usuario: u, store, acoes, config,
    pode: (aba, editar = false) => pode(u, aba, editar),
    regra: (nome, ...args) => !!regrasAcesso[nome]?.(u, ...args),
    host: ehHost(u),
  };
}

async function iniciar() {
  try {
    await carregarConfig();
  } catch (e) {
    raiz.innerHTML = String(html`<main class="auth-page"><div class="auth-card"><h1>Não foi possível iniciar</h1>
      <p>${e.message}.</p><p>Os navegadores bloqueiam módulos JavaScript abertos direto do disco (file://). Rode <code>node tools/simulflow.js servir</code> e abra o endereço mostrado, ou gere o arquivo único com <code>node tools/simulflow.js empacotar</code>.</p></div></main>`);
    return;
  }
  document.title = config.app.nome;
  limparModoPlanilha();
  store = criarStore(criarAdaptadorLocal());
  const existia = store.carregar();
  if (!existia) await primeiraCarga();
  else atualizarDemonstracaoSePreciso(store);
  acoes = criarAcoes(store, usuarioAtual);
  store.adaptador.observarExterno(() => store.recarregar());
  store.assinar(() => {
    if (usuario && !auth.usuarioDaSessao(store)) { encerrar('Sua sessão foi encerrada.'); return; }
    atualizarShell();
    roteador?.atualizar();
  });
  ['click', 'keydown', 'pointerdown'].forEach(t => document.addEventListener(t, () => auth.tocarSessao(), { passive: true }));
  setInterval(() => { if (usuario && !auth.usuarioDaSessao(store)) encerrar('Sessão encerrada após período sem uso.'); }, 30000);
  telaInicial();
}

/** Remove o que sobrou do modo "dados na planilha" (retirado): os dados voltam a ficar só no navegador. */
function limparModoPlanilha() {
  for (const k of ['simulflow.modo', 'simulflow.dados.planilha', 'simulflow.dados.planilha.meta', 'simulflow.dados.planilha.fila']) {
    try { localStorage.removeItem(k); } catch { /* sem acesso */ }
  }
}

/** Primeiro uso neste navegador: usa data/dados-iniciais.json (instalado pelo CLI) ou a demonstração. */
async function primeiraCarga() {
  try {
    const r = await fetch('data/dados-iniciais.json', { cache: 'no-cache' });
    if (r.ok) { store.importar(await r.json()); return; }
  } catch { /* sem arquivo inicial: segue com a demonstração */ }
  store.substituir(dadosDemonstracao());
}

function telaInicial(mensagem = '') {
  if (store.todos('usuarios').length === 0) return telaCriarHost();
  usuario = auth.usuarioDaSessao(store);
  if (!usuario) return telaLogin(mensagem);
  if (usuario.trocarSenha) return telaTrocarSenha(true);
  montarShell();
}

function encerrar(msg) {
  auth.sair();
  usuario = null;
  roteador?.parar();
  roteador = null;
  telaLogin(msg);
}

// ---------------- Telas de acesso ----------------

function marca() {
  return html`<div class="auth-brand"><img src="favicon.png" alt="" width="56" height="56"><div><strong>${config.app.nome}</strong><span>${config.app.subtitulo}</span></div></div>`;
}

function campoSenha(nome, rotulo, auto = 'current-password') {
  return html`<label class="field"><span class="field-label">${rotulo}</span><div class="pwd"><input name="${nome}" type="password" autocomplete="${auto}" required>
    <button type="button" class="btn ghost icon" data-olho aria-label="Mostrar senha" title="Mostrar senha" aria-pressed="false">${ic('eye')}</button></div></label>`;
}

function ligarOlhos(el) {
  el.querySelectorAll('[data-olho]').forEach(b => b.addEventListener('click', () => {
    const input = b.parentElement.querySelector('input');
    const mostrar = input.type === 'password';
    input.type = mostrar ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(mostrar));
    b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
    b.title = b.getAttribute('aria-label');
    b.innerHTML = String(ic(mostrar ? 'eyeOff' : 'eye'));
  }));
}

function telaAcesso(conteudo, aoEnviar) {
  raiz.innerHTML = String(html`<main class="auth-page"><div class="auth-card">${marca()}${conteudo}</div></main>`);
  const form = raiz.querySelector('form');
  ligarOlhos(raiz);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const erro = form.querySelector('[role=alert]');
    const btn = form.querySelector('[type=submit]');
    erro.textContent = '';
    btn.disabled = true;
    try { await aoEnviar(Object.fromEntries(new FormData(form))); } catch (err) { erro.textContent = err.message; } finally { btn.disabled = false; }
  });
  form.querySelector('input:not([readonly])')?.focus();
}

function telaCriarHost() {
  telaAcesso(html`<h1>Primeiro acesso</h1>
    <form class="auth-form" novalidate>
      ${campo('Usuário (login)', html`<input name="login" required autocomplete="username">`)}
      ${campo('Nome', html`<input name="nome" required autocomplete="name" maxlength="100">`)}
      ${campoSenha('senha', 'Senha', 'new-password')}${campoSenha('confirmacao', 'Confirmar senha', 'new-password')}
      <p role="alert" class="error"></p><button class="btn primario full" type="submit">Entrar</button>
      <button class="btn ghost full" type="button" data-ja-tenho>Já tenho conta em outro aparelho</button></form>`,
  async d => {
    if (!d.login.trim() || !d.nome.trim()) throw new Error('Informe usuário e nome');
    auth.validarSenha(d.senha);
    if (d.senha !== d.confirmacao) throw new Error('As senhas não conferem');
    const credencial = await auth.gerarCredencial(d.senha);
    const host = acoes.usuarios.criarHost({ login: d.login, nome: d.nome, credencial });
    auth.iniciarSessao(host);
    telaInicial();
  });
  raiz.querySelector('[data-ja-tenho]').addEventListener('click', telaJaTenhoConta);
}

/**
 * "Já tenho conta em outro aparelho": as contas ficam no aparelho onde foram criadas, então trazemos
 * o backup exportado no outro aparelho (contas + dados). Depois é só entrar com o mesmo usuário e senha.
 */
function telaJaTenhoConta() {
  telaAcesso(html`<h1>Já tenho conta</h1>
    <form class="auth-form" novalidate>
      <p>Traga o backup do aparelho onde você já usa o SimulFlow.</p>
      <ol class="passos-conta">
        <li>No outro aparelho, o host abre <strong>Configurações › Dados e backup › Exportar JSON completo</strong>.</li>
        <li>Envie o arquivo para este aparelho (e-mail, WhatsApp, pendrive…).</li>
        <li>Toque em <strong>Escolher arquivo de backup</strong> e selecione o arquivo.</li>
      </ol>
      <p class="muted small">Vêm as contas e todos os dados como estavam no backup. Depois disso, cada aparelho segue com a sua cópia.</p>
      <p role="alert" class="error"></p>
      <button class="btn primario full" type="submit">Escolher arquivo de backup</button>
      <button class="btn ghost full" type="button" data-voltar>Voltar para o primeiro acesso</button></form>`,
  async () => {
    const pacote = await escolherJSON();
    store.importar(pacote);
    toast('Backup importado: entre com o seu usuário e senha');
    telaLogin();
  });
  raiz.querySelector('[data-voltar]').addEventListener('click', telaCriarHost);
}

function telaLogin(mensagem = '') {
  telaAcesso(html`<h1>Entrar</h1>
    <form class="auth-form" novalidate>
      ${campo('Usuário', html`<input name="login" required autocomplete="username">`)}
      ${campoSenha('senha', 'Senha')}
      <p role="alert" class="error">${mensagem}</p><button class="btn primario full" type="submit">Entrar</button>
      <p class="muted small">Esqueceu a senha? Peça ao host para definir uma senha provisória.</p></form>`,
  async d => {
    await auth.entrar(store, d.login, d.senha);
    telaInicial();
  });
}

function telaTrocarSenha(obrigatoria) {
  telaAcesso(html`<h1>Definir nova senha</h1><p class="muted">${obrigatoria ? 'Sua senha foi definida pelo host. Crie uma senha pessoal para continuar.' : ''}</p>
    <form class="auth-form" novalidate>${campoSenha('senha', 'Nova senha', 'new-password')}${campoSenha('confirmacao', 'Confirmar nova senha', 'new-password')}
    <p role="alert" class="error"></p><button class="btn primario full" type="submit">Salvar senha</button>
    <button class="btn ghost full" type="button" data-sair>Sair</button></form>`,
  async d => {
    auth.validarSenha(d.senha);
    if (d.senha !== d.confirmacao) throw new Error('As senhas não conferem');
    acoes.usuarios.definirSenha({ id: usuario.id, credencial: await auth.gerarCredencial(d.senha) });
    toast('Senha alterada');
    telaInicial();
  });
  raiz.querySelector('[data-sair]').addEventListener('click', () => encerrar(''));
}

function alterarMinhaSenha() {
  modal({
    titulo: 'Alterar minha senha', descricao: usuario.nome,
    corpo: html`<div class="form-grid">${campoSenha('atual', 'Senha atual')}${campoSenha('senha', 'Nova senha', 'new-password')}${campoSenha('confirmacao', 'Confirmar nova senha', 'new-password')}</div>`,
    aoMontar: f => ligarOlhos(f),
    onOk: async d => {
      if (!(await auth.conferirSenha(d.atual, usuarioAtual().credencial))) throw new Error('Senha atual incorreta');
      auth.validarSenha(d.senha);
      if (d.senha !== d.confirmacao) throw new Error('As senhas não conferem');
      acoes.usuarios.definirSenha({ id: usuario.id, credencial: await auth.gerarCredencial(d.senha) });
      toast('Senha alterada');
    },
  });
}

// ---------------- Shell ----------------

let tituloAtual = '';

function montarShell() {
  raiz.innerHTML = String(html`<div class="app-shell" id="shell">
    <aside class="sidebar" aria-label="Menu principal">
      <a href="#/" class="brand"><span class="brand-mark">${ic('workflow', 22)}</span><span class="brand-text"><strong>${config.app.nome}</strong><span class="brand-sub">${config.app.subtitulo}</span></span></a>
      <div class="nav-caption">ÁREA DE TRABALHO</div><nav class="nav-list" id="nav"></nav>
      <div class="sidebar-bottom"><div class="connection"><i class="live-dot"></i>Setores conectados</div><div class="sidebar-footer">${config.app.nome} · v${config.app.versao}</div></div>
    </aside>
    <div class="workspace"><header class="topbar">
      <div class="breadcrumbs"><button class="btn ghost icon mobile-menu" data-menu aria-label="Abrir menu" title="Abrir menu">${ic('menu')}</button>
        <button class="btn ghost icon hide-small" data-recolher title="Recolher ou expandir menu" aria-label="Recolher ou expandir menu">${ic('collapse')}</button>
        <span>Área de trabalho</span>${ic('chevronRight', 12)}<strong id="titulo-aba"></strong></div>
      <div class="top-actions"><div class="top-search">${ic('search')}<input id="busca-geral" type="search" placeholder="Buscar OP, FA ou item..." aria-label="Busca geral"><div class="top-search-results" id="resultados" hidden></div></div>
        <a href="#/notificacoes" class="btn ghost icon notify" id="sino" title="Notificações" aria-label="Notificações">${ic('bell', 18)}<span class="notify-count" hidden></span></a>
        <div class="user-block"><span class="avatar" id="avatar"></span><div class="user-text"><strong id="nome-usuario"></strong><small id="perfil-usuario"></small></div>
          <button class="btn ghost icon" data-instalar hidden title="Instalar o SimulFlow como aplicativo" aria-label="Instalar o SimulFlow como aplicativo">${ic('download')}</button>
          <button class="btn ghost icon" data-tema></button>
          <button class="btn ghost icon" data-senha title="Alterar minha senha" aria-label="Alterar minha senha">${ic('key')}</button>
          <button class="btn ghost icon" data-sair title="Sair" aria-label="Sair">${ic('logout')}</button></div></div>
    </header><div id="app" class="app-main"></div></div><div class="scrim" data-menu></div></div>`);
  const shell = raiz.querySelector('#shell');
  raiz.querySelectorAll('[data-menu]').forEach(b => b.addEventListener('click', () => shell.classList.toggle('mobile-open')));
  raiz.querySelector('[data-recolher]').addEventListener('click', () => shell.classList.toggle('collapsed'));
  raiz.querySelector('[data-sair]').addEventListener('click', () => encerrar(''));
  raiz.querySelector('[data-senha]').addEventListener('click', alterarMinhaSenha);
  raiz.querySelector('[data-tema]').addEventListener('click', alternarTema);
  const botaoInstalar = raiz.querySelector('[data-instalar]');
  botaoInstalar.addEventListener('click', async () => { if (await instalarApp()) toast('SimulFlow instalado como aplicativo'); });
  aoPoderInstalar(pode => { botaoInstalar.hidden = !pode; });
  atualizarBotaoTema();
  raiz.querySelector('#nav').addEventListener('click', e => { if (e.target.closest('a')) shell.classList.remove('mobile-open'); });
  ligarBuscaGeral();
  atualizarShell();
  roteador = criarRoteador({ container: raiz.querySelector('#app'), contexto });
  roteador.iniciar();
}

assinar('aba', ({ id, titulo }) => {
  tituloAtual = titulo;
  const t = document.getElementById('titulo-aba');
  if (t) t.textContent = titulo;
  document.title = `${titulo} | ${config.app.nome}`;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.aba === id));
  document.getElementById('sino')?.classList.toggle('ativo', id === 'notificacoes');
});

function atualizarBotaoTema() {
  const b = document.querySelector('[data-tema]');
  if (!b) return;
  const escuro = temaEfetivo() === 'escuro';
  const rotulo = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
  b.innerHTML = String(ic(escuro ? 'sun' : 'moon'));
  b.title = rotulo;
  b.setAttribute('aria-label', rotulo);
}
assinar('tema', atualizarBotaoTema);

function naoLidas(u) {
  return store.filtrar('eventos', e => !e.lida && (pode(u, 'notificacoes') || e.destinatarioId === u.id)).length;
}

function atualizarShell() {
  const u = usuarioAtual();
  const nav = document.getElementById('nav');
  if (!u || !nav) return;
  const atual = roteador?.abaAtual();
  const n = naoLidas(u);
  nav.innerHTML = String(html`${config.abas.filter(a => a.visivel !== false && pode(u, a.id)).map(a => html`<a href="#/${a.id}" data-aba="${a.id}" title="${a.titulo}" class="nav-link ${a.id === atual ? 'active' : ''}">${ic(a.icone, 18)}<span class="nav-label">${a.titulo}</span>${a.id === 'notificacoes' && n ? html`<span class="nav-count">${n}</span>` : ''}</a>`)}`);
  document.getElementById('avatar').textContent = iniciais(u.nome);
  document.getElementById('nome-usuario').textContent = u.nome;
  document.getElementById('perfil-usuario').textContent = u.host ? 'Host / Administrador' : u.area;
  const contador = document.querySelector('#sino .notify-count');
  contador.hidden = !n;
  contador.textContent = n > 99 ? '99+' : String(n);
  const sino = document.getElementById('sino');
  sino.setAttribute('aria-label', n ? `Notificações: ${n} não lidas` : 'Notificações');
  sino.title = sino.getAttribute('aria-label');
  sino.classList.toggle('ativo', atual === 'notificacoes');
  document.getElementById('sino').hidden = !pode(u, 'notificacoes');
  document.getElementById('titulo-aba').textContent = tituloAtual;
}

function ligarBuscaGeral() {
  const input = document.getElementById('busca-geral');
  const caixa = document.getElementById('resultados');
  const mostrar = () => {
    const q = input.value.trim();
    const u = usuarioAtual();
    if (!q) { caixa.hidden = true; return; }
    const obra = id => store.obter('obras', id);
    const res = [];
    if (pode(u, 'pcp')) {
      for (const o of store.filtrar('ops', o => combinaOP(o, obra(o.obraId), q)).slice(0, 5)) res.push(html`<a href="#/pcp/op/${o.id}"><strong>${o.numero}</strong> · ${o.produto}<span class="subline">${o.faFicha} · ${obra(o.obraId)?.nome || ''} · ${o.responsavel} · ${statusExibidoOP(o)}</span></a>`);
      for (const f of store.filtrar('fas', f => combinaTexto(q, [f.numero, f.titulo, f.responsavelNome, f.setorOrigem, f.setorDestino, statusExibidoFA(f), obra(f.obraId)?.nome])).slice(0, 4)) res.push(html`<a href="#/pcp/fa/${f.id}"><strong>${f.numero}</strong> · ${f.titulo}<span class="subline">${f.setorOrigem} → ${f.setorDestino} · ${statusExibidoFA(f)}</span></a>`);
    }
    if (pode(u, 'projetos')) {
      for (const i of store.filtrar('itens', i => combinaTexto(q, [i.codigo, i.serie, i.descricao, i.opNumero, obra(i.obraId)?.nome])).slice(0, 4)) res.push(html`<a href="#/projetos/obra/${i.obraId}?item=${i.id}"><strong>${i.codigo}</strong> · ${i.descricao || 'Item'}<span class="subline">${obra(i.obraId)?.nome || ''}${i.serie ? ' · ' + i.serie : ''}</span></a>`);
    }
    caixa.innerHTML = res.length ? res.map(String).join('') : '<div class="empty">Nenhum resultado</div>';
    caixa.hidden = false;
  };
  input.addEventListener('input', mostrar);
  input.addEventListener('focus', mostrar);
  caixa.addEventListener('click', e => { if (e.target.closest('a')) { input.value = ''; caixa.hidden = true; } });
  document.addEventListener('click', e => { if (!e.target.closest('.top-search')) caixa.hidden = true; });
}

aplicarTema();
iniciar();
