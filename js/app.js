// Inicialização do SimulFlow: configuração, dados, sessão, shell (menu/topo) e roteador de abas.
import { carregarConfig, config } from './core/config.js';
import { criarStore } from './data/store.js';
import { criarAdaptadorLocal } from './data/adapters/local.js';
import { criarAdaptadorPlanilha } from './data/adapters/planilha.js';
import { conexao, salvarConexao, testarConexao, chamar, modoDados, definirModoDados, acessaDados } from './core/conexao.js';
import { baixarJSON } from './core/exportar.js';
import { aoPoderInstalar, instalarApp } from './core/instalar.js';
import { criarAcoes } from './data/acoes/index.js';
import { dadosDemonstracao } from './data/demo.js';
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
  const modo = modoDados();
  if (!modo) return telaConfigurarComputador();
  if (modo === 'planilha') {
    const con = conexao();
    if (!acessaDados(con)) return telaConfigurarComputador('A conexão salva neste computador não dá acesso aos dados do SimulFlow. Use um acesso Sistema, Planejamento ou Admin.');
    raiz.innerHTML = String(html`<main class="auth-page"><div class="auth-card">${marca()}<p class="muted">Carregando os dados da planilha…</p></div></main>`);
    const adaptador = criarAdaptadorPlanilha({ url: con.url, chamar: (acao, dados) => chamar(acao, dados, conexao()) });
    try {
      await adaptador.iniciar();
    } catch (e) {
      return telaConfigurarComputador('Não foi possível abrir os dados da planilha: ' + codigoAntigo(e).message);
    }
    store = criarStore(adaptador);
    store.carregar();
    adaptador.aoMudarEstado(atualizarSincronia);
  } else {
    store = criarStore(criarAdaptadorLocal());
    const existia = store.carregar();
    if (!existia) await primeiraCarga();
  }
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

/** Primeiro uso neste navegador: usa data/dados-iniciais.json (instalado pelo CLI) ou a demonstração. */
async function primeiraCarga() {
  try {
    const r = await fetch('data/dados-iniciais.json', { cache: 'no-cache' });
    if (r.ok) { store.importar(await r.json()); return; }
  } catch { /* sem arquivo inicial: segue com a demonstração */ }
  store.substituir(dadosDemonstracao());
}

// ---------------- Configurar este computador (planilha ou só este navegador) ----------------

/** A planilha ainda está com o script antigo (sem as ações de dados)? Explica como atualizar. */
function codigoAntigo(e) {
  if (e?.status === 404 && /Ação desconhecida/.test(e.message)) {
    return new Error('A planilha ainda está com o código antigo. No Apps Script, cole o Codigo.gs novo, salve e publique uma nova versão (Implantar › Gerenciar implantações › editar › Nova versão).');
  }
  return e;
}

const temDados = d => !!d && Object.entries(d).some(([c, v]) => c !== 'config' && c !== 'auditoria' && Array.isArray(v) && v.length);

function resumoLocal(d) {
  const n = c => (d?.[c] || []).length;
  return `${n('usuarios')} usuário(s), ${n('obras')} obra(s), ${n('ops')} OP(s), ${n('fas')} FA(s) e ${n('itens')} item(ns)`;
}

function telaConfigurarComputador(mensagem = '') {
  const salva = conexao();
  telaAcesso(html`<h1>Configurar este computador</h1>
    <form class="auth-form" novalidate>
      <p class="muted small">Para todos os setores verem os mesmos dados, conecte à planilha Google com o acesso que o host gerou para este computador (Presença operacional › Conexão › Novo acesso, perfil Sistema).</p>
      ${campo('URL do app da Web', html`<input name="url" required inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="${salva?.url || ''}">`)}
      ${campo('Token de acesso', html`<input name="token" required type="password" autocomplete="off" placeholder="sf_…" value="${salva?.token || ''}">`)}
      <p role="alert" class="error">${mensagem}</p>
      <button class="btn primario full" type="submit">Conectar à planilha</button>
      <button class="btn ghost full" type="button" data-local>Usar só neste navegador</button>
      <p class="muted small">"Só neste navegador" guarda os dados apenas aqui, como antes (bom para testes e demonstração).</p></form>`,
  async d => {
    const c = await testarConexao(d.url, d.token);
    if (!acessaDados(c)) throw new Error(`Este acesso é de perfil "${c.perfil}" (celular de leitura). Para os dados do SimulFlow use um acesso Sistema, Planejamento ou Admin.`);
    const remoto = await chamar('dados.tudo', {}, c).catch(e => { throw codigoAntigo(e); });
    const local = criarAdaptadorLocal().ler();
    salvarConexao(c);
    if (!temDados(remoto.estado) && (temDados(local) || local?.usuarios?.length)) return telaMigracao(c, local);
    definirModoDados('planilha');
    location.reload();
  }, 'configurar');
  raiz.querySelector('[data-local]').addEventListener('click', () => { definirModoDados('local'); iniciar(); });
}

