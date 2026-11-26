// Aba Qualidade: inspeções de OPs, laudos de itens e acompanhamento de ensaios (execução, NII, NIII).
// Rotas: #/qualidade/inspecoes · #/qualidade/laudos · #/qualidade/ensaios
import { html, cabecalho, subabas, botao, badge, campo, seletor, modal, toast, busca, filtro, alternar, vazio, rodape, delegar, stat } from '../core/ui.js';
import { data, combinaTexto, hoje, numero } from '../core/util.js';
import { controleEstado, abrirHistorico, nomeUsuario } from '../componentes/comuns.js';
import { botoesItem, cliquesItem, badgeLaudo } from '../componentes/item-acoes.js';
import { cliquesOP, badgeOP } from '../componentes/op-acoes.js';
import { formExtra } from '../componentes/extra-form.js';
import { percentual, horasNoStatus, gargalo, camposBuscaOP } from '../data/regras.js';

const estado = { insp: { busca: '', resultado: '' }, laudo: { busca: '', status: '' }, ens: { busca: '', obra: '', tipo: '', pessoa: '', fechados: false } };
let desligar = null;

// ---------------- Inspeções de OP ----------------

function viewInspecoes(ctx) {
  const { store, regra } = ctx;
  const f = estado.insp;
  const ops = store.todos('ops');
  const obra = id => store.obter('obras', id);
  const pendentes = ops.filter(o => o.status === 'Aguardando qualidade' && combinaTexto(f.busca, camposBuscaOP(o, obra(o.obraId))));
  const inspecoes = store.filtrar('eventos', e => e.tipo === 'inspeção' && combinaTexto(f.busca, [e.ref, e.descricao, ...camposBuscaOP(store.obter('ops', e.opId), obra(store.obter('ops', e.opId)?.obraId))]) &&
    (!f.resultado || f.resultado === 'pendente' || e.descricao.toLowerCase().includes(f.resultado))).sort((a, b) => b.em.localeCompare(a.em));
  const todas = store.filtrar('eventos', e => e.tipo === 'inspeção');
  return html`${cabecalho('Controle da Qualidade', 'Inspeções, aprovações e registro de não conformidades.')}
    <div class="stats">${stat({ rotulo: 'Aguardando inspeção', valor: ops.filter(o => o.status === 'Aguardando qualidade').length, icone: 'clipboard', cor: 'cyan', rodape: 'Ordens prontas para avaliação' })}
      ${stat({ rotulo: 'Inspeções aprovadas', valor: todas.filter(e => e.descricao.includes('aprovada')).length, icone: 'check', cor: 'green', rodape: 'Produtos liberados' })}
      ${stat({ rotulo: 'Inspeções reprovadas', valor: todas.filter(e => e.descricao.includes('reprovada')).length, icone: 'x', cor: 'red', rodape: 'Não conformidades registradas' })}
      ${stat({ rotulo: 'Ordens concluídas', valor: ops.filter(o => o.status === 'Concluída').length, icone: 'package', rodape: 'Ciclo de produção finalizado' })}</div>
    <div class="filters">${busca('insp.busca', f.busca)}${filtro('insp.resultado', [{ v: '', t: 'Todos os resultados' }, { v: 'aprovada', t: 'Aprovadas' }, { v: 'reprovada', t: 'Reprovadas' }, { v: 'pendente', t: 'Aguardando inspeção' }], f.resultado, 'Resultado da inspeção')}</div>
    ${!f.resultado || f.resultado === 'pendente' ? html`<h2 style="margin-bottom:12px">Ordens aguardando inspeção</h2><div class="cards-grid">${pendentes.map(o => html`<article class="work-card">
      <div class="title-row"><a class="code" href="#/pcp/op/${o.id}">${o.numero}</a>${badgeOP(o)}</div><h2>${o.produto}</h2><p>${o.faFicha} · ${obra(o.obraId)?.nome || ''}</p>
      <div class="card-meta"><span>${o.produzido} unidades</span><span>Prazo ${data(o.prazo)}</span></div>
      ${botao('Registrar inspeção', { acao: 'op-registro', dados: { id: o.id, tipo: 'inspeção' }, tam: 'sm', icone: 'shield', desab: !regra('inspecaoOP') })}</article>`)}</div>${pendentes.length ? '' : vazio()}` : ''}
    ${f.resultado !== 'pendente' ? html`<section class="section"><div class="table-wrap"><div class="table-head"><h2>Inspeções realizadas</h2></div><div class="table-scroll"><table><thead><tr><th>Ordem</th><th>Resultado e observações</th><th>Data</th><th>Responsável</th></tr></thead><tbody>
      ${inspecoes.map(e => html`<tr><td class="code">${e.ref}</td><td>${e.descricao}</td><td>${data(e.em)}</td><td>${e.ator}</td></tr>`)}</tbody></table></div>${inspecoes.length ? '' : vazio()}</div></section>` : ''}`;
}

