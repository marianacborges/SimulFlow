// Itens numerados (ex.: T-24, T-35): cadastro, avanço, etapa, laudo, consumo e mudança de ciclo.
import { exigir, exigirTexto, exigirNumero, exigirData, auditar, notificar, autorizar, camposDoForm, obraRaiz } from './base.js';
import { regrasAcesso } from '../../core/permissoes.js';
import { config } from '../../core/config.js';
import { itemAtrasado, observacaoObrigatoria, podeConcluir } from '../regras.js';

function obrasDaRaiz(store, raizId) {
  return [raizId, ...store.filtrar('obras', o => o.parentId === raizId).map(o => o.id)];
}

export function salvarItem(store, u, dados) {
  autorizar(store, u, regrasAcesso.editarItens(u), 'item', { entidade: 'item', entidadeId: dados.id || null, obraId: dados.obraId || null });
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('itens', dados.id) : null;
    if (anterior) exigir(!anterior.arquivado, 'Desarquive o registro antes de alterá-lo');
    // Pedido define obra/sub-projeto; sem pedido, usa a obra informada.
    const pedidoId = dados.pedidoId !== undefined ? (dados.pedidoId || null) : (anterior?.pedidoId || null);
    const pedido = pedidoId ? store.obter('pedidos', pedidoId) : null;
    if (pedidoId) exigir(pedido && !pedido.arquivado, 'Pedido indisponível');
    let obraBase = pedido ? store.obter('obras', pedido.obraId) : store.obter('obras', dados.subprojetoId || dados.obraId || anterior?.subprojetoId || anterior?.obraId);
    exigir(obraBase && !obraBase.arquivado, 'Selecione uma obra ativa');
    const raiz = obraRaiz(store, obraBase.id);
    let subprojetoId = obraBase.id !== raiz.id ? obraBase.id : (dados.subprojetoId || null);
    if (subprojetoId) {
      const sp = store.obter('obras', subprojetoId);
      exigir(sp && obraRaiz(store, sp.id)?.id === raiz.id && sp.id !== raiz.id, 'Sub-projeto inválido');
    }
    const codigo = exigirTexto(dados.codigo, 'o número/código do item');
    exigir(!store.achar('itens', i => i.obraId === raiz.id && i.codigo.toLowerCase() === codigo.toLowerCase() && i.id !== dados.id), 'Já existe um item com este número nesta obra');
    const serie = String(dados.serie || '').trim();
    if (serie) exigir(!store.achar('itens', i => i.serie && i.serie === serie && i.id !== dados.id), 'Número de série já cadastrado');
    const opNumero = String(dados.opNumero || '').trim();
    if (opNumero) exigir(store.achar('ops', o => o.numero === opNumero), 'OP vinculada não encontrada');
    const previsto = exigirNumero(dados.previsto, 'a quantidade prevista', { min: 0.001 });
    if (anterior) exigir(previsto >= anterior.realizado, 'A quantidade prevista não pode ser menor que a realizada');
    const prazo = dados.prazo ? exigirData(dados.prazo, 'o prazo') : (pedido?.dataEntrega || '');
    exigir(prazo, 'Informe o prazo do item (ou vincule a um pedido)');
    const cicloId = dados.cicloId || null;
    if (cicloId) {
      const c = store.obter('ciclos', cicloId);
      exigir(c && c.obraId === raiz.id, 'Ciclo inválido para esta obra');
      exigir(prazo > c.inicio && prazo <= c.fim, 'Prazo do item deve estar dentro do ciclo');
    }
    const etapaId = dados.etapaId || null;
    if (etapaId) {
      const e = store.obter('etapas', etapaId);
      exigir(e && !e.arquivado && obrasDaRaiz(store, raiz.id).includes(e.obraId), 'A etapa deve pertencer à mesma obra');
    }
    const responsavelId = dados.responsavelId || null;
    if (responsavelId) exigir(store.obter('usuarios', responsavelId)?.ativo, 'Responsável deve ser um usuário ativo');
    const valores = {
      obraId: raiz.id, subprojetoId, pedidoId, cicloId, etapaId, responsavelId, codigo, serie, opNumero, prazo, previsto,
      descricao: String(dados.descricao || '').trim(),
      unidade: String(dados.unidade || '').trim() || 'peça',
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    const reg = anterior ? store.atualizar('itens', anterior.id, valores)
      : store.inserir('itens', { ...valores, realizado: 0, laudo: null, consumo: [], arquivado: false });
    auditar(store, u, { acao: anterior ? 'Edição' : 'Cadastro', entidade: 'item', entidadeId: reg.id, obraId: raiz.id, antes: anterior, depois: reg });
    return reg;
  });
}

