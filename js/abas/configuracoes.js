// Aba Configurações (somente host): limites de ensaio, políticas de observação, etapas/responsáveis,
// escopo das etapas, dados (exportar/importar JSON, demonstração) e abas registradas.
import { html, cabecalho, botao, campo, seletor, modal, toast, confirmar, vazio, rodape, delegar, badge } from '../core/ui.js';
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

function view(ctx) {
  const { store } = ctx;
  const obras = store.filtrar('obras', o => !o.parentId && !o.arquivado);
  const obra = obras.find(o => o.id === obraSel) || obras[0];
  const ids = obra ? [obra.id, ...store.filtrar('obras', o => o.parentId === obra.id).map(o => o.id)] : [];
  const etapas = store.filtrar('etapas', e => ids.includes(e.obraId) && !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  const pol = store.config.politicas;
  const opcoesPol = [{ v: 'opcional', t: 'Opcional' }, { v: 'sempre', t: 'Obrigatória sempre' }, { v: 'condicional', t: 'Obrigatória em redução ou atraso' }];
  return html`${cabecalho('Configurações', 'Administração do acompanhamento (somente host).', botao('Histórico', { acao: 'historico', v: 'outline', icone: 'history' }))}
    <section class="section"><div class="section-title"><h2>Limites por tipo de ensaio e status</h2>${botao('Tipo de ensaio', { acao: 'tipo-novo', icone: 'plus' })}</div>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Tipo de ensaio</th>${STATUS_ENSAIO_ABERTO.map(s => html`<th>${s}</th>`)}<th></th></tr></thead><tbody>
        ${store.todos('tiposEnsaio').map(t => html`<tr><td><strong>${t.nome}</strong></td>${STATUS_ENSAIO_ABERTO.map(s => html`<td>${t.limites?.[s] ? t.limites[s] + ' h' : html`<span class="amber">limite não configurado</span>`}</td>`)}
          <td>${botao('Configurar', { acao: 'tipo-editar', dados: { id: t.id }, v: 'outline', tam: 'sm' })}</td></tr>`)}</tbody></table></div>${store.todos('tiposEnsaio').length ? '' : vazio('Nenhum tipo de ensaio.')}</div></section>
    <section class="section"><h2>Observação por tipo de atualização</h2><div class="grid-2" style="margin-top:10px">
      ${[['quantidade', 'Quantidade realizada (itens e etapas adicionais)'], ['efetivo', 'Efetivo por turno']].map(([k, r]) => html`<div class="panel toolbar" style="align-items:flex-end">${campo(r, seletor('pol-' + k, opcoesPol, pol[k], `data-politica="${k}"`))}${botao('Salvar', { acao: 'politica', dados: { tipo: k }, v: 'outline', icone: 'check' })}</div>`)}</div></section>
    <section class="section"><h2>Etapas e responsáveis</h2>
      ${obra ? html`<div class="filters" style="margin-top:10px"><label class="field"><span class="field-label">Obra</span><select data-obra-config>${obras.map(o => html`<option value="${o.id}"${o.id === obra.id ? ' selected' : ''}>${o.nome}</option>`)}</select></label>
        <label class="field"><span class="field-label">Definição de etapas</span><select data-escopo><option value="obra"${obra.escopoEtapas !== 'subprojeto' ? ' selected' : ''}>Etapas e responsáveis definidos na obra</option><option value="subprojeto"${obra.escopoEtapas === 'subprojeto' ? ' selected' : ''}>Definidos por sub-projeto</option></select></label>
        ${botao('Salvar escopo', { acao: 'escopo', dados: { obra: obra.id }, v: 'outline', icone: 'check' })}</div>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Etapa</th><th>Responsável atual</th><th>Atribuições anteriores</th><th></th></tr></thead><tbody>
        ${etapas.map(e => html`<tr><td>${e.nome}<span class="subline">${store.obter('obras', e.obraId)?.nome}</span></td><td>${e.responsavelNome || 'Não atribuído'}</td>
          <td>${store.filtrar('atribuicoes', a => a.etapaId === e.id).map(a => html`<span class="subline">${nomeUsuario(store, a.responsavelId)} · ${dataHora(a.inicio)} → ${a.fim ? dataHora(a.fim) : 'Atual'}</span>`)}</td>
          <td>${botao('Alterar responsável', { acao: 'responsavel', dados: { id: e.id }, v: 'outline', tam: 'sm', icone: 'user' })}</td></tr>`)}</tbody></table></div>${etapas.length ? '' : vazio('Nenhuma etapa nesta obra.')}</div>` : vazio('Nenhuma obra ativa.')}</section>
    <section class="section"><h2>Dashboard</h2><div class="panel toolbar" style="margin-top:10px;align-items:flex-end">${campo('Limite máximo de dias por consulta', html`<input type="number" min="1" step="1" data-limite value="${store.config.dashboardMaxDias ?? ''}" placeholder="Sem limite">`)}${botao('Salvar limite', { acao: 'limite', v: 'outline', icone: 'check' })}</div></section>
    <section class="section"><h2>Dados e backup</h2><div class="panel" style="margin-top:10px;display:flex;flex-direction:column;gap:12px">
      <p class="muted">Os dados ficam no armazenamento local deste navegador (${store.adaptador.nome}). Exporte um JSON completo para backup ou para levar a outro computador. O arquivo inclui os usuários com as senhas em hash.</p>
      <div class="toolbar">${botao('Exportar JSON completo', { acao: 'exportar', icone: 'download' })}${botao('Importar JSON', { acao: 'importar', v: 'outline', icone: 'upload' })}
        ${botao('Carregar data/dados-iniciais.json', { acao: 'carregar-servidor', v: 'outline', icone: 'file' })}</div>
      <div class="toolbar">${botao('Restaurar demonstração', { acao: 'demo', v: 'outline', icone: 'restore' })}${botao('Começar vazio', { acao: 'vazio', v: 'perigo', icone: 'x' })}</div>
      <p class="muted small">Restaurar demonstração e Começar vazio substituem obras, OPs, FAs, itens, materiais e notificações; usuários e auditoria são mantidos.</p></div></section>
    <section class="section"><h2>Abas registradas</h2><p class="muted small" style="margin:4px 0 10px">Para criar, ocultar ou reordenar abas use <code>node tools/simulflow.js</code> (veja o README).</p>
      <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Ordem</th><th>Aba</th><th>Módulo</th><th>Perfis</th><th>Situação</th></tr></thead><tbody>
        ${config.abas.map(a => html`<tr><td>${a.ordem}</td><td><strong>${a.titulo}</strong><span class="subline">${a.id}</span></td><td><code>js/abas/${a.modulo}</code></td><td>${(a.perfis || ['todos']).join(', ')}</td><td>${badge(a.visivel === false ? 'Oculta' : 'Visível', a.visivel === false ? 'neutral' : 'green')}</td></tr>`)}</tbody></table></div></div></section>`;
}

export default {
  id: 'configuracoes',
  titulo: 'Configurações',
  onMount(el, ctx) {
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      cliques: {
        historico: () => abrirHistorico(store, 'Configurações', a => ['config', 'tipoEnsaio', 'sistema', 'usuario'].includes(a.entidade) || a.acao.startsWith('Escopo') || a.acao.startsWith('Responsável')),
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
        demo: async () => { if (await confirmar('Restaurar demonstração?', 'Obras, OPs, FAs, itens, materiais e notificações atuais serão substituídos pelos dados de exemplo.', 'Restaurar')) { acoes.dados.restaurarDemonstracao(); toast('Demonstração restaurada'); } },
        vazio: async () => { if (await confirmar('Começar vazio?', 'Obras, OPs, FAs, itens, materiais e notificações serão apagados deste navegador. Usuários e auditoria são mantidos. Exporte um backup antes, se precisar.', 'Apagar e começar vazio')) { acoes.dados.comecarVazio(); toast('Dados de negócio limpos'); } },
      },
    });
    const muda = e => { if (e.target.matches('[data-obra-config]')) { obraSel = e.target.value; ctx.rerender(); } };
    el.addEventListener('change', muda);
    const antes = desligar;
    desligar = () => { antes(); el.removeEventListener('change', muda); };
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) { el.innerHTML = String(html`<main class="page">${view(ctx)}${rodape()}</main>`); },
};
