// Aba Configurações (somente host): limites de ensaio, políticas de observação, etapas/responsáveis,
// escopo das etapas, dados (exportar/importar JSON, limpar dados), aparência e abas registradas.
import { html, raw, ic, cabecalho, botao, campo, seletor, modal, toast, confirmar, vazio, delegar, badge } from '../core/ui.js';
import { TEMAS, temaEscolhido, definirTema } from '../core/tema.js';
import { config } from '../core/config.js';
import { dataHora } from '../core/util.js';
import { abrirHistorico, opcoesUsuarios, nomeUsuario } from '../componentes/comuns.js';
import { STATUS_ENSAIO_ABERTO } from '../data/regras.js';
import { baixarJSON, escolherJSON } from '../core/exportar.js';

let obraSel = '';
let desligar = null;

function formTipo(ctx, tipo = null) {
  modal({
    titulo: tipo ? 'Limites · ' + tipo.nome : 'Novo tipo de ensaio', descricao: 'Limites (em horas) independentes por status. Vazio = limite não configurado (sem gargalo).',
    corpo: html`${campo('Tipo de ensaio', html`<input name="nome" required value="${tipo?.nome || ''}">`, { obrig: true })}
      <div class="form-grid">${STATUS_ENSAIO_ABERTO.map(s => campo(`${s} (horas)`, html`<input name="lim.${s}" type="number" min="0.01" step="any" value="${tipo?.limites?.[s] ?? ''}">`, { ajuda: tipo?.limites?.[s] ? '' : 'limite não configurado' }))}</div>`,
    rotuloOk: 'Salvar limites',
    onOk: d => {
      const limites = Object.fromEntries(STATUS_ENSAIO_ABERTO.map(s => [s, d['lim.' + s]]));
      ctx.acoes.ensaios.salvarTipo({ id: tipo?.id, nome: d.nome, limites });
      toast('Limites salvos');
    },
  });
}

const opcoesPol = [{ v: 'opcional', t: 'Opcional' }, { v: 'sempre', t: 'Obrigatória sempre' }, { v: 'condicional', t: 'Obrigatória em redução ou atraso' }];
const rotuloPol = v => opcoesPol.find(o => o.v === v)?.t || v;