// ---------------- Laudos de itens ----------------

function viewLaudos(ctx) {
  const { store } = ctx;
  const f = estado.laudo;
  const extras = store.todos('extras');
  const itens = store.filtrar('itens', i => !i.arquivado && (!f.status || (i.laudo?.status || 'Pendente') === f.status) &&
    combinaTexto(f.busca, [i.codigo, i.serie, i.descricao, i.opNumero, i.laudo?.status, store.obter('obras', i.obraId)?.nome, store.obter('pedidos', i.pedidoId)?.numero]))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
  return html`${cabecalho('Laudos de itens', 'Concluir um item (100%) exige laudo aprovado; laudo reprovado limita o avanço a 99% e avisa Produção e PCP.')}
    <div class="filters">${busca('laudo.busca', f.busca, 'Buscar item, série, OP, obra ou pedido...')}
      ${filtro('laudo.status', [{ v: '', t: 'Todos os laudos' }, { v: 'Pendente', t: 'Aguardando laudo' }, 'Aprovado', 'Reprovado'], f.status, 'Laudo do item')}<span class="filter-count">${itens.length} itens</span></div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Item / série</th><th>Obra / pedido</th><th>OP</th><th>Avanço</th><th>Laudo</th><th>Ações</th></tr></thead><tbody>
      ${itens.map(i => html`<tr><td><strong>${i.codigo}</strong><span class="subline">${[i.descricao, i.serie].filter(Boolean).join(' · ')}</span></td>
        <td>${store.obter('obras', i.obraId)?.nome}<span class="subline">${store.obter('pedidos', i.pedidoId)?.numero || ''}</span></td><td>${i.opNumero || '—'}</td>
        <td>${numero(percentual(i, extras))}%</td><td>${badgeLaudo(i)}${i.laudo?.nota ? html`<span class="subline">${i.laudo.nota}</span>` : ''}${i.laudo ? html`<span class="subline">${i.laudo.por} · ${data(i.laudo.em)}</span>` : ''}</td>
        <td>${botoesItem(ctx, i, ['laudo', 'consumo', 'historico'])}</td></tr>`)}</tbody></table></div>${itens.length ? '' : vazio()}</div>`;
}

// ---------------- Ensaios ----------------

const GRUPOS = ['solicitado', 'em execução', 'aguardando NII', 'aguardando NIII', 'reprovado'];

function viewEnsaios(ctx) {
  const { store, regra, usuario } = ctx;
  const f = estado.ens;
  const todos = store.todos('ensaios');
  const abertos = todos.filter(e => !['aprovado', 'cancelado'].includes(e.status));
  const tipo = e => store.obter('tiposEnsaio', e.tipoId);
  const lista = todos.filter(e => (f.fechados || !['aprovado', 'cancelado'].includes(e.status)) && (!f.obra || e.obraId === f.obra) && (!f.tipo || e.tipoId === f.tipo) &&
    (!f.pessoa || e.inspetorId === f.pessoa || e.nii?.verificadorId === f.pessoa || e.niii?.verificadorId === f.pessoa) &&
    combinaTexto(f.busca, [e.codigo, store.obter('itens', e.itemId)?.codigo, store.obter('obras', e.obraId)?.nome]));
  const grupos = [...GRUPOS, ...(f.fechados ? ['aprovado', 'cancelado'] : [])];
  const reprovadosSemRetrabalho = abertos.filter(e => e.status === 'reprovado' && !store.achar('extras', x => x.origemId === e.id && x.tipo === 'retrabalho' && x.status === 'concluída')).length;
  const pessoas = store.filtrar('usuarios', p => p.ativo && (p.host || (p.funcoes || []).some(x => ['inspetor', 'nii', 'niii'].includes(x))));
  return html`${cabecalho('Acompanhamento de Ensaios', 'Execução, verificação NII e verificação NIII.', html`${ctx.host ? html`<a class="btn outline" href="#/configuracoes">Configurações</a>` : ''}
      ${botao('Solicitar ensaio', { acao: 'ensaio-novo', icone: 'plus', desab: !regra('solicitarEnsaio') })}`)}
    <div class="stats">${stat({ rotulo: 'Ensaios em aberto', valor: abertos.length, icone: 'flask', rodape: 'Solicitação e verificação' })}
      ${stat({ rotulo: 'Aguardando verificações', valor: abertos.filter(e => e.status.startsWith('aguardando')).length, icone: 'clock', rodape: 'NII e NIII' })}
      ${stat({ rotulo: 'Gargalos', valor: abertos.filter(e => gargalo(e, tipo(e))).length, icone: 'alert', cor: 'amber', rodape: 'Limites definidos pelo host' })}
      ${stat({ rotulo: 'Reprovados', valor: reprovadosSemRetrabalho, icone: 'wrench', cor: 'red', rodape: 'Retrabalho pendente' })}</div>
    <div class="filters">${busca('ens.busca', f.busca, 'Buscar laudo, item ou obra…')}
      ${filtro('ens.obra', [{ v: '', t: 'Todas as obras' }, ...store.filtrar('obras', o => !o.parentId && !o.arquivado).map(o => ({ v: o.id, t: o.nome }))], f.obra, 'Filtrar obra')}
      ${filtro('ens.tipo', [{ v: '', t: 'Todos os tipos' }, ...store.todos('tiposEnsaio').map(t => ({ v: t.id, t: t.nome }))], f.tipo, 'Filtrar tipo')}
      ${filtro('ens.pessoa', [{ v: '', t: 'Inspetores e verificadores' }, ...pessoas.map(p => ({ v: p.id, t: p.nome }))], f.pessoa, 'Filtrar profissional')}
      ${alternar('ens.fechados', f.fechados, 'Aprovados e cancelados')}</div>
    ${grupos.map(st => {
      const doGrupo = lista.filter(e => e.status === st);
      return html`<section class="section"><h2>${st.startsWith('aguardando') ? st.replace('aguardando', 'Aguardando verificação') : st[0].toUpperCase() + st.slice(1)} <span class="count-pill">${doGrupo.length}</span></h2>
        <div class="assay-grid" style="margin-top:10px">${doGrupo.map(e => cartaoEnsaio(ctx, e))}</div>${doGrupo.length ? '' : html`<p class="muted small">Nenhum ensaio neste status.</p>`}</section>`;
    })}`;
}

