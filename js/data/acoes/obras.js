// Projetos/Obras, sub-projetos, pedidos (contrato aditivado), ocultar e arquivar em cascata.
import { exigir, exigirTexto, exigirData, auditar, autorizar, camposDoForm } from './base.js';
import { regrasAcesso, ehHost } from '../../core/permissoes.js';
import { config } from '../../core/config.js';
import { ramo } from '../regras.js';

export function salvarObra(store, u, dados) {
  autorizar(store, u, regrasAcesso.editarObras(u), 'obra', { entidade: 'obra', entidadeId: dados.id || null });
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('obras', dados.id) : null;
    if (dados.id) {
      exigir(anterior, 'Obra não encontrada');
      exigir(!anterior.arquivado, 'Desarquive o registro antes de alterá-lo');
    }
    const parentId = anterior ? anterior.parentId : (dados.parentId || null);
    if (anterior && dados.parentId !== undefined && (dados.parentId || null) !== anterior.parentId) throw new Error('O vínculo ao item pai não pode ser alterado');
    if (parentId) {
      const pai = store.obter('obras', parentId);
      exigir(pai && !pai.arquivado, 'Item pai indisponível');
      exigir(pai.temSubprojetos, 'Ative sub-projetos no item pai');
    }
    const valores = {
      nome: exigirTexto(dados.nome, 'o nome'),
      contrato: exigirTexto(dados.contrato, 'o número do contrato'),
      cliente: exigirTexto(dados.cliente, 'o cliente'),
      responsavel: exigirTexto(dados.responsavel, 'o responsável'),
      status: config.app.statusObra.includes(dados.status) ? dados.status : 'Em andamento',
      descricao: String(dados.descricao || '').trim(),
      inicio: dados.inicio || '', fim: dados.fim || '',
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    if (valores.inicio && valores.fim) exigir(valores.fim >= valores.inicio, 'Fim previsto deve ser posterior ao início');
    exigir(!store.achar('obras', o => o.contrato.toLowerCase() === valores.contrato.toLowerCase() && o.id !== dados.id), 'Contrato já cadastrado');
    let reg;
    if (anterior) reg = store.atualizar('obras', anterior.id, valores);
    else reg = store.inserir('obras', { ...valores, parentId, temSubprojetos: false, escopoEtapas: 'obra', oculto: false, arquivado: false });
    auditar(store, u, { acao: anterior ? 'Edição' : 'Cadastro', entidade: 'obra', entidadeId: reg.id, obraId: reg.id, antes: anterior, depois: reg });
    return reg;
  });
}

export function definirSubprojetos(store, u, { id, valor }) {
  autorizar(store, u, regrasAcesso.editarObras(u), 'sub-projetos', { entidade: 'obra', entidadeId: id });
  return store.transacao(() => {
    const o = store.obter('obras', id);
    exigir(o && !o.arquivado, 'Obra indisponível');
    const antes = { temSubprojetos: o.temSubprojetos };
    store.atualizar('obras', id, { temSubprojetos: !!valor });
    auditar(store, u, { acao: 'Configuração de sub-projetos', entidade: 'obra', entidadeId: id, obraId: id, antes, depois: { temSubprojetos: !!valor } });
  });
}

/** Ocultar: some das listas padrão, mas continua ativo (diferente de arquivar). */
export function ocultarObra(store, u, { id, oculto }) {
  autorizar(store, u, regrasAcesso.editarObras(u), 'ocultar obra', { entidade: 'obra', entidadeId: id });
  return store.transacao(() => {
    const o = store.obter('obras', id);
    exigir(o, 'Obra não encontrada');
    store.atualizar('obras', id, { oculto: !!oculto });
    auditar(store, u, { acao: oculto ? 'Ocultação' : 'Reexibição', entidade: 'obra', entidadeId: id, obraId: id });
  });
}

/** Escopo das etapas (CFG-03): definidas na obra ou por sub-projeto. Só host. */
export function escopoEtapas(store, u, { obraId, escopo }) {
  autorizar(store, u, ehHost(u), 'escopo de etapas', { entidade: 'obra', entidadeId: obraId }, 'Configuração exclusiva do host');
  return store.transacao(() => {
    exigir(['obra', 'subprojeto'].includes(escopo), 'Escopo inválido');
    const o = store.obter('obras', obraId);
    exigir(o && !o.arquivado, 'Obra inválida');
    const antes = { escopoEtapas: o.escopoEtapas };
    store.atualizar('obras', obraId, { escopoEtapas: escopo });
    auditar(store, u, { acao: 'Escopo de etapas alterado', entidade: 'obra', entidadeId: obraId, obraId, antes, depois: { escopoEtapas: escopo } });
  });
}