/** Cada configuração vira um cartão no índice e uma página própria (#/configuracoes/<id>). */
const SECOES = [
  {
    id: 'aparencia', titulo: 'Aparência', icone: 'sun', descricao: 'Tema claro, escuro ou automático da tela.',
    resumo: () => 'Tema: ' + TEMAS[temaEscolhido()].split(' (')[0],
    view: () => html`<div class="panel"><h2>Tema da tela</h2><p class="muted small" style="margin:4px 0 14px">Vale para este navegador. O botão ${ic('moon')} no topo também alterna entre claro e escuro.</p>
      <div class="opcoes-tema">${Object.entries(TEMAS).map(([v, t]) => html`<label class="opcao-tema ${temaEscolhido() === v ? 'ativa' : ''}"><input type="radio" name="tema" value="${v}" data-acao="tema" data-valor="${v}"${temaEscolhido() === v ? raw(' checked') : ''}>
        <span class="amostra-tema amostra-${v}"></span><strong>${t}</strong></label>`)}</div></div>`,
  },
  {
    id: 'ensaios', titulo: 'Limites de ensaio', icone: 'flask', descricao: 'Horas máximas por tipo de ensaio e status (gargalos).',
    resumo: ({ store }) => { const t = store.todos('tiposEnsaio'); const sem = t.filter(x => !STATUS_ENSAIO_ABERTO.some(s => x.limites?.[s])).length; return `${t.length} tipos · ${sem} sem limite`; },
    view: ({ store }) => html`<div class="section-title"><h2>Limites por tipo de ensaio e status</h2>${botao('Tipo de ensaio', { acao: 'tipo-novo', icone: 'plus' })}</div>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Tipo de ensaio</th>${STATUS_ENSAIO_ABERTO.map(s => html`<th>${s}</th>`)}<th></th></tr></thead><tbody>
        ${store.todos('tiposEnsaio').map(t => html`<tr><td><strong>${t.nome}</strong></td>${STATUS_ENSAIO_ABERTO.map(s => html`<td>${t.limites?.[s] ? t.limites[s] + ' h' : html`<span class="amber">limite não configurado</span>`}</td>`)}
          <td>${botao('Configurar', { acao: 'tipo-editar', dados: { id: t.id }, v: 'outline', tam: 'sm' })}</td></tr>`)}</tbody></table></div>${store.todos('tiposEnsaio').length ? '' : vazio('Nenhum tipo de ensaio.')}</div>`,
  },
  {
    id: 'observacao', titulo: 'Observação obrigatória', icone: 'edit', descricao: 'Quando exigir observação ao atualizar quantidades e efetivo.',
    resumo: ({ store }) => `Quantidade: ${rotuloPol(store.config.politicas.quantidade)} · Efetivo: ${rotuloPol(store.config.politicas.efetivo)}`,
    view: ({ store }) => html`<h2>Observação por tipo de atualização</h2><div class="grid-2" style="margin-top:10px">
      ${[['quantidade', 'Quantidade realizada (itens e etapas adicionais)'], ['efetivo', 'Efetivo por turno']].map(([k, r]) => html`<div class="panel toolbar" style="align-items:flex-end">${campo(r, seletor('pol-' + k, opcoesPol, store.config.politicas[k], `data-politica="${k}"`))}${botao('Salvar', { acao: 'politica', dados: { tipo: k }, v: 'outline', icone: 'check' })}</div>`)}</div>`,
  },
  {
    id: 'etapas', titulo: 'Etapas e responsáveis', icone: 'factory', descricao: 'Responsável de cada etapa, histórico de atribuições e escopo por obra.',
    resumo: ({ store }) => `${store.filtrar('etapas', e => !e.arquivado).length} etapas ativas`,
    view: ({ store }) => {
      const obras = store.filtrar('obras', o => !o.parentId && !o.arquivado);
      const obra = obras.find(o => o.id === obraSel) || obras[0];
      if (!obra) return vazio('Nenhuma obra ativa.');
      const ids = [obra.id, ...store.filtrar('obras', o => o.parentId === obra.id).map(o => o.id)];
      const etapas = store.filtrar('etapas', e => ids.includes(e.obraId) && !e.arquivado).sort((a, b) => a.ordem - b.ordem);
      return html`<h2>Etapas e responsáveis</h2><div class="filters" style="margin-top:10px"><label class="field"><span class="field-label">Obra</span><select data-obra-config>${obras.map(o => html`<option value="${o.id}"${o.id === obra.id ? raw(' selected') : ''}>${o.nome}</option>`)}</select></label>
        <label class="field"><span class="field-label">Definição de etapas</span><select data-escopo><option value="obra"${obra.escopoEtapas !== 'subprojeto' ? raw(' selected') : ''}>Etapas e responsáveis definidos na obra</option><option value="subprojeto"${obra.escopoEtapas === 'subprojeto' ? raw(' selected') : ''}>Definidos por sub-projeto</option></select></label>
        ${botao('Salvar escopo', { acao: 'escopo', dados: { obra: obra.id }, v: 'outline', icone: 'check' })}</div>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Etapa</th><th>Responsável atual</th><th>Atribuições anteriores</th><th></th></tr></thead><tbody>
        ${etapas.map(e => html`<tr><td>${e.nome}<span class="subline">${store.obter('obras', e.obraId)?.nome}</span></td><td>${e.responsavelNome || 'Não atribuído'}</td>
          <td>${store.filtrar('atribuicoes', a => a.etapaId === e.id).map(a => html`<span class="subline">${nomeUsuario(store, a.responsavelId)} · ${dataHora(a.inicio)} → ${a.fim ? dataHora(a.fim) : 'Atual'}</span>`)}</td>
          <td>${botao('Alterar responsável', { acao: 'responsavel', dados: { id: e.id }, v: 'outline', tam: 'sm', icone: 'user' })}</td></tr>`)}</tbody></table></div>${etapas.length ? '' : vazio('Nenhuma etapa nesta obra.')}</div>`;
    },
  },
  {
    id: 'dashboard', titulo: 'Dashboard', icone: 'chart', descricao: 'Limite máximo de dias por consulta no Dashboard.',
    resumo: ({ store }) => store.config.dashboardMaxDias ? `Limite: ${store.config.dashboardMaxDias} dias` : 'Sem limite de período',
    view: ({ store }) => html`<h2>Dashboard</h2><div class="panel toolbar" style="margin-top:10px;align-items:flex-end">${campo('Limite máximo de dias por consulta', html`<input type="number" min="1" step="1" data-limite value="${store.config.dashboardMaxDias ?? ''}" placeholder="Sem limite">`)}${botao('Salvar limite', { acao: 'limite', v: 'outline', icone: 'check' })}</div>`,
  },
  {
    id: 'dados', titulo: 'Dados e backup', icone: 'download', descricao: 'Exportar e importar o JSON completo e limpar dados.',
    resumo: ({ store }) => `Armazenamento: ${store.adaptador.nome}`,
    view: ({ store }) => html`<h2>Dados e backup</h2><div class="panel" style="margin-top:10px;display:flex;flex-direction:column;gap:12px">
      <p class="muted">Os dados ficam no armazenamento local deste navegador (${store.adaptador.nome}). Exporte um JSON completo para backup ou para levar a outro computador. O arquivo inclui os usuários com as senhas em hash.</p>
      <div class="toolbar">${botao('Exportar JSON completo', { acao: 'exportar', icone: 'download' })}${botao('Importar JSON', { acao: 'importar', v: 'outline', icone: 'upload' })}
        ${botao('Carregar data/dados-iniciais.json', { acao: 'carregar-servidor', v: 'outline', icone: 'file' })}</div>
      <div class="toolbar">${botao('Limpar dados', { acao: 'vazio', v: 'perigo', icone: 'x' })}</div>
      <p class="muted small">Limpar dados apaga obras, OPs, FAs, itens, materiais e notificações deste navegador; usuários e auditoria são mantidos.</p></div>`,
  },
  {
    id: 'abas', titulo: 'Abas registradas', icone: 'menu', descricao: 'Abas do menu, ordem, módulo e quem pode acessar.',
    resumo: () => `${config.abas.length} abas · ${config.abas.filter(a => a.visivel === false).length} fora do menu`,
    view: () => html`<h2>Abas registradas</h2><p class="muted small" style="margin:4px 0 10px">Para criar, ocultar ou reordenar abas use <code>node tools/simulflow.js</code> (veja o README).</p>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Ordem</th><th>Aba</th><th>Módulo</th><th>Perfis</th><th>Situação</th></tr></thead><tbody>
        ${config.abas.map(a => html`<tr><td>${a.ordem}</td><td><strong>${a.titulo}</strong><span class="subline">${a.id}</span></td><td><code>js/abas/${a.modulo}</code></td><td>${(a.perfis || ['todos']).join(', ')}</td><td>${badge(a.visivel === false ? 'Fora do menu' : 'No menu', a.visivel === false ? 'neutral' : 'green')}</td></tr>`)}</tbody></table></div></div>`,
  },
];

