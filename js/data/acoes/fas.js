// FAs (frentes/ações): ligam setores e itens, com responsável, prazo e status próprios.
import { exigir, exigirTexto, exigirData, auditar, notificar, autorizar, camposDoForm, obraRaiz } from './base.js';
import { regrasAcesso } from '../../core/permissoes.js';
import { config } from '../../core/config.js';
import { transicaoFAValida } from '../regras.js';

export function salvarFA(store, u, dados) {
  autorizar(store, u, regrasAcesso.editarFA(u), 'FA', { entidade: 'fa', entidadeId: dados.id || null }, 'Somente usuários autorizados podem cadastrar ou editar FAs');
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('fas', dados.id) : null;
    if (dados.id) exigir(anterior, 'FA não encontrada');
    if (anterior) exigir(!['Concluída', 'Cancelada'].includes(anterior.status), 'Reabra a FA antes de editá-la');
    const areas = config.app.areas;
    exigir(areas.includes(dados.setorOrigem), 'Selecione o setor de origem');
    exigir(areas.includes(dados.setorDestino), 'Selecione o setor de destino');
    const obraId = dados.obraId || null;
    if (obraId) exigir(store.obter('obras', obraId) && !store.obter('obras', obraId).arquivado, 'Obra indisponível');
    const opId = dados.opId || null;
    if (opId) {
      const op = store.obter('ops', opId);
      exigir(op, 'OP não encontrada');
      if (obraId) exigir(obraRaiz(store, op.obraId)?.id === obraRaiz(store, obraId)?.id, 'A OP deve ser da mesma obra');
    }
    const itemIds = [...new Set((dados.itemIds || []).filter(Boolean))];
    for (const id of itemIds) {
      const i = store.obter('itens', id);
      exigir(i, 'Item não encontrado');
      if (obraId) exigir(i.obraId === obraRaiz(store, obraId)?.id, `O item ${i.codigo} não pertence à obra selecionada`);
    }
    const responsavelId = dados.responsavelId || null;
    if (responsavelId) exigir(store.obter('usuarios', responsavelId)?.ativo, 'Responsável deve ser um usuário ativo');
    const responsavelNome = responsavelId ? store.obter('usuarios', responsavelId).nome : exigirTexto(dados.responsavelNome, 'o responsável');
    const valores = {
      titulo: exigirTexto(dados.titulo, 'o título da FA'), descricao: String(dados.descricao || '').trim(),
      obraId, opId, itemIds, setorOrigem: dados.setorOrigem, setorDestino: dados.setorDestino,
      responsavelId, responsavelNome, prazo: exigirData(dados.prazo, 'o prazo'),
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    let reg;
    if (anterior) {
      reg = store.atualizar('fas', anterior.id, valores);
    } else {
      const n = (store.config.contadores.fa || 0) + 1;
      store.definirConfig({ contadores: { ...store.config.contadores, fa: n } });
      reg = store.inserir('fas', { ...valores, numero: 'FA-' + String(n).padStart(3, '0'), status: 'Aberta', concluidaEm: null });
      notificar(store, u, { ref: reg.numero, tipo: 'FA', descricao: `Nova FA ${reg.numero}: ${reg.titulo} (prazo ${reg.prazo.split('-').reverse().join('/')})`, origem: reg.setorOrigem, destinatarios: [reg.setorDestino], faId: reg.id, obraId, destinatarioId: responsavelId });
    }
    auditar(store, u, { acao: anterior ? 'FA editada' : 'FA cadastrada', entidade: 'fa', entidadeId: reg.id, obraId, antes: anterior, depois: reg });
    return reg;
  });
}

/** Mudança de status da FA: transição válida e observação obrigatória. */
export function statusFA(store, u, { id, status, nota }) {
  const fa = store.obter('fas', id);
  autorizar(store, u, regrasAcesso.statusFA(u, fa), 'status da FA', { entidade: 'fa', entidadeId: id }, 'Somente usuários autorizados podem atualizar o status desta FA');
  return store.transacao(() => {
    exigir(fa, 'FA não encontrada');
    exigir(transicaoFAValida(fa.status, status), `Não é possível passar de "${fa.status}" para "${status}"`);
    const obs = exigirTexto(nota, 'a observação da mudança de status');
    const anterior = fa.status;
    store.atualizar('fas', id, { status, concluidaEm: status === 'Concluída' ? new Date().toISOString() : null });
    notificar(store, u, { ref: fa.numero, tipo: 'FA', descricao: `${fa.titulo}: ${obs}`, origem: u.area || 'PCP', destinatarios: [...new Set([fa.setorOrigem, fa.setorDestino])], statusAnterior: anterior, statusNovo: status, nota: obs, faId: id, obraId: fa.obraId });
    auditar(store, u, { acao: 'Status da FA', entidade: 'fa', entidadeId: id, obraId: fa.obraId, antes: { status: anterior }, depois: { status }, nota: obs });
  });
}