export function salvarPedido(store, u, dados) {
  autorizar(store, u, regrasAcesso.editarObras(u), 'pedido', { entidade: 'pedido', entidadeId: dados.id || null, obraId: dados.obraId || null });
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('pedidos', dados.id) : null;
    if (anterior) exigir(!anterior.arquivado, 'Desarquive o registro antes de alterá-lo');
    const obraId = anterior ? anterior.obraId : dados.obraId;
    const obra = store.obter('obras', obraId);
    exigir(obra && !obra.arquivado, 'Informe projeto, pedido e data de entrega');
    const valores = {
      numero: exigirTexto(dados.numero, 'o número do pedido'),
      dataEntrega: exigirData(dados.dataEntrega, 'a data de entrega'),
      status: config.app.statusPedido.includes(dados.status) ? dados.status : 'Em andamento',
      observacoes: String(dados.observacoes || '').trim(),
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    exigir(!store.achar('pedidos', p => p.obraId === obraId && p.numero === valores.numero && p.id !== dados.id), 'Pedido já cadastrado nesta obra');
    const reg = anterior ? store.atualizar('pedidos', anterior.id, valores) : store.inserir('pedidos', { ...valores, obraId, arquivado: false });
    auditar(store, u, { acao: anterior ? 'Edição' : 'Cadastro', entidade: 'pedido', entidadeId: reg.id, obraId, antes: anterior, depois: reg });
    return reg;
  });
}

/** Conjunto de registros afetados ao arquivar uma obra (sub-projetos, pedidos, etapas, itens, ciclos). */
function cascataObra(store, obraId) {
  const obras = ramo(store.todos('obras'), obraId, 'parentId');
  const pedidos = store.filtrar('pedidos', p => obras.includes(p.obraId)).map(p => p.id);
  return {
    obras,
    pedidos,
    etapas: store.filtrar('etapas', e => obras.includes(e.obraId)).map(e => e.id),
    itens: store.filtrar('itens', i => obras.includes(i.obraId) || obras.includes(i.subprojetoId) || pedidos.includes(i.pedidoId)).map(i => i.id),
  };
}

function paiArquivado(store, entidade, reg) {
  if (entidade === 'obra') {
    let p = reg.parentId ? store.obter('obras', reg.parentId) : null;
    while (p) { if (p.arquivado) return true; p = p.parentId ? store.obter('obras', p.parentId) : null; }
    return false;
  }
  if (entidade === 'pedido') { const o = store.obter('obras', reg.obraId); return !!o?.arquivado || (o ? paiArquivado(store, 'obra', o) : false); }
  if (entidade === 'item') {
    const p = reg.pedidoId ? store.obter('pedidos', reg.pedidoId) : null;
    const o = store.obter('obras', reg.subprojetoId || reg.obraId);
    return !!p?.arquivado || !!o?.arquivado || (o ? paiArquivado(store, 'obra', o) : false);
  }
  return false;
}

/**
 * Arquivar/desarquivar sem apagar nada. Obra leva sub-projetos, pedidos, etapas e itens;
 * pedido leva seus itens. Desarquivar exige o item pai desarquivado.
 */
export function arquivar(store, u, { entidade, id, arquivar: valor }) {
  const permitido = entidade === 'item' ? (regrasAcesso.editarItens(u) || regrasAcesso.arquivarProgramacao(u))
    : entidade === 'obra' ? (regrasAcesso.editarObras(u) || regrasAcesso.arquivarProgramacao(u))
      : regrasAcesso.editarObras(u);
  autorizar(store, u, permitido, 'arquivamento', { entidade, entidadeId: id });
  return store.transacao(() => {
    const col = { obra: 'obras', pedido: 'pedidos', item: 'itens' }[entidade];
    exigir(col, 'Tipo inválido');
    const reg = store.obter(col, id);
    exigir(reg, 'Registro não encontrado');
    if (!valor) exigir(!paiArquivado(store, entidade, reg), 'Desarquive primeiro o item pai');
    const alvo = { obras: [], pedidos: [], etapas: [], itens: [] };
    if (entidade === 'obra') Object.assign(alvo, cascataObra(store, id));
    else if (entidade === 'pedido') { alvo.pedidos = [id]; alvo.itens = store.filtrar('itens', i => i.pedidoId === id).map(i => i.id); }
    else alvo.itens = [id];
    const acao = valor ? 'Arquivamento' : 'Desarquivamento';
    for (const [c, ids] of Object.entries(alvo)) {
      for (const rid of ids) {
        const r = store.obter(c, rid);
        if (!r || r.arquivado === !!valor) continue;
        store.atualizar(c, rid, { arquivado: !!valor });
        auditar(store, u, { acao, entidade: { obras: 'obra', pedidos: 'pedido', etapas: 'etapa', itens: 'item' }[c], entidadeId: rid, obraId: r.obraId || (c === 'obras' ? rid : null), antes: { arquivado: !valor }, depois: { arquivado: !!valor } });
      }
    }
  });
}
