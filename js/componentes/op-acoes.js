// OPs: tabela com filtros/paginação, formulário e registros (produção, ocorrência, inspeção, retomada, atualização).
import { html, campo, seletor, modal, botao, badge, toast, progresso, busca, filtro, paginacao, vazio } from '../core/ui.js';
import { config } from '../core/config.js';
import { formCamposExtras } from './comuns.js';
import { progressoOP, opAtrasada, statusExibidoOP, combinaOP } from '../data/regras.js';
import { data, hoje, diasEntre, numero } from '../core/util.js';
import { baixarCSV } from '../core/exportar.js';

export function badgeOP(op) {
  return badge(statusExibidoOP(op));
}

export function progressoDaOP(op) {
  return progresso(progressoOP(op), `${numero(op.produzido, 0)} / ${numero(op.planejado, 0)}`);
}

export function formOP(ctx, op = null) {
  const { store, acoes } = ctx;
  const obras = store.filtrar('obras', o => !o.arquivado);
  modal({
    titulo: op ? 'Editar ordem de produção' : 'Nova ordem de produção', largo: true,
    descricao: 'Planejamento e identificação da OP e da ficha de acompanhamento.',
    corpo: html`<div class="form-grid">
      ${campo('Número da OP', html`<input name="numero" required value="${op?.numero || ''}" placeholder="OP-2026-009">`, { obrig: true })}
      ${campo('Ficha de acompanhamento', html`<input name="faFicha" required value="${op?.faFicha || ''}" placeholder="FA-009">`, { obrig: true })}
      ${campo('Produto', html`<input name="produto" required value="${op?.produto || ''}">`, { obrig: true, full: true })}
      ${campo('Projeto/Obra', seletor('obraId', [{ v: '', t: 'Selecione' }, ...obras.map(o => ({ v: o.id, t: o.parentId ? '↳ ' + o.nome : o.nome }))], op?.obraId || '', 'required'), { obrig: true })}
      ${campo('Quantidade planejada', html`<input name="planejado" type="number" min="1" step="1" required value="${op?.planejado ?? ''}">`, { obrig: true })}
      ${campo('Setor responsável', seletor('setor', config.app.setoresOP, op?.setor || 'Produção'))}
      ${campo('Responsável', html`<input name="responsavel" required value="${op?.responsavel || ''}">`, { obrig: true })}
      ${campo('Data de início', html`<input name="inicio" type="date" required value="${op?.inicio || hoje()}">`, { obrig: true })}
      ${campo('Prazo de entrega', html`<input name="prazo" type="date" required value="${op?.prazo || ''}">`, { obrig: true })}
      ${formCamposExtras('op', op?.campos)}
    </div>`,
    rotuloOk: op ? 'Salvar alterações' : 'Cadastrar ordem',
    onOk: d => { acoes.ops.salvarOP({ ...d, id: op?.id }); toast(op ? 'Ordem atualizada' : 'Ordem cadastrada e setores notificados'); },
  });
}

const TITULOS = { 'produção': 'Registrar produção', 'parada': 'Registrar ocorrência', 'inspeção': 'Registrar inspeção', 'retomada': 'Liberar produção', 'atualização': 'Atualização do projeto' };

export function modalRegistroOP(ctx, op, tipo) {
  const restante = op.planejado - op.produzido;
  modal({
    titulo: TITULOS[tipo], descricao: `${op.numero} · ${op.produto}`,
    corpo: html`
      ${tipo === 'produção' ? campo(`Quantidade produzida (restante: ${restante})`, html`<input name="quantidade" type="number" min="1" max="${restante}" step="1" required>`, { obrig: true }) : ''}
      ${tipo === 'parada' ? campo('Motivo da parada', seletor('motivo', config.app.motivosParada, config.app.motivosParada[0])) : ''}
      ${tipo === 'inspeção' ? campo('Resultado da inspeção', seletor('motivo', ['Aprovada', 'Reprovada'], 'Aprovada')) : ''}
      ${campo(tipo === 'retomada' ? 'Providência tomada' : 'Observações', html`<textarea name="nota" ${tipo !== 'produção' ? 'required' : ''} placeholder="${tipo === 'inspeção' ? 'Resultado, observações ou não conformidades...' : 'Detalhes do registro...'}"></textarea>`, { obrig: tipo !== 'produção' })}`,
    rotuloOk: 'Confirmar registro',
    onOk: d => { ctx.acoes.ops.registrarOP({ id: op.id, tipo, ...d }); toast('Registro salvo e setores notificados'); },
  });
}

export function cliquesOP(ctx) {
  const op = id => ctx.store.obter('ops', id);
  return {
    'op-nova': () => formOP(ctx),
    'op-editar': d => formOP(ctx, op(d.id)),
    'op-registro': d => modalRegistroOP(ctx, op(d.id), d.tipo),
  };
}