function cartaoEnsaio(ctx, e) {
  const { store, regra } = ctx;
  const item = store.obter('itens', e.itemId);
  const tipo = store.obter('tiposEnsaio', e.tipoId);
  const lento = gargalo(e, tipo);
  const verificador = e.status === 'aguardando NII' ? e.nii : e.status === 'aguardando NIII' ? e.niii : null;
  const atual = verificador ? verificador.verificadorId : e.inspetorId;
  const nivel = e.status === 'aguardando NII' ? 'NII' : 'NIII';
  return html`<article class="assay-card ${lento ? 'slow' : ''}"><div class="title-row"><h3>${e.codigo}</h3>${badge(e.status)}</div>
    <span>${tipo?.nome} · ${item?.codigo}</span><span class="subline">${store.obter('obras', e.obraId)?.nome}</span>
    <div class="assay-time"><strong>${numero(horasNoStatus(e), 1)} h nesta etapa</strong>${lento ? badge('Gargalo', 'amber') : ''}</div>
    <span class="subline">Responsável: ${atual ? nomeUsuario(store, atual) : 'Atribuição pendente'}</span>
    <div class="toolbar"><span class="small">NII ${badge(e.nii?.status || 'pendente')}</span><span class="small">NIII ${badge(e.niii?.status || 'pendente')}</span></div>
    ${e.pendencia ? html`<p class="pending-note">⚠ ${e.pendencia}</p>` : ''}${e.cancelamento ? html`<p class="small">Cancelamento: ${e.cancelamento}</p>` : ''}
    <div class="toolbar">
      ${['solicitado', 'em execução'].includes(e.status) && regra('executarEnsaio', e) ? botao(e.status === 'solicitado' ? 'Iniciar execução' : 'Concluir execução', { acao: 'ensaio-executar', dados: { id: e.id }, tam: 'sm', icone: 'play' }) : ''}
      ${regra('verificarEnsaio', e) ? html`${botao('Aprovar ' + nivel, { acao: 'ensaio-decidir', dados: { id: e.id, decisao: 'aprovado' }, tam: 'sm', icone: 'check' })}${botao('Reprovar', { acao: 'ensaio-decidir', dados: { id: e.id, decisao: 'reprovado' }, v: 'outline', tam: 'sm', icone: 'x' })}` : ''}
      ${e.status === 'reprovado' && regra('criarExtra') && item && !item.arquivado ? botao('Criar etapa de retrabalho', { acao: 'ensaio-retrabalho', dados: { id: e.id }, v: 'outline', tam: 'sm', icone: 'wrench' }) : ''}
      ${e.status !== 'cancelado' && regra('cancelarEnsaio') ? botao('', { acao: 'ensaio-cancelar', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'ban', titulo: 'Cancelar com justificativa' }) : ''}
      ${botao('', { acao: 'ensaio-historico', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: 'Histórico ' + e.codigo })}</div></article>`;
}

