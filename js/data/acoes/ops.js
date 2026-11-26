// Ordens de Produção (OPs): cadastro, edição e máquina de estados.
import { exigir, exigirTexto, exigirNumero, exigirData, auditar, notificar, autorizar, camposDoForm } from './base.js';
import { regrasAcesso } from '../../core/permissoes.js';
import { config } from '../../core/config.js';
import { transicaoOP } from '../regras.js';

export function salvarOP(store, u, dados) {
  autorizar(store, u, regrasAcesso.editarOP(u), 'OP', { entidade: 'op', entidadeId: dados.id || null }, 'Somente usuários autorizados podem cadastrar ou editar OPs');
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('ops', dados.id) : null;
    if (dados.id) exigir(anterior, 'OP não encontrada');
    const numero = exigirTexto(dados.numero, 'o número da OP');
    exigir(!store.achar('ops', o => o.numero.toLowerCase() === numero.toLowerCase() && o.id !== dados.id), 'Número da OP já existe');
    const obra = store.obter('obras', dados.obraId);
    exigir(obra && !obra.arquivado, 'Selecione o Projeto/Obra da OP');
    const planejado = exigirNumero(dados.planejado, 'a quantidade planejada', { min: 1, inteiro: true });
    if (anterior) exigir(planejado >= anterior.produzido, 'Quantidade planejada não pode ser inferior à produzida');
    const inicio = exigirData(dados.inicio, 'a data de início');
    const prazo = exigirData(dados.prazo, 'o prazo de entrega');
    exigir(prazo >= inicio, 'Entrega deve ser posterior ao início');
    const valores = {
      numero, faFicha: exigirTexto(dados.faFicha, 'a ficha de acompanhamento'), produto: exigirTexto(dados.produto, 'o produto'),
      obraId: obra.id, planejado, setor: config.app.setoresOP.includes(dados.setor) ? dados.setor : 'Produção',
      responsavel: exigirTexto(dados.responsavel, 'o responsável'), inicio, prazo,
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    if (anterior && anterior.numero !== numero) {
      for (const i of store.filtrar('itens', x => x.opNumero === anterior.numero)) store.atualizar('itens', i.id, { opNumero: numero });
      for (const m of store.filtrar('materiais', x => x.opNumero === anterior.numero)) store.atualizar('materiais', m.id, { opNumero: numero });
    }
    const reg = anterior ? store.atualizar('ops', anterior.id, valores) : store.inserir('ops', { ...valores, produzido: 0, status: 'Em andamento' });
    notificar(store, u, { ref: numero, tipo: anterior ? 'edição' : 'cadastro', descricao: anterior ? 'Planejamento da ordem atualizado.' : 'Nova ordem disponibilizada para produção.', origem: 'PCP', destinatarios: ['Produção', 'Projetos'], opId: reg.id, obraId: obra.id });
    auditar(store, u, { acao: anterior ? 'OP editada' : 'OP cadastrada', entidade: 'op', entidadeId: reg.id, obraId: obra.id, antes: anterior, depois: reg });
    return reg;
  });
}

const PERMISSAO_POR_TIPO = {
  'produção': 'registrarProducao', 'parada': 'ocorrencia', 'inspeção': 'inspecaoOP', 'retomada': 'retomada', 'atualização': 'atualizacaoProjeto',
};

/** Registro na OP: produção, ocorrência (parada), inspeção, retomada ou atualização do projeto. */
export function registrarOP(store, u, { id, tipo, quantidade, motivo, nota }) {
  const regra = PERMISSAO_POR_TIPO[tipo];
  autorizar(store, u, !!regra && regrasAcesso[regra](u), tipo || 'registro na OP', { entidade: 'op', entidadeId: id }, 'Somente usuários autorizados podem atualizar o status desta OP');
  return store.transacao(() => {
    const op = store.obter('ops', id);
    exigir(op, 'Ordem não encontrada');
    const r = transicaoOP(op, tipo, { quantidade, motivo, nota });
    const anterior = op.status;
    store.atualizar('ops', id, { status: r.status, produzido: r.produzido });
    if (tipo === 'retomada') {
      for (const ev of store.filtrar('eventos', e => e.opId === id && e.tipo === 'parada' && !e.resolvida)) {
        store.atualizar('eventos', ev.id, { resolvida: true, lida: true, providencia: String(nota || '').trim() });
      }
    }
    notificar(store, u, { ref: op.numero, tipo, descricao: r.descricao, origem: r.origem, destinatarios: r.destinatarios, prioridade: r.prioridade, statusAnterior: anterior, statusNovo: r.status, nota, opId: id, obraId: op.obraId });
    auditar(store, u, { acao: 'OP: ' + tipo, entidade: 'op', entidadeId: id, obraId: op.obraId, antes: { status: anterior, produzido: op.produzido }, depois: { status: r.status, produzido: r.produzido }, nota: String(nota || '') });
  });
}