function itemAtivo(store, id) {
  const i = store.obter('itens', id);
  exigir(i, 'Item não encontrado');
  exigir(!i.arquivado, 'Item arquivado');
  const o = store.obter('obras', i.obraId);
  exigir(o && !o.arquivado, 'Obra inexistente ou arquivada');
  return i;
}

/** Atualização da quantidade realizada (avanço). Turno obrigatório; observação conforme a política. */
export function atualizarAvanco(store, u, { id, realizado, turno, nota = '', semObservacao = false }) {
  const item = store.obter('itens', id);
  const etapa = item ? store.obter('etapas', item.etapaId) : null;
  autorizar(store, u, regrasAcesso.atualizarItem(u, etapa), 'quantidade', { entidade: 'item', entidadeId: id, obraId: item?.obraId });
  return store.transacao(() => {
    const i = itemAtivo(store, id);
    exigir(config.app.turnos.includes(turno), 'Informe o turno');
    const novo = exigirNumero(realizado, 'a quantidade realizada', { min: 0 });
    exigir(novo <= i.previsto, `A quantidade realizada não pode passar de ${i.previsto}`);
    if (novo >= i.previsto) exigir(podeConcluir(i), 'Conclusão bloqueada: aguardando laudo aprovado da Qualidade');
    const ciclo = store.obter('ciclos', i.cicloId);
    const atrasado = itemAtrasado(i, ciclo, store.todos('extras'));
    let obs = String(nota || '').trim();
    if (semObservacao) obs = 'Usuário marcou: não vou deixar observação';
    else if (observacaoObrigatoria(store.config.politicas.quantidade, novo, i.realizado, atrasado) && !obs) throw new Error('Observação obrigatória para esta atualização');
    const antes = { realizado: i.realizado };
    store.atualizar('itens', id, { realizado: novo });
    auditar(store, u, { acao: 'Atualização de avanço', entidade: 'item', entidadeId: id, obraId: i.obraId, antes, depois: { realizado: novo, previsto: i.previsto }, nota: obs, turno });
  });
}

export function moverParaEtapa(store, u, { id, etapaId }) {
  autorizar(store, u, regrasAcesso.moverItem(u), 'mover item', { entidade: 'item', entidadeId: id });
  return store.transacao(() => {
    const i = itemAtivo(store, id);
    const destino = etapaId || null;
    if (destino) {
      const e = store.obter('etapas', destino);
      exigir(e && !e.arquivado && obrasDaRaiz(store, i.obraId).includes(e.obraId), 'A etapa deve pertencer à mesma obra');
    }
    if ((i.etapaId || null) === destino) return;
    const antes = { etapaId: i.etapaId };
    store.atualizar('itens', id, { etapaId: destino });
    auditar(store, u, { acao: 'Movimentação entre etapas', entidade: 'item', entidadeId: id, obraId: i.obraId, antes, depois: { etapaId: destino } });
  });
}