function formEnsaio(ctx) {
  const { store } = ctx;
  const obras = store.filtrar('obras', o => !o.parentId && !o.arquivado);
  const itensDe = id => [{ v: '', t: 'Selecione' }, ...store.filtrar('itens', i => i.obraId === id && !i.arquivado).map(i => ({ v: i.id, t: `${i.codigo}${i.descricao ? ' · ' + i.descricao : ''}` }))];
  const pessoas = funcao => store.filtrar('usuarios', p => p.ativo && (p.host || (p.funcoes || []).includes(funcao))).map(p => ({ v: p.id, t: p.nome }));
  const sel = (nome, rot, funcao) => { const ops = pessoas(funcao); return campo(rot, seletor(nome, [{ v: '', t: 'Selecione' }, ...ops], ops[0]?.v || '', 'required'), { obrig: true }); };
  modal({
    titulo: 'Solicitar ensaio', descricao: 'Vincular laudo ao item e atribuir os profissionais. O item fica bloqueado até a aprovação.', largo: true,
    corpo: html`<div class="form-grid">${campo('Obra', seletor('obraId', obras.map(o => ({ v: o.id, t: o.nome })), obras[0]?.id || '', 'data-obra required'), { obrig: true })}
      <div data-itens>${campo('Item', seletor('itemId', itensDe(obras[0]?.id), '', 'required'), { obrig: true })}</div>
      ${campo('Tipo de ensaio', seletor('tipoId', store.todos('tiposEnsaio').map(t => ({ v: t.id, t: t.nome })), '', 'required'), { obrig: true })}
      ${campo('Código do laudo', html`<input name="codigo" required>`, { obrig: true })}
      ${sel('inspetorId', 'Inspetor', 'inspetor')}${sel('niiId', 'Verificador NII', 'nii')}${sel('niiiId', 'Verificador NIII', 'niii')}</div>`,
    rotuloOk: 'Solicitar',
    aoMontar: form => { const s = form.querySelector('[data-obra]'); s.addEventListener('change', () => { form.querySelector('[data-itens]').innerHTML = String(campo('Item', seletor('itemId', itensDe(s.value), '', 'required'), { obrig: true })); }); },
    onOk: d => { ctx.acoes.ensaios.solicitarEnsaio(d); toast('Ensaio solicitado'); },
  });
}

function decidir(ctx, ensaio, decisao) {
  modal({
    titulo: `${decisao === 'aprovado' ? 'Aprovar' : 'Reprovar'} · ${ensaio.codigo}`, descricao: ensaio.status,
    corpo: campo(decisao === 'aprovado' ? 'Observação (opcional)' : 'Observação obrigatória', html`<textarea name="nota" ${decisao === 'aprovado' ? '' : 'required'}></textarea>`, { obrig: decisao !== 'aprovado' }),
    rotuloOk: 'Confirmar',
    onOk: d => {
      ctx.acoes.ensaios.verificarEnsaio({ id: ensaio.id, decisao, nota: d.nota });
      toast('Verificação registrada');
      if (decisao === 'reprovado' && ctx.regra('criarExtra')) setTimeout(() => formExtra(ctx, ctx.store.obter('itens', ensaio.itemId), ctx.store.obter('ensaios', ensaio.id)), 50);
    },
  });
}

export default {
  id: 'qualidade',
  titulo: 'Qualidade',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques, ...cliquesItem(ctx), ...cliquesOP(ctx),
        'ensaio-novo': () => formEnsaio(ctx),
        'ensaio-executar': d => { acoes.ensaios.executarEnsaio({ id: d.id }); toast('Execução registrada'); },
        'ensaio-decidir': d => decidir(ctx, store.obter('ensaios', d.id), d.decisao),
        'ensaio-retrabalho': d => { const e = store.obter('ensaios', d.id); formExtra(ctx, store.obter('itens', e.itemId), e); },
        'ensaio-cancelar': d => modal({ titulo: 'Cancelar ensaio', descricao: store.obter('ensaios', d.id).codigo, corpo: campo('Justificativa', html`<textarea name="nota" required></textarea>`, { obrig: true }), rotuloOk: 'Cancelar ensaio', onOk: v => { acoes.ensaios.cancelarEnsaio({ id: d.id, nota: v.nota }); toast('Ensaio cancelado'); } }),
        'ensaio-historico': d => abrirHistorico(store, store.obter('ensaios', d.id).codigo, a => a.entidadeId === d.id),
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const [secao = 'inspecoes'] = ctx.params;
    const corpo = secao === 'ensaios' ? viewEnsaios(ctx) : secao === 'laudos' ? viewLaudos(ctx) : viewInspecoes(ctx);
    el.innerHTML = String(html`<main class="page">${subabas([['inspecoes', 'Inspeções de OPs', 'shield'], ['laudos', 'Laudos de itens', 'clipboard'], ['ensaios', 'Ensaios', 'flask']], secao, 'qualidade')}${corpo}${rodape()}</main>`);
  },
};
