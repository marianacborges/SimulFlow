// Aba Histórico: rastreabilidade das movimentações entre setores e auditoria completa.
// Rotas: #/historico/movimentacoes · #/historico/auditoria
import { html, cabecalho, subabas, botao, busca, filtro, vazio, delegar, paginacao } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, hora, dataHora, combinaTexto, unicos } from '../core/util.js';
import { controleEstado, diferencas } from '../componentes/comuns.js';
import { camposBuscaOP } from '../data/regras.js';
import { baixarCSV } from '../core/exportar.js';

const estado = { mov: { busca: '', setor: '', tipo: '', dia: '' }, aud: { busca: '', entidade: '', dia: '', pagina: 1 } };
let ultimaQuery = '';
let desligar = null;

function movimentos(ctx) {
  const { store } = ctx;
  const f = estado.mov;
  return store.filtrar('eventos', e => combinaTexto(f.busca, [e.ref, e.ator, e.descricao, e.providencia, ...camposBuscaOP(store.obter('ops', e.opId), store.obter('obras', store.obter('ops', e.opId)?.obraId))]) &&
    (!f.setor || e.origem === f.setor) && (!f.tipo || e.tipo === f.tipo) && (!f.dia || e.em.slice(0, 10) === f.dia || data(e.em) === data(f.dia))).sort((a, b) => b.em.localeCompare(a.em));
}

function auditoria(ctx) {
  const { store } = ctx;
  const f = estado.aud;
  return store.filtrar('auditoria', a => combinaTexto(f.busca, [a.acao, a.ator, a.nota, a.entidade]) && (!f.entidade || a.entidade === f.entidade) && (!f.dia || data(a.em) === data(f.dia)))
    .sort((a, b) => b.em.localeCompare(a.em));
}

function viewMov(ctx) {
  const { store } = ctx;
  const f = estado.mov;
  const lista = movimentos(ctx);
  return html`${cabecalho('Histórico e Rastreabilidade', 'Registro cronológico das movimentações e alterações da produção.', botao('Exportar histórico', { acao: 'csv-mov', v: 'outline', icone: 'download' }))}
    <div class="filters">${busca('mov.busca', f.busca)}
      ${filtro('mov.setor', [{ v: '', t: 'Todos os setores' }, ...unicos([...config.app.areas, ...config.app.setoresOP, ...store.todos('eventos').map(e => e.origem)])], f.setor, 'Setor do histórico')}
      ${filtro('mov.tipo', [{ v: '', t: 'Todas as movimentações' }, ...unicos(store.todos('eventos').map(e => e.tipo))], f.tipo, 'Tipo de movimentação')}
      <input type="date" data-k="mov.dia" value="${f.dia}" aria-label="Data da movimentação">
      ${f.busca || f.setor || f.tipo || f.dia ? botao('', { acao: 'limpar', dados: { prefixo: 'mov' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}<span class="filter-count">${lista.length} registros</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Data e hora</th><th>Referência</th><th>Setor / responsável</th><th>Movimentação</th><th>Alteração de status</th><th>Providência</th></tr></thead><tbody>
      ${lista.map(e => html`<tr><td>${data(e.em)}<span class="subline">${hora(e.em)}</span></td><td class="code">${e.ref}</td><td>${e.origem}<span class="subline">${e.ator}</span></td>
        <td>${e.tipo}<span class="subline">${e.descricao}</span></td><td>${e.statusAnterior || '—'} → ${e.statusNovo || '—'}</td><td>${e.providencia || '—'}</td></tr>`)}</tbody></table></div>${lista.length ? '' : vazio()}</div>`;
}

function viewAud(ctx) {
  const { store } = ctx;
  const f = estado.aud;
  const lista = auditoria(ctx);
  const tam = 25;
  const pagina = Math.min(f.pagina || 1, Math.max(1, Math.ceil(lista.length / tam)));
  return html`${cabecalho('Auditoria completa', 'Todas as gravações do sistema (somente inserção): quem, quando, antes e depois.', botao('Exportar auditoria', { acao: 'csv-aud', v: 'outline', icone: 'download' }))}
    <div class="filters">${busca('aud.busca', f.busca, 'Buscar ação, usuário ou observação...')}
      ${filtro('aud.entidade', [{ v: '', t: 'Todos os registros' }, ...unicos(store.todos('auditoria').map(a => a.entidade))], f.entidade, 'Tipo de registro')}
      <input type="date" data-k="aud.dia" value="${f.dia}" aria-label="Data"><span class="filter-count">${lista.length} registros</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>
      ${lista.slice((pagina - 1) * tam, pagina * tam).map(a => html`<tr><td>${dataHora(a.em)}</td><td>${a.ator}</td><td>${a.acao}${a.turno ? html`<span class="subline">Turno ${a.turno}</span>` : ''}</td><td>${a.entidade}</td>
        <td>${diferencas(store, a.antes, a.depois).map(t => html`<span class="subline">${t}</span>`)}${a.nota ? html`<span class="subline">${a.nota}</span>` : ''}</td></tr>`)}</tbody></table></div>
      ${lista.length ? '' : vazio()}${paginacao(lista.length, pagina, tam, 'aud.pagina')}</div>`;
}

export default {
  id: 'historico',
  titulo: 'Histórico',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques,
        'csv-mov': () => baixarCSV('historico', movimentos(ctx).map(e => ({ Data: dataHora(e.em), Referencia: e.ref, Origem: e.origem, Destinatarios: e.destinatarios.join(', '), Responsavel: e.ator, Tipo: e.tipo, Descricao: e.descricao, StatusAnterior: e.statusAnterior, StatusNovo: e.statusNovo, Providencia: e.providencia }))),
        'csv-aud': () => baixarCSV('auditoria', auditoria(ctx).map(a => ({ Data: dataHora(a.em), Usuario: a.ator, Acao: a.acao, Registro: a.entidade, Detalhes: diferencas(ctx.store, a.antes, a.depois).join(' | '), Observacao: a.nota, Turno: a.turno }))),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const q = ctx.query?.q || '';
    if (q !== ultimaQuery) { ultimaQuery = q; if (q) estado.mov.busca = q; }
    const [secao = 'movimentacoes'] = ctx.params;
    el.innerHTML = String(html`<main class="page">${subabas([['movimentacoes', 'Movimentações', 'history'], ['auditoria', 'Auditoria completa', 'lock']], secao, 'historico')}${secao === 'auditoria' ? viewAud(ctx) : viewMov(ctx)}</main>`);
  },
};
