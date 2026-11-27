// Aba Notificações: comunicação entre setores e acompanhamento das providências.
import { html, cabecalho, botao, badge, campo, modal, toast, busca, filtro, vazio, delegar } from '../core/ui.js';
import { config } from '../core/config.js';
import { data, hora, combinaTexto, unicos } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';
import { camposBuscaOP } from '../data/regras.js';

const estado = { f: { busca: '', destino: '', origem: '', prioridade: '', leitura: '' } };
let ultimaQuery = '';
let desligar = null;

function lista(ctx) {
  const { store, usuario } = ctx;
  const f = estado.f;
  const veTodas = ctx.pode('notificacoes');
  return store.filtrar('eventos', e => (veTodas || e.destinatarioId === usuario.id) &&
    combinaTexto(f.busca, [e.ref, e.descricao, e.tipo, e.origem, ...camposBuscaOP(store.obter('ops', e.opId), store.obter('obras', store.obter('ops', e.opId)?.obraId))]) &&
    (!f.destino || e.destinatarios.includes(f.destino)) && (!f.origem || e.origem === f.origem) && (!f.prioridade || e.prioridade === f.prioridade) &&
    (!f.leitura || (f.leitura === 'nao' ? !e.lida : e.lida))).sort((a, b) => b.em.localeCompare(a.em));
}

function view(ctx) {
  const { store, regra } = ctx;
  const f = estado.f;
  const itens = lista(ctx);
  const setores = unicos([...config.app.areas, ...config.app.setoresOP, ...store.todos('eventos').map(e => e.origem)]);
  const pode = regra('notificacoes');
  return html`${cabecalho('Notificações', '', botao('Marcar todas como lidas', { acao: 'todas-lidas', v: 'outline', icone: 'check', desab: !pode }))}
    <div class="filters">${busca('f.busca', f.busca)}
      ${filtro('f.destino', [{ v: '', t: 'Todos os destinatários' }, ...setores], f.destino, 'Setor destinatário')}
      ${filtro('f.origem', [{ v: '', t: 'Todas as origens' }, ...setores], f.origem, 'Setor de origem')}
      ${filtro('f.prioridade', [{ v: '', t: 'Todas as prioridades' }, 'Alta', 'Normal'], f.prioridade, 'Prioridade')}
      ${filtro('f.leitura', [{ v: '', t: 'Lidas e não lidas' }, { v: 'nao', t: 'Não lidas' }, { v: 'sim', t: 'Lidas' }], f.leitura, 'Leitura')}
      ${f.busca || f.destino || f.origem || f.prioridade || f.leitura ? botao('', { acao: 'limpar', dados: { prefixo: 'f' }, v: 'ghost', tam: 'icon', icone: 'x', titulo: 'Limpar filtros' }) : ''}
      <span class="filter-count">${itens.length} notificações</span></div>
    <div class="notification-list">${itens.map(e => html`<article class="alert-item"><span class="alert-symbol ${e.prioridade === 'Alta' ? 'amber' : 'blue'}">${e.prioridade === 'Alta' ? '!' : 'i'}</span>
      <div class="alert-copy"><strong>${e.lida ? '' : html`<i class="unread-dot" title="Não lida"></i>`}${e.ref} · ${e.tipo}</strong><p>${e.descricao}</p>
        ${e.statusAnterior ? html`<p>${e.statusAnterior} → ${e.statusNovo}</p>` : ''}
        <small>${e.origem} → ${e.destinatarios.join(', ')} · ${data(e.em)} · ${hora(e.em)} · ${e.ator}</small>${e.providencia ? html`<p class="green">Providência: ${e.providencia}</p>` : ''}</div>
      <div class="notification-actions">${badge(e.resolvida ? 'Resolvida' : e.prioridade)}
        ${!e.lida ? botao('', { acao: 'lida', dados: { id: e.id }, v: 'ghost', tam: 'icon', icone: 'check', titulo: 'Marcar como lida', desab: !(pode || e.destinatarioId === ctx.usuario.id) }) : ''}
        ${!e.resolvida ? botao('Providência', { acao: 'providencia', dados: { id: e.id }, v: 'outline', tam: 'sm', desab: !(pode || e.destinatarioId === ctx.usuario.id) }) : ''}</div></article>`)}
    ${itens.length ? '' : vazio()}</div>`;
}

export default {
  id: 'notificacoes',
  titulo: 'Notificações',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    const { store, acoes } = ctx;
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: {
        ...ctl.cliques,
        'todas-lidas': () => { acoes.eventos.marcarTodasLidas({ ids: lista(ctx).map(e => e.id) }); toast('Notificações marcadas como lidas'); },
        'lida': d => acoes.eventos.marcarLida({ id: d.id }),
        'providencia': d => {
          const e = store.obter('eventos', d.id);
          modal({ titulo: 'Registrar providência', descricao: `${e.ref} · ${e.descricao}`, corpo: campo('Providência tomada', html`<textarea name="providencia" required rows="4"></textarea>`, { obrig: true }),
            rotuloOk: 'Resolver ocorrência', onOk: v => { acoes.eventos.registrarProvidencia({ id: e.id, providencia: v.providencia }); toast('Providência registrada'); } });
        },
      },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    const q = ctx.query?.q || '';
    if (q !== ultimaQuery) { ultimaQuery = q; if (q) estado.f.busca = q; }
    el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`);
  },
};
