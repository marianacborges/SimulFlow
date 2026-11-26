// Aba Início/Painel: resumo de OPs e FAs por status e atrasos, alertas e últimas movimentações.
import { html, cabecalho, stat, badge, vazio, rodape, delegar, botao } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, hora, hoje } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';
import { tabelaOPs, cliquesOP } from '../componentes/op-acoes.js';
import { rosca, barras } from '../componentes/graficos.js';
import { opAtrasada, faAtrasada, statusExibidoFA, itemAtrasado, percentual, diasAtraso } from '../data/regras.js';
import { tom } from '../core/ui.js';

const estado = { op: { busca: '', status: '', setor: '', pagina: 1 } };
let desligar = null;
const pad = n => String(n).padStart(2, '0');

function view(ctx) {
  const { store, pode } = ctx;
  const ops = store.todos('ops');
  const fas = store.todos('fas');
  const extras = store.todos('extras');
  const opsAtrasadas = ops.filter(o => opAtrasada(o));
  const fasAtrasadas = fas.filter(f => faAtrasada(f)).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const itensAtrasados = store.filtrar('itens', i => !i.arquivado && !store.obter('obras', i.obraId)?.arquivado && itemAtrasado(i, store.obter('ciclos', i.cicloId), extras))
    .sort((a, b) => diasAtraso(b) - diasAtraso(a));
  const alertas = store.filtrar('eventos', e => !e.resolvida && e.prioridade === 'Alta').sort((a, b) => b.em.localeCompare(a.em)).slice(0, 4);
  const ultimas = store.todos('eventos').slice().sort((a, b) => b.em.localeCompare(a.em)).slice(0, 5);
  const verPCP = pode('pcp');
  const linkOP = s => verPCP ? `#/pcp/ops?status=${encodeURIComponent(s)}` : undefined;
  const linkFA = s => verPCP ? `#/pcp/fas?fa=${encodeURIComponent(s)}` : undefined;
  const statusOP = config.app.statusOP.filter(s => s !== 'Atrasada');
  const porObra = store.filtrar('obras', o => !o.parentId && !o.arquivado).map(o => {
    const doObra = ops.filter(op => op.obraId === o.id || store.obter('obras', op.obraId)?.parentId === o.id);
    return { rotulo: o.nome, total: doObra.reduce((s, x) => s + x.planejado, 0), feito: doObra.reduce((s, x) => s + x.produzido, 0) };
  }).filter(l => l.total);
  return html`${cabecalho('Início', 'Visão geral das OPs, FAs e da integração entre os setores.', html`<span class="badge neutral">${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>`)}
    <h2 style="margin-bottom:10px">Ordens de Produção</h2>
    <div class="stats">${stat({ rotulo: 'Total de ordens', valor: pad(ops.length), icone: 'clipboard', rodape: 'Ordens cadastradas no sistema', href: linkOP('') })}
      ${stat({ rotulo: 'Em andamento', valor: pad(ops.filter(o => o.status === 'Em andamento').length), icone: 'play', rodape: 'Produção em execução', href: linkOP('Em andamento') })}
      ${stat({ rotulo: 'Concluídas', valor: pad(ops.filter(o => o.status === 'Concluída').length), icone: 'check', cor: 'green', rodape: 'Finalizadas e aprovadas', href: linkOP('Concluída') })}
      ${stat({ rotulo: 'Ordens atrasadas', valor: pad(opsAtrasadas.length), icone: 'alert', cor: 'red', rodape: 'Necessitam atenção do PCP', href: linkOP('Atrasada') })}</div>
    <div class="status-strip"><span class="strip-label">OUTROS STATUS</span>${['Parada', 'Aguardando material', 'Aguardando qualidade'].map(s => verPCP
      ? html`<a href="${linkOP(s)}">${badge(s)} <strong>${ops.filter(o => o.status === s).length}</strong></a>` : html`<span>${badge(s)} <strong>${ops.filter(o => o.status === s).length}</strong></span>`)}</div>
    <h2 style="margin-bottom:10px">Frentes / Ações (FAs)</h2>
    <div class="stats">${stat({ rotulo: 'FAs abertas', valor: pad(fas.filter(f => f.status === 'Aberta').length), icone: 'workflow', rodape: 'Aguardando início', href: linkFA('Aberta') })}
      ${stat({ rotulo: 'Em andamento', valor: pad(fas.filter(f => f.status === 'Em andamento').length), icone: 'play', rodape: 'Em execução pelos setores', href: linkFA('Em andamento') })}
      ${stat({ rotulo: 'Concluídas', valor: pad(fas.filter(f => f.status === 'Concluída').length), icone: 'check', cor: 'green', rodape: 'Finalizadas', href: linkFA('Concluída') })}
      ${stat({ rotulo: 'FAs atrasadas', valor: pad(fasAtrasadas.length), icone: 'alert', cor: 'red', rodape: 'Prazo ultrapassado', href: linkFA('Atrasada') })}</div>
    <div class="grid-3">
      <section class="panel"><div class="panel-heading"><div><h2>OPs por status</h2><p>Visão geral das ordens de produção</p></div></div>
        ${rosca(statusOP.map(s => ({ rotulo: s, valor: ops.filter(o => o.status === s).length, cor: tom(s), href: linkOP(s) })), ops.length, 'ordens no total')}</section>
      <section class="panel"><div class="panel-heading"><div><h2>FAs por status</h2><p>Frentes e ações entre setores</p></div></div>
        ${rosca([...config.app.statusFA.map(s => ({ rotulo: s, valor: fas.filter(f => f.status === s && !faAtrasada(f)).length, cor: tom(s), href: linkFA(s) })), { rotulo: 'Atrasada', valor: fasAtrasadas.length, cor: 'red', href: linkFA('Atrasada') }], fas.length, 'FAs no total')}</section>
      <section class="panel"><div class="panel-heading"><div><h2>Produção por obra</h2><p>Quantidade produzida × planejada nas OPs</p></div></div>${porObra.length ? barras(porObra, { rotuloTotal: 'Planejado', rotuloFeito: 'Produzido' }) : vazio()}</section>
    </div>
    ${verPCP ? html`<div class="section">${tabelaOPs(ctx, estado.op, { compacto: true })}</div>` : ''}
    <div class="grid-2 section">
      <section class="panel"><div class="panel-heading"><div><h2>Atrasos <span class="count-pill">${fasAtrasadas.length + itensAtrasados.length + opsAtrasadas.length}</span></h2><p>FAs, itens e OPs com prazo ou avanço em atraso</p></div></div>
        <div class="alert-list">${opsAtrasadas.slice(0, 3).map(o => html`<div class="alert-item"><span class="alert-symbol red">!</span><div class="alert-copy"><strong><a class="link" href="#/pcp/op/${o.id}">${o.numero}</a> · ${o.produto}</strong><p>Prazo ${data(o.prazo)} · ${o.status}</p></div>${badge('OP', 'red')}</div>`)}
          ${fasAtrasadas.slice(0, 4).map(f => html`<div class="alert-item"><span class="alert-symbol red">!</span><div class="alert-copy"><strong><a class="link" href="#/pcp/fa/${f.id}">${f.numero}</a> · ${f.titulo}</strong><p>${f.setorOrigem} → ${f.setorDestino} · prazo ${data(f.prazo)} · ${f.responsavelNome}</p></div>${badge('FA', 'red')}</div>`)}
          ${itensAtrasados.slice(0, 4).map(i => html`<div class="alert-item"><span class="alert-symbol amber">!</span><div class="alert-copy"><strong>${pode('projetos') ? html`<a class="link" href="#/projetos/obra/${i.obraId}?item=${i.id}">${i.codigo}</a>` : i.codigo} · ${store.obter('obras', i.obraId)?.nome}</strong><p>${Math.round(percentual(i, extras))}% · prazo ${data(i.prazo)}${diasAtraso(i) ? ` · ${diasAtraso(i)} ${diasAtraso(i) === 1 ? 'dia' : 'dias'} de atraso` : ' · avanço abaixo do esperado'}</p></div>${badge('Item', 'amber')}</div>`)}
          ${opsAtrasadas.length + fasAtrasadas.length + itensAtrasados.length ? '' : vazio('Nenhum atraso.')}</div></section>
      <section class="panel"><div class="panel-heading"><div><h2>Alertas e ocorrências <span class="count-pill">${alertas.length}</span></h2><p>Pontos de atenção que precisam de uma ação</p></div>${pode('notificacoes') ? html`<a class="link" href="#/notificacoes">Ver todos</a>` : ''}</div>
        <div class="alert-list">${alertas.map(e => html`<div class="alert-item"><span class="alert-symbol amber">!</span><div class="alert-copy"><strong>${pode('notificacoes') ? html`<a class="link" href="#/notificacoes?q=${encodeURIComponent(e.ref)}">${e.ref}</a>` : e.ref} · ${e.descricao.split('.')[0]}</strong><p>${e.descricao.split('.').slice(1).join('.')}</p><small>${e.origem} → ${e.destinatarios.join(' e ')}</small></div>${badge('Alta')}</div>`)}
          ${alertas.length ? '' : vazio('Nenhum alerta pendente.')}</div>
        <div class="panel-heading" style="margin-top:16px"><div><h2>Últimas movimentações</h2><p>Atualizações compartilhadas entre os setores</p></div>${pode('historico') ? html`<a class="link" href="#/historico">Ver histórico</a>` : ''}</div>
        <div class="alert-list">${ultimas.map(e => html`<div class="alert-item"><span class="alert-symbol ${e.prioridade === 'Alta' ? 'amber' : 'blue'}">•</span><div class="alert-copy"><strong>${pode('historico') ? html`<a class="link" href="#/historico?q=${encodeURIComponent(e.ref)}">${e.ref}</a>` : e.ref} · ${e.tipo}</strong><p>${e.descricao}</p><small>${e.origem} · ${data(e.em)} · ${hora(e.em)}</small></div></div>`)}
          ${ultimas.length ? '' : vazio()}</div></section>
    </div>`;
}

export default {
  id: 'inicio',
  titulo: 'Início',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, { mudanca: ctl.mudanca, cliques: { ...ctl.cliques, ...cliquesOP(ctx) } });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    el.innerHTML = String(html`<main class="page">${view(ctx)}${rodape()}</main>`);
  },
};
