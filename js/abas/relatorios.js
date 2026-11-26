// Aba Relatórios: desempenho da produção, ocorrências, qualidade, materiais e FAs por período.
import { html, cabecalho, botao, busca, filtro, vazio, delegar, stat } from '../core/ui.js';
import { config } from '../core/config.js';
import { unicos, numero } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';
import { barras } from '../componentes/graficos.js';
import { combinaOP, opAtrasada, progressoOP, statusExibidoOP, faAtrasada } from '../data/regras.js';
import { baixarCSV } from '../core/exportar.js';

const estado = { f: { busca: '', mes: '', obra: '', setor: '' } };
let desligar = null;

function linhas(ctx) {
  const { store } = ctx;
  const f = estado.f;
  return store.filtrar('ops', o => combinaOP(o, store.obter('obras', o.obraId), f.busca) && (!f.obra || o.obraId === f.obra || store.obter('obras', o.obraId)?.parentId === f.obra) &&
    (!f.setor || o.setor === f.setor) && (!f.mes || o.inicio.slice(0, 7) === f.mes));
}

function view(ctx) {
  const { store } = ctx;
  const f = estado.f;
  const ops = linhas(ctx);
  const ids = new Set(ops.map(o => o.id));
  const eventos = store.filtrar('eventos', e => ids.has(e.opId));
  const paradas = eventos.filter(e => e.tipo === 'parada');
  const setores = unicos(ops.map(o => o.setor));
  const plan = ops.reduce((s, o) => s + o.planejado, 0), prod = ops.reduce((s, o) => s + o.produzido, 0);
  const fas = store.filtrar('fas', fa => !f.obra || fa.obraId === f.obra);
  return html`${cabecalho('Relatórios e Indicadores', 'Desempenho da produção, ocorrências e qualidade por período.', botao('Exportar relatório', { acao: 'csv', v: 'outline', icone: 'download' }))}
    <div class="filters">${busca('f.busca', f.busca)}<input type="month" data-k="f.mes" value="${f.mes}" aria-label="Período do relatório (mês de início da OP)">
      ${filtro('f.obra', [{ v: '', t: 'Todos os projetos' }, ...store.filtrar('obras', o => !o.parentId).map(o => ({ v: o.id, t: o.nome }))], f.obra, 'Projeto do relatório')}
      ${filtro('f.setor', [{ v: '', t: 'Todos os setores' }, ...config.app.setoresOP], f.setor, 'Setor do relatório')}
      ${f.busca || f.mes || f.obra || f.setor ? botao('', { acao: 'limpar', dados: { prefixo: 'f' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}<span class="filter-count">${ops.length} ordens no período</span></div>
    <div class="stats">${stat({ rotulo: 'Ordens concluídas', valor: ops.filter(o => o.status === 'Concluída').length, icone: 'check', cor: 'green', rodape: 'Finalizadas com aprovação' })}
      ${stat({ rotulo: 'Ordens atrasadas', valor: ops.filter(o => opAtrasada(o)).length, icone: 'alert', cor: 'red', rodape: 'Prazo de entrega ultrapassado' })}
      ${stat({ rotulo: 'Quantidade produzida', valor: numero(prod, 0), icone: 'package', rodape: 'Unidades registradas' })}
      ${stat({ rotulo: 'Paradas registradas', valor: paradas.length, icone: 'pause', cor: 'amber', rodape: 'Ocorrências na produção' })}</div>
    <div class="grid-2"><section class="panel"><div class="panel-heading"><div><h2>Desempenho por setor</h2><p>Quantidades planejadas e produzidas</p></div></div>
        ${setores.length ? barras(setores.map(s => { const os = ops.filter(o => o.setor === s); return { rotulo: s, total: os.reduce((a, o) => a + o.planejado, 0), feito: os.reduce((a, o) => a + o.produzido, 0) }; }), { rotuloFeito: 'Produzido' }) : vazio()}</section>
      <section class="panel"><div class="panel-heading"><div><h2>Principais motivos de parada</h2><p>Ocorrências registradas nas ordens selecionadas</p></div></div>
        <div class="alert-list">${paradas.map(e => html`<div class="alert-item"><span class="alert-symbol amber">❚❚</span><div class="alert-copy"><strong>${e.descricao.split('.')[0]}</strong><p>${e.ref} · ${e.resolvida ? 'Resolvida' : 'Pendente'}</p></div></div>`)}${paradas.length ? '' : vazio()}</div></section></div>
    <section class="section table-wrap"><div class="table-head"><h2>Qualidade, materiais e FAs</h2></div><div class="stats" style="padding:16px;margin:0">
      ${stat({ rotulo: 'Inspeções aprovadas', valor: eventos.filter(e => e.tipo === 'inspeção' && e.descricao.includes('aprovada')).length, icone: 'check', cor: 'green' })}
      ${stat({ rotulo: 'Inspeções reprovadas', valor: eventos.filter(e => e.tipo === 'inspeção' && e.descricao.includes('reprovada')).length, icone: 'x', cor: 'red' })}
      ${stat({ rotulo: 'Materiais abaixo do mínimo', valor: store.filtrar('materiais', m => m.estoque < m.minimo && ops.some(o => o.numero === m.opNumero)).length, icone: 'boxes', cor: 'amber' })}
      ${stat({ rotulo: 'Conclusão global', valor: (plan ? Math.round(prod / plan * 100) : 0) + '%', icone: 'target' })}
      ${stat({ rotulo: 'FAs atrasadas', valor: fas.filter(x => faAtrasada(x)).length + ' de ' + fas.length, icone: 'workflow', cor: 'red' })}</div></section>`;
}

export default {
  id: 'relatorios',
  titulo: 'Relatórios',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: { ...ctl.cliques, csv: () => baixarCSV('relatorio-producao', linhas(ctx).map(o => ({ OP: o.numero, Projeto: ctx.store.obter('obras', o.obraId)?.nome || '', Setor: o.setor, Planejado: o.planejado, Produzido: o.produzido, Conclusao: progressoOP(o) + '%', Status: statusExibidoOP(o), Prazo: o.prazo }))) },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) { el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`); },
};