function indice(ctx) {
  return html`${cabecalho('Configurações', 'Escolha o que deseja configurar (somente host).', botao('Histórico', { acao: 'historico', v: 'outline', icone: 'history' }))}
    <nav class="cards-config" aria-label="Configurações">${SECOES.map(s => html`<a class="card-config" href="#/configuracoes/${s.id}">
      <span class="stat-icon blue">${ic(s.icone, 20)}</span><span class="card-config-texto"><strong>${s.titulo}</strong><span>${s.descricao}</span><small>${s.resumo(ctx)}</small></span>${ic('chevronRight')}</a>`)}</nav>`;
}

function view(ctx) {
  const secao = SECOES.find(s => s.id === ctx.params[0]);
  if (!secao) return indice(ctx);
  return html`<p class="muted small"><a class="link" href="#/configuracoes">Configurações</a> / ${secao.titulo}</p>
    ${cabecalho(secao.titulo, secao.descricao, html`<a class="btn outline" href="#/configuracoes">${ic('arrowLeft')}<span>Todas as configurações</span></a>`)}
    <section>${secao.view(ctx)}</section>`;
}

export default {
  id: 'configuracoes',
  titulo: 'Configurações',
  onMount(el, ctx) {
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      cliques: {
        historico: () => abrirHistorico(store, 'Configurações', a => ['config', 'tipoEnsaio', 'sistema', 'usuario'].includes(a.entidade) || a.acao.startsWith('Escopo') || a.acao.startsWith('Responsável')),
        tema: d => { definirTema(d.valor); ctx.rerender(); },
        'tipo-novo': () => formTipo(ctx),
        'tipo-editar': d => formTipo(ctx, store.obter('tiposEnsaio', d.id)),
        politica: d => { acoes.programacao.definirPolitica({ tipo: d.tipo, politica: el.querySelector(`[data-politica="${d.tipo}"]`).value }); toast('Política salva'); },
        escopo: d => { acoes.obras.escopoEtapas({ obraId: d.obra, escopo: el.querySelector('[data-escopo]').value }); toast('Escopo salvo'); },
        responsavel: d => {
          const e = store.obter('etapas', d.id);
          modal({ titulo: 'Alterar responsável', descricao: e.nome, corpo: campo('Novo responsável', seletor('responsavelId', opcoesUsuarios(store), e.responsavelId || '', 'required'), { obrig: true }),
            onOk: v => { acoes.etapas.alterarResponsavel({ id: e.id, responsavelId: v.responsavelId }); toast('Responsável alterado'); } });
        },
        limite: () => { acoes.programacao.definirLimiteDashboard({ dias: el.querySelector('[data-limite]').value }); toast('Limite salvo'); },
        exportar: () => { baixarJSON(`simulflow-backup-${new Date().toISOString().slice(0, 10)}`, store.exportar()); toast('Backup exportado'); },
        importar: async () => {
          const pacote = await escolherJSON();
          if (await confirmar('Importar backup?', 'Todos os dados atuais deste navegador (inclusive usuários) serão substituídos pelo conteúdo do arquivo.', 'Importar')) {
            acoes.dados.importarBackup(pacote); toast('Backup importado. Entre novamente se necessário.');
          }
        },
        'carregar-servidor': async () => {
          const r = await fetch('data/dados-iniciais.json', { cache: 'no-cache' }).catch(() => null);
          if (!r || !r.ok) throw new Error('Arquivo data/dados-iniciais.json não encontrado (instale com: node tools/simulflow.js importar <arquivo>)');
          const pacote = await r.json();
          if (await confirmar('Carregar dados do arquivo do servidor?', 'Todos os dados atuais deste navegador serão substituídos.', 'Carregar')) { acoes.dados.importarBackup(pacote); toast('Dados carregados'); }
        },
        vazio: async () => { if (await confirmar('Limpar dados?', 'Obras, OPs, FAs, itens, materiais e notificações serão apagados deste navegador. Usuários e auditoria são mantidos. Exporte um backup antes, se precisar.', 'Limpar dados')) { acoes.dados.comecarVazio(); toast('Dados de negócio limpos'); } },
      },
    });
    const muda = e => { if (e.target.matches('[data-obra-config]')) { obraSel = e.target.value; ctx.rerender(); } };
    el.addEventListener('change', muda);
    const antes = desligar;
    desligar = () => { antes(); el.removeEventListener('change', muda); };
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) { el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`); },
};
