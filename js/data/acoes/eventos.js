// Notificações: marcar como lida e registrar providência.
import { exigir, exigirTexto, auditar, autorizar } from './base.js';
import { regrasAcesso, ehHost } from '../../core/permissoes.js';

function podeTratar(u, ev) {
  return regrasAcesso.notificacoes(u) || ehHost(u) || (!!ev && !!u && ev.destinatarioId === u.id);
}

export function marcarLida(store, u, { id }) {
  const ev = store.obter('eventos', id);
  autorizar(store, u, podeTratar(u, ev), 'notificação', { entidade: 'evento', entidadeId: id });
  return store.transacao(() => {
    exigir(ev, 'Notificação não encontrada');
    if (!ev.lida) store.atualizar('eventos', id, { lida: true });
  });
}

export function marcarTodasLidas(store, u, { ids } = {}) {
  autorizar(store, u, regrasAcesso.notificacoes(u), 'notificações');
  return store.transacao(() => {
    for (const ev of store.filtrar('eventos', e => !e.lida && (!ids || ids.includes(e.id)))) store.atualizar('eventos', ev.id, { lida: true });
  });
}

export function registrarProvidencia(store, u, { id, providencia }) {
  const ev = store.obter('eventos', id);
  autorizar(store, u, podeTratar(u, ev), 'providência', { entidade: 'evento', entidadeId: id });
  return store.transacao(() => {
    exigir(ev, 'Notificação não encontrada');
    const p = exigirTexto(providencia, 'a providência tomada');
    store.atualizar('eventos', id, { providencia: p, resolvida: true, lida: true });
    auditar(store, u, { acao: 'Providência registrada', entidade: 'evento', entidadeId: id, obraId: ev.obraId, nota: p });
  });
}
