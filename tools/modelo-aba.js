// Aba __TITULO__ (criada por: node tools/simulflow.js nova-aba __ID__ "__TITULO__").
// Contrato: export default { id, titulo, render(container, ctx), onMount?, onUnmount? }
// ctx: { usuario, store, acoes, pode(aba, editar), regra(nome, ...), host, params, query, rerender(), navegar(hash) }
// Leitura: ctx.store.todos('<colecao>') · Gravação: sempre por ctx.acoes.<modulo>.<acao>({...}) (valida, audita e persiste).
import { html, cabecalho, botao, vazio, delegar, busca, toast } from '../core/ui.js';
import { combinaTexto } from '../core/util.js';
import { controleEstado } from '../componentes/comuns.js';

const estado = { f: { busca: '' } };
let desligar = null;

function view(ctx) {
  const podeEditar = ctx.pode('__ID__', true);
  // Exemplo: lista as obras ativas com busca. Troque pelo conteúdo da nova aba.
  const obras = ctx.store.filtrar('obras', o => !o.arquivado && combinaTexto(estado.f.busca, [o.nome, o.contrato, o.cliente]));
  return html`${cabecalho(ctx.aba.titulo, ctx.aba.descricao || 'Descreva aqui o objetivo desta aba.', botao('Ação de exemplo', { acao: 'exemplo', icone: 'plus', desab: !podeEditar }))}
    <div class="filters">${busca('f.busca', estado.f.busca, 'Buscar...')}</div>
    <div class="table-wrap"><div class="table-scroll"><table><thead><tr><th>Obra</th><th>Cliente</th><th>Contrato</th></tr></thead><tbody>
      ${obras.map(o => html`<tr><td>${o.nome}</td><td>${o.cliente}</td><td>${o.contrato}</td></tr>`)}</tbody></table></div>${obras.length ? '' : vazio()}</div>`;
}

export default {
  id: '__ID__',
  titulo: '__TITULO__',
  onMount(el, ctx) {
    const ctl = controleEstado(estado, ctx);
    desligar = delegar(el, {
      mudanca: ctl.mudanca,
      cliques: { ...ctl.cliques, exemplo: () => toast('Aba __TITULO__ funcionando') },
    });
  },
  onUnmount() { desligar?.(); },
  render(el, ctx) {
    el.innerHTML = String(html`<main class="page">${view(ctx)}</main>`);
  },
};