/** Laudo da Qualidade: Aprovado/Reprovado com observação obrigatória. */
export function registrarLaudo(store, u, { id, status, nota }) {
  autorizar(store, u, regrasAcesso.laudo(u), 'laudo', { entidade: 'item', entidadeId: id }, 'Sem permissão para emitir laudos');
  return store.transacao(() => {
    const i = itemAtivo(store, id);
    exigir(['Aprovado', 'Reprovado'].includes(status), 'Selecione o resultado do laudo');
    const obs = exigirTexto(nota, 'a observação do laudo');
    const antes = { laudo: i.laudo };
    const laudo = { status, nota: obs, por: u.nome, porId: u.id, em: new Date().toISOString() };
    store.atualizar('itens', id, { laudo });
    if (status === 'Reprovado') {
      notificar(store, u, { ref: i.opNumero || i.codigo, tipo: 'qualidade', descricao: `Item ${i.codigo} reprovado: ${obs}`, origem: 'Qualidade', destinatarios: ['Produção', 'PCP'], prioridade: 'Alta', obraId: i.obraId, itemId: i.id });
    }
    auditar(store, u, { acao: 'Laudo de qualidade', entidade: 'item', entidadeId: id, obraId: i.obraId, antes, depois: { laudo }, nota: obs });
  });
}

/** Consumo de material pelo item: baixa o estoque e registra no item. */
export function consumirMaterial(store, u, { id, materialId, quantidade }) {
  autorizar(store, u, regrasAcesso.consumir(u), 'consumo', { entidade: 'item', entidadeId: id }, 'Sem permissão para consumir materiais');
  return store.transacao(() => {
    const i = itemAtivo(store, id);
    const m = store.obter('materiais', materialId);
    exigir(m, 'Material não encontrado');
    const q = exigirNumero(quantidade, 'a quantidade', { min: 0 });
    exigir(q > 0, 'Quantidade deve ser maior que zero');
    exigir(q <= m.estoque, `Estoque insuficiente: disponível ${m.estoque} ${m.unidade}`);
    const restante = Math.round((m.estoque - q) * 1000) / 1000;
    store.atualizar('materiais', m.id, { estoque: restante });
    if (restante < m.minimo) {
      notificar(store, u, { ref: i.opNumero || i.codigo, tipo: 'estoque', descricao: `Estoque de ${m.nome} abaixo do mínimo (${restante} ${m.unidade})`, origem: 'Almoxarifado', destinatarios: ['Almoxarifado', 'PCP'], prioridade: 'Alta', obraId: i.obraId, itemId: i.id });
    }
    const registro = { codigo: m.codigo, nome: m.nome, quantidade: q, unidade: m.unidade, em: new Date().toISOString(), ator: u.nome };
    store.atualizar('itens', id, { consumo: [...(i.consumo || []), registro] });
    auditar(store, u, { acao: 'Consumo de material', entidade: 'item', entidadeId: id, obraId: i.obraId, depois: registro });
  });
}

/** Mover item de ciclo (com nova data prevista e justificativa). */
export function moverCiclo(store, u, { id, cicloId, prazo, nota }) {
  autorizar(store, u, regrasAcesso.moverCiclo(u), 'mudança de ciclo', { entidade: 'item', entidadeId: id });
  return store.transacao(() => {
    const i = itemAtivo(store, id);
    const obs = exigirTexto(nota, 'a justificativa da mudança de ciclo');
    const c = store.obter('ciclos', cicloId);
    exigir(c && c.obraId === i.obraId, 'Ciclo inválido');
    const p = exigirData(prazo, 'a data prevista');
    exigir(p > c.inicio && p <= c.fim, 'Prazo do item deve estar dentro do ciclo');
    const antes = { cicloId: i.cicloId, prazo: i.prazo };
    store.atualizar('itens', id, { cicloId, prazo: p });
    auditar(store, u, { acao: 'Mudança de ciclo', entidade: 'item', entidadeId: id, obraId: i.obraId, antes, depois: { cicloId, prazo: p }, nota: obs });
  });
}
