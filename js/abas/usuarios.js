// Aba Usuários e permissões (somente host): cadastro, área, funções, acesso por aba, obras do Dashboard e senhas.
import { html, cabecalho, botao, badge, campo, seletor, modal, toast, vazio, delegar, busca } from '../core/ui.js';
import { config } from '../core/config.js';
import { combinaTexto } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';
import { permissoesPadrao, abaSoHost } from '../core/permissoes.js';
import { gerarCredencial, validarSenha } from '../core/auth.js';

const estado = { f: { busca: '' } };
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
    },
  });
}

function view(ctx) {
  const { store } = ctx;
  const lista = store.filtrar('usuarios', u => combinaTexto(estado.f.busca, [u.nome, u.login, u.area])).sort((a, b) => a.nome.localeCompare(b.nome));
  const funcao = id => config.app.funcoes.find(f => f.id === id)?.rotulo || id;
  return html`${cabecalho('Usuários e permissões', '', botao('Novo usuário', { acao: 'novo', icone: 'plus' }))}
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
      cliques: { ...ctl.cliques, novo: () => formUsuario(ctx), editar: d => formUsuario(ctx, ctx.store.obter('usuarios', d.id)) },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) { el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`); },
};
