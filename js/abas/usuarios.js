// Aba Usuários e permissões (somente host): cadastro, área, funções, acesso por aba, obras do Dashboard e senhas.
import { html, cabecalho, botao, badge, campo, seletor, modal, toast, vazio, delegar, busca, confirmar, janela, ic } from '../core/ui.js';
import { config } from '../core/config.js';
import { combinaTexto, dataHora } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';
import { permissoesPadrao, abaSoHost } from '../core/permissoes.js';
import { gerarCredencial, validarSenha } from '../core/auth.js';
import { conexaoContas, conexaoContasLocal, registrarVerificador, salvarConexaoContas, limparConexaoContas, testarConexaoContas, podeContas, adminContas, enviarContas, puxarContas, listarAcessosContas, criarAcessoContas, revogarAcessoContas, ultimaSincronizacao } from '../core/contas.js';

const estado = { f: { busca: '' } };
const planilha = { acessos: null, erro: '', carregando: false };
let desligar = null;

function formUsuario(ctx, u = null) {
  const { store } = ctx;
  const abas = config.abas.filter(a => !abaSoHost(a));
  const perm = u?.permissoes || permissoesPadrao(u?.area || config.app.areas[0]);
  const proprio = u?.id === ctx.usuario.id;
  const obras = store.filtrar('obras', o => !o.parentId && (!o.arquivado || (u?.obrasDashboard || []).includes(o.id)));
  const linhasPerm = p => abas.map(a => campo(a.titulo, seletor('perm.' + a.id, [{ v: 'nenhum', t: 'Sem acesso' }, { v: 'ver', t: 'Apenas visualizar' }, { v: 'editar', t: 'Visualizar e alterar' }], p[a.id] || 'nenhum')));
  modal({
    titulo: u ? 'Editar usuário' : 'Novo usuário', descricao: 'Dados, área, funções e acessos por aba.', largo: true,
    corpo: html`<div class="form-grid">
      ${campo('Usuário (login)', html`<input name="login" required autocomplete="off" value="${u?.login || ''}">`, { obrig: true, ajuda: 'Pode ser um nome de usuário ou e-mail.' })}
      ${campo('Nome', html`<input name="nome" required maxlength="100" value="${u?.nome || ''}">`, { obrig: true })}
      ${campo('Área', seletor('area', config.app.areas, u?.area || config.app.areas[0], 'data-area'), { obrig: true })}
      ${campo(u ? 'Nova senha provisória (opcional)' : 'Senha provisória', html`<input name="senha" type="text" autocomplete="off" ${u ? '' : 'required'} placeholder="mín. ${config.app.senhaMinima} caracteres">`, { obrig: !u, ajuda: 'O usuário troca a senha no primeiro acesso.' })}
      <label class="toggle"><input type="checkbox" name="ativo"${u?.ativo === false ? '' : ' checked'}${proprio ? ' disabled' : ''}> Usuário ativo</label>
      <label class="toggle"><input type="checkbox" name="host"${u?.host ? ' checked' : ''}${proprio ? ' disabled' : ''}> Host / administrador (acesso total)</label>
      <fieldset><legend>Funções</legend><div class="check-list">${config.app.funcoes.map(f => html`<label title="${f.descricao}"><input type="checkbox" name="funcoes[]" value="${f.id}"${(u?.funcoes || []).includes(f.id) ? ' checked' : ''}><span>${f.rotulo}<span class="subline">${f.descricao}</span></span></label>`)}</div></fieldset>
      <fieldset><legend>Acesso por aba</legend><div class="toolbar" style="margin-bottom:8px">${botao('Aplicar padrão da área', { acao: 'padrao-area', v: 'outline', tam: 'sm' })}<span class="muted small">Padrão: alterar na aba da própria área, visualizar nas demais.</span></div>
        <div class="form-grid" data-perms>${linhasPerm(perm)}</div></fieldset>
      <fieldset><legend>Obras liberadas no Dashboard</legend><div class="check-list">${obras.map(o => html`<label><input type="checkbox" name="obrasDashboard[]" value="${o.id}"${(u?.obrasDashboard || []).includes(o.id) ? ' checked' : ''}>${o.nome}${o.arquivado ? ' (arquivada)' : ''}</label>`)}</div>
        <p class="muted small">Sem obras selecionadas, o usuário não consulta dados no Dashboard (o host vê todas).</p></fieldset></div>`,
    rotuloOk: 'Salvar usuário',
    aoMontar: form => {
      form.querySelector('[data-acao="padrao-area"]').addEventListener('click', () => {
        form.querySelector('[data-perms]').innerHTML = String(html`${linhasPerm(permissoesPadrao(form.querySelector('[data-area]').value))}`);
      });
    },
    onOk: async d => {
      let credencial = null;
      if (d.senha) { validarSenha(d.senha); credencial = await gerarCredencial(d.senha); }
      const permissoes = Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('perm.')).map(([k, v]) => [k.slice(5), v]));
      ctx.acoes.usuarios.salvarUsuario({
        id: u?.id, login: d.login, nome: d.nome, area: d.area, ativo: proprio ? true : d.ativo, host: proprio ? true : d.host,
        funcoes: d.funcoes || [], permissoes, obrasDashboard: d.obrasDashboard || [], credencial,
      });
      toast('Usuário salvo');
      // Senha definida pelo host: a planilha guarda o verificador, para a pessoa poder trocá-la em qualquer aparelho.
      if (d.senha && adminContas(conexaoContas())) {
        enviarContas(ctx.store, conexaoContas(), true).then(() => registrarVerificador(d.login, d.senha))
          .catch(e => toast('Usuário salvo neste aparelho, mas não na planilha de usuários: ' + e.message, 'erro'));
      }
    },
  });
}