/** Tabela de OPs (estado: { busca, status, setor, periodo, ordem, pagina }). */
export function tabelaOPs(ctx, estado, { compacto = false, prefixo = 'op', incluir = null } = {}) {
  const { store } = ctx;
  const k = s => `${prefixo}.${s}`;
  const obra = id => store.obter('obras', id);
  const status = estado.status ?? '';
  const lista = store.todos('ops').filter(o => (!incluir || incluir(o)) && combinaOP(o, obra(o.obraId), estado.busca || '') &&
    (!status || (status === 'Atrasada' ? opAtrasada(o) : o.status === status)) &&
    (!estado.setor || o.setor === estado.setor) && (!estado.periodo || o.prazo.slice(0, 7) === estado.periodo) &&
    (!estado.obra || o.obraId === estado.obra))
    .sort((a, b) => estado.ordem === 'status' ? a.status.localeCompare(b.status) : estado.ordem === 'prazo' ? a.prazo.localeCompare(b.prazo)
      : estado.ordem === 'abertura' ? (b.criadoEm || '').localeCompare(a.criadoEm || '') : a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
  const tam = compacto ? 5 : 10;
  const pagina = Math.min(estado.pagina || 1, Math.max(1, Math.ceil(lista.length / tam)));
  const visiveis = lista.slice((pagina - 1) * tam, pagina * tam);
  const filtrosAtivos = estado.busca || status || estado.setor || estado.periodo || estado.obra;
  const linhaCSV = o => ({ OP: o.numero, 'Ficha de acompanhamento': o.faFicha, Produto: o.produto, Projeto: obra(o.obraId)?.nome || '', Setor: o.setor, Responsavel: o.responsavel, Planejado: o.planejado, Produzido: o.produzido, Conclusao: progressoOP(o) + '%', Status: statusExibidoOP(o), Inicio: o.inicio, Prazo: o.prazo });
  ctx._csvOPs = () => baixarCSV('ordens-producao', lista.map(linhaCSV));
  return html`<section class="table-wrap">
    <div class="table-head"><h2>${compacto ? 'Acompanhamento das ordens' : 'Todas as ordens de produção'}<span class="count-pill">${store.todos('ops').length}</span></h2>
      ${compacto ? html`<a class="link" href="#/pcp/ops">Ver todas as ordens</a>` : botao('Exportar', { acao: 'op-csv', v: 'ghost', tam: 'sm', icone: 'download' })}</div>
    <div class="filters" style="padding:12px 16px 0">${busca(k('busca'), estado.busca)}
      ${filtro(k('status'), [{ v: '', t: 'Todos os status' }, ...config.app.statusOP], status, 'Filtrar status')}
      ${filtro(k('setor'), [{ v: '', t: 'Todos os setores' }, ...config.app.setoresOP], estado.setor, 'Filtrar setor')}
      ${compacto ? '' : html`${filtro(k('obra'), [{ v: '', t: 'Todas as obras' }, ...store.filtrar('obras', o => !o.parentId).map(o => ({ v: o.id, t: o.nome }))], estado.obra, 'Filtrar obra')}
        <input type="month" data-k="${k('periodo')}" value="${estado.periodo || ''}" aria-label="Período de entrega">
        ${filtro(k('ordem'), [{ v: 'numero', t: 'Ordenar por OP' }, { v: 'prazo', t: 'Prazo de entrega' }, { v: 'abertura', t: 'Data de abertura' }, { v: 'status', t: 'Status' }], estado.ordem || 'numero', 'Ordenar ordens')}`}
      ${filtrosAtivos ? botao('', { acao: 'limpar', dados: { prefixo }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}</div>
    <div class="table-scroll"><table><thead><tr><th>OP / Ficha</th><th>Produto / Projeto</th><th>Setor</th><th>Progresso</th><th>Prazo de entrega</th><th>Status</th><th></th></tr></thead><tbody>
    ${visiveis.map(o => {
      const restam = diasEntre(hoje(), o.prazo);
      return html`<tr><td><a class="code" href="#/pcp/op/${o.id}">${o.numero}</a><span class="subline">${o.faFicha}</span></td>
        <td>${o.produto}<span class="subline">${obra(o.obraId)?.nome || '—'}</span></td><td><span class="sector-tag">${o.setor}</span></td>
        <td>${progressoDaOP(o)}</td>
        <td><span class="${opAtrasada(o) ? 'red' : ''}">${data(o.prazo)}</span><span class="subline">${o.status === 'Concluída' ? 'Entregue' : opAtrasada(o) ? 'Prazo ultrapassado' : `${Math.max(0, restam)} dias restantes`}</span></td>
        <td>${badgeOP(o)}</td><td><a class="btn ghost icon" href="#/pcp/op/${o.id}" title="Ver detalhes" aria-label="Ver detalhes de ${o.numero}">›</a></td></tr>`;
    })}</tbody></table></div>
    ${lista.length ? '' : vazio()}
    ${paginacao(lista.length, pagina, tam, k('pagina'))}</section>`;
}