/** Planilha vazia e navegador com dados: enviar tudo ou começar só com os usuários (backup antes). */
function telaMigracao(c, local) {
  telaAcesso(html`<h1>A planilha ainda está vazia</h1>
    <form class="auth-form" novalidate>
      <p>Este navegador tem ${resumoLocal(local)}.</p>
      <p class="muted small">Antes de continuar, um backup JSON destes dados será baixado para o seu computador.</p>
      <p role="alert" class="error"></p>
      <button class="btn primario full" type="submit" data-opcao="tudo">Enviar os dados deste navegador para a planilha</button>
      <button class="btn outline full" type="button" data-opcao="usuarios">Começar sem dados, levando só os usuários</button>
      <button class="btn ghost full" type="button" data-voltar>Voltar</button></form>`,
  () => migrar('tudo'), 'migrar');
  async function migrar(opcao) {
    baixarJSON(`simulflow-backup-antes-da-planilha-${new Date().toISOString().slice(0, 10)}`, { formato: 'simulflow-backup', versao: local.versao || 1, exportadoEm: new Date().toISOString(), dados: local });
    const estado = opcao === 'tudo' ? local : { usuarios: local.usuarios || [], config: local.config || {} };
    await chamar('dados.substituir', { estado }, c);
    definirModoDados('planilha');
    location.reload();
  }
  const form = raiz.querySelector('form');
  form.querySelector('[data-opcao=usuarios]').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    try { await migrar('usuarios'); } catch (err) { form.querySelector('[role=alert]').textContent = err.message; e.currentTarget.disabled = false; }
  });
  form.querySelector('[data-voltar]').addEventListener('click', () => telaConfigurarComputador());
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

function telaAcesso(conteudo, aoEnviar, tipo = '') {
  const nota = tipo ? '' : modoDados() === 'planilha'
    ? html`<p class="auth-note">Dados na planilha Google, compartilhados entre os computadores conectados. <a class="link" href="#" data-trocar-modo>Trocar</a></p>`
    : html`<p class="auth-note">Dados e senhas ficam somente neste navegador. <a class="link" href="#" data-trocar-modo>Conectar à planilha</a></p>`;
  raiz.innerHTML = String(html`<main class="auth-page"><div class="auth-card">${marca()}${conteudo}</div>${nota}</main>`);
  raiz.querySelector('[data-trocar-modo]')?.addEventListener('click', e => { e.preventDefault(); definirModoDados(null); location.reload(); });
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
  telaAcesso(html`<h1>Primeiro acesso</h1><p class="muted">Crie o usuário host (administrador). Ele cadastra os demais usuários, senhas e áreas de acesso.</p>
    <form class="auth-form" novalidate>
      ${campo('Usuário (login)', html`<input name="login" required autocomplete="username" value="${config.app.hostLoginPadrao || ''}">`)}
      ${campo('Nome', html`<input name="nome" required autocomplete="name" maxlength="100">`)}
      ${campoSenha('senha', 'Senha', 'new-password')}${campoSenha('confirmacao', 'Confirmar senha', 'new-password')}
      <p role="alert" class="error"></p><button class="btn primario full" type="submit">Criar host e entrar</button></form>`,
  async d => {
    if (!d.login.trim() || !d.nome.trim()) throw new Error('Informe usuário e nome');
    auth.validarSenha(d.senha);
    if (d.senha !== d.confirmacao) throw new Error('As senhas não conferem');
    const credencial = await auth.gerarCredencial(d.senha);
    const host = acoes.usuarios.criarHost({ login: d.login, nome: d.nome, credencial });
    auth.iniciarSessao(host);
    telaInicial();
  });
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
      <div class="sidebar-bottom"><div class="connection" id="sincronia"><i class="live-dot"></i><span></span></div><div class="sidebar-footer">${config.app.nome} · v${config.app.versao}</div></div>
    </aside>
    <div class="workspace"><header class="topbar">
      <div class="breadcrumbs"><button class="btn ghost icon mobile-menu" data-menu aria-label="Abrir menu" title="Abrir menu">${ic('menu')}</button>
        <button class="btn ghost icon hide-small" data-recolher title="Recolher ou expandir menu" aria-label="Recolher ou expandir menu">${ic('collapse')}</button>
        <span>Área de trabalho</span>${ic('chevronRight', 12)}<strong id="titulo-aba"></strong></div>
      <div class="top-actions"><div class="top-search">${ic('search')}<input id="busca-geral" type="search" placeholder="Buscar OP, FA ou item..." aria-label="Busca geral"><div class="top-search-results" id="resultados" hidden></div></div>
        <span class="badge amber" id="aviso-sincronia" hidden></span>
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
  atualizarSincronia(store.adaptador.estadoSincronia?.());
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

/** Situação da sincronização com a planilha (menu lateral e aviso no topo). */
let ultimaSituacao = '';
function atualizarSincronia(e) {
  const caixa = document.getElementById('sincronia');
  const aviso = document.getElementById('aviso-sincronia');
  if (e && e.situacao !== ultimaSituacao) {
    if (e.situacao === 'erro' && e.mensagem) toast(e.mensagem, 'erro');
    else if (ultimaSituacao === 'offline' && e.situacao === 'ok') toast('Conexão com a planilha restabelecida');
    else if (e.situacao === 'ok' && e.mensagem) toast(e.mensagem);
    ultimaSituacao = e.situacao;
  }
  if (!caixa) return;
  const textos = !e ? ['local', 'Só neste navegador']
    : { ok: ['ok', 'Salvo na planilha'], sincronizando: ['sinc', `Sincronizando${e.pendentes ? ` (${e.pendentes})` : '…'}`], offline: ['offline', 'Sem conexão — guardado neste computador'], erro: ['erro', 'Erro na sincronização'] }[e.situacao];
  caixa.dataset.situacao = textos[0];
  caixa.querySelector('span').textContent = textos[1];
  caixa.title = e?.mensagem || textos[1];
  if (aviso) {
    aviso.hidden = !e || !['offline', 'erro'].includes(e.situacao);
    aviso.textContent = e?.situacao === 'erro' ? 'Erro ao salvar' : 'Sem conexão';
    aviso.title = e?.mensagem || '';
    aviso.className = 'badge ' + (e?.situacao === 'erro' ? 'red' : 'amber');
  }
}

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