// ---------------- Planilha de usuários (contas em todos os aparelhos) ----------------

function painelPlanilha() {
  // Só a conexão do próprio aparelho (token admin); a embutida no site é de leitura, para entrar em outros aparelhos.
  const con = conexaoContasLocal();
  if (!podeContas(con)) {
    return html`<details class="painel-filtros" data-caixa-planilha style="margin-bottom:16px"><summary>${ic('link')}<span class="painel-filtros-resumo"><strong>Planilha de usuários</strong> não conectada: as contas ficam só neste aparelho</span><span class="painel-filtros-acao">Conectar</span></summary>
      <form class="painel-filtros-corpo" data-form-planilha><div class="form-grid">
        ${campo('URL do app da Web', html`<input name="url" required inputmode="url" placeholder="https://script.google.com/macros/s/…/exec">`, { full: true })}
        ${campo('Token de acesso (perfil admin)', html`<input name="token" required type="password" autocomplete="off" placeholder="sfc_…">`, { full: true, ajuda: 'Gerado na planilha de usuários: menu SimulFlow Contas › Gerar token de acesso.' })}</div>
        <div class="toolbar" style="margin-top:12px">${botao('Conectar e enviar as contas', { acao: 'planilha-conectar', icone: 'link' })}</div></form></details>`;
  }
  const quando = ultimaSincronizacao();
  return html`<section class="panel" style="margin-bottom:16px"><div class="title-row"><h2>Planilha de usuários</h2>${badge('Conectada', 'green')}</div>
    <p class="muted small" style="margin:6px 0 10px;word-break:break-all">Acesso ${con.nome} (${con.perfil}) · ${con.url}${quando ? ` · contas enviadas às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
    ${planilha.erro ? html`<div class="warning-band erro-band">${planilha.erro}</div>` : ''}
    <div class="toolbar">${botao('Sincronizar agora', { acao: 'planilha-sincronizar', v: 'outline', icone: 'restore' })}
      ${adminContas(con) ? botao('Novo acesso', { acao: 'planilha-acesso-novo', icone: 'plus' }) : ''}
      ${botao('Desconectar', { acao: 'planilha-desconectar', v: 'ghost', icone: 'x' })}</div>
    ${adminContas(con) && planilha.acessos ? html`<div class="table-wrap" style="margin-top:12px"><div class="table-scroll"><table><thead><tr><th>Aparelho</th><th>Perfil</th><th>Criado em</th><th>Último uso</th><th>Situação</th><th></th></tr></thead><tbody>
      ${planilha.acessos.map(a => html`<tr><td><strong>${a.nome}</strong></td><td>${a.perfil}</td><td>${dataHora(a.criadoEm)}</td><td>${a.ultimoUso ? dataHora(a.ultimoUso) : '—'}</td><td>${badge(a.ativo ? 'Ativo' : 'Desativado')}</td>
        <td>${a.ativo ? botao('Revogar', { acao: 'planilha-revogar', dados: { id: a.id, nome: a.nome }, v: 'outline', tam: 'sm' }) : ''}</td></tr>`)}</tbody></table></div></div>` : ''}</section>`;
}

async function carregarAcessos(ctx) {
  if (!adminContas(conexaoContas()) || planilha.carregando) return;
  planilha.carregando = true;
  try { planilha.acessos = await listarAcessosContas(); planilha.erro = ''; } catch (e) { planilha.erro = e.message; }
  planilha.carregando = false;
  ctx.rerender();
}

function mostrarTokenContas(acesso) {
  const con = conexaoContas();
  janela(`Acesso "${acesso.nome}" (${acesso.perfil})`, 'Copie agora: o token não será mostrado de novo.', html`
    ${campo('URL do app da Web', html`<input readonly value="${con.url}" data-copiar>`)}
    ${campo('Token', html`<input readonly value="${acesso.token}" data-copiar>`)}
    <p class="muted small">${acesso.perfil === 'leitura'
      ? 'Este token vai embutido no site (config/app.json › planilhaUsuarios). Fica visível no código público, mas só lê as contas (as senhas estão em hash).'
      : 'No outro computador do host: Usuários e permissões › Planilha de usuários › Conectar, com esta URL e este token.'}</p>`, false);
  document.querySelectorAll('[data-copiar]').forEach(i => i.addEventListener('focus', () => { i.select(); navigator.clipboard?.writeText(i.value).then(() => toast('Copiado'), () => {}); }));
}

function view(ctx) {
  const { store } = ctx;
  const lista = store.filtrar('usuarios', u => combinaTexto(estado.f.busca, [u.nome, u.login, u.area])).sort((a, b) => a.nome.localeCompare(b.nome));
  const funcao = id => config.app.funcoes.find(f => f.id === id)?.rotulo || id;
  return html`${cabecalho('Usuários e permissões', '', botao('Novo usuário', { acao: 'novo', icone: 'plus' }))}
    ${painelPlanilha()}
    <div class="filters">${busca('f.busca', estado.f.busca, 'Buscar nome, login ou área...')}<span class="filter-count">${lista.length} usuários</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Nome / login</th><th>Área</th><th>Perfil e funções</th><th>Abas com alteração</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      ${lista.map(u => html`<tr><td><strong>${u.nome}</strong><span class="subline">${u.login}</span></td><td>${u.area}</td>
        <td>${u.host ? badge('Host', 'blue') : ''}${(u.funcoes || []).map(f => html` <span class="sector-tag">${funcao(f)}</span>`)}${!u.host && !(u.funcoes || []).length ? html`<span class="muted">—</span>` : ''}</td>
        <td>${u.host ? 'Todas' : Object.entries(u.permissoes || {}).filter(([, v]) => v === 'editar').map(([k]) => config.abas.find(a => a.id === k)?.titulo || k).join(', ') || '—'}</td>
        <td>${badge(u.ativo ? 'Ativo' : 'Desativado')}${u.trocarSenha ? html`<span class="subline">Senha provisória</span>` : ''}</td>
        <td>${botao('', { acao: 'editar', dados: { id: u.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: 'Editar ' + u.nome })}</td></tr>`)}
    </tbody></table></div>${lista.length ? '' : vazio()}</div>`;
}

export default {
  id: 'usuarios',
  titulo: 'Usuários e permissões',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, novo: () => formUsuario(ctx), editar: d => formUsuario(ctx, ctx.store.obter('usuarios', d.id)),
        'planilha-conectar': async () => {
          const f = el.querySelector('[data-form-planilha]');
          const c = await testarConexaoContas(f.url.value, f.token.value);
          salvarConexaoContas(c);
          await puxarContas(ctx.store, c);
          await enviarContas(ctx.store, c, true);
          toast(`Planilha de usuários conectada (${c.perfil}): contas enviadas`);
          planilha.acessos = null; carregarAcessos(ctx); ctx.rerender();
        },
        'planilha-sincronizar': async () => {
          const n = await puxarContas(ctx.store);
          await enviarContas(ctx.store, conexaoContas(), true);
          toast(n ? `${n} conta(s) atualizada(s) a partir da planilha; contas enviadas` : 'Contas em dia com a planilha');
          carregarAcessos(ctx); ctx.rerender();
        },
        'planilha-desconectar': async () => {
          if (!(await confirmar('Desconectar a planilha de usuários?', 'Este aparelho deixa de enviar e receber contas. As contas continuam na planilha e neste aparelho.', 'Desconectar'))) return;
          limparConexaoContas(); planilha.acessos = null; ctx.rerender();
        },
        'planilha-acesso-novo': () => modal({
          titulo: 'Novo acesso', descricao: 'Cada acesso recebe o seu próprio token.',
          corpo: html`${campo('Nome do aparelho', html`<input name="nome" required placeholder="PC da Produção">`, { obrig: true })}
            ${campo('Perfil', seletor('perfil', [{ v: 'leitura', t: 'Leitura — vai embutido no site: qualquer aparelho entra com usuário e senha' }, { v: 'admin', t: 'Admin — outro computador do host, que cadastra e altera contas' }], 'leitura'))}`,
          rotuloOk: 'Criar acesso',
          onOk: async d => { const a = await criarAcessoContas(d.nome, d.perfil); planilha.acessos = null; carregarAcessos(ctx); mostrarTokenContas(a); },
        }),
        'planilha-revogar': async d => {
          if (!(await confirmar(`Revogar o acesso "${d.nome}"?`, 'O aparelho deixa de receber e enviar contas pela planilha imediatamente.', 'Revogar'))) return;
          await revogarAcessoContas(d.id); toast('Acesso revogado'); planilha.acessos = null; carregarAcessos(ctx);
        },
      },
    });
    if (adminContas(conexaoContas()) && !planilha.acessos) carregarAcessos(ctx);
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) { el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`); },
};
