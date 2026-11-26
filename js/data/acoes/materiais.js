// Almoxarifado: cadastro de materiais e movimentações de estoque.
import { exigir, exigirTexto, exigirNumero, auditar, notificar, autorizar, camposDoForm } from './base.js';
import { regrasAcesso } from '../../core/permissoes.js';
import { config } from '../../core/config.js';

export function salvarMaterial(store, u, dados) {
  autorizar(store, u, regrasAcesso.materiais(u), 'material', { entidade: 'material', entidadeId: dados.id || null });
  return store.transacao(() => {
    const anterior = dados.id ? store.obter('materiais', dados.id) : null;
    const codigo = exigirTexto(dados.codigo, 'o código');
    exigir(!store.achar('materiais', m => m.codigo.toLowerCase() === codigo.toLowerCase() && m.id !== dados.id), 'Código de material já cadastrado');
    const opNumero = String(dados.opNumero || '').trim();
    if (opNumero) exigir(store.achar('ops', o => o.numero === opNumero), 'OP vinculada não encontrada');
    const valores = {
      codigo, nome: exigirTexto(dados.nome, 'a descrição'), categoria: exigirTexto(dados.categoria, 'a categoria'),
      unidade: config.app.unidadesMaterial.includes(dados.unidade) ? dados.unidade : 'un',
      minimo: exigirNumero(dados.minimo, 'o estoque mínimo', { min: 0 }), opNumero,
      campos: { ...(anterior?.campos || {}), ...camposDoForm(dados) },
    };
    let reg;
    if (anterior) reg = store.atualizar('materiais', anterior.id, valores);
    else reg = store.inserir('materiais', { ...valores, estoque: exigirNumero(dados.estoque, 'o estoque disponível', { min: 0 }) });
    auditar(store, u, { acao: anterior ? 'Material alterado' : 'Material cadastrado', entidade: 'material', entidadeId: reg.id, antes: anterior, depois: reg });
    return reg;
  });
}

export function movimentar(store, u, { id, tipo, quantidade, nota = '' }) {
  autorizar(store, u, regrasAcesso.materiais(u), 'movimentação de estoque', { entidade: 'material', entidadeId: id });
  return store.transacao(() => {
    const m = store.obter('materiais', id);
    exigir(m, 'Material não encontrado');
    exigir(['Entrada', 'Saída'].includes(tipo), 'Tipo de movimentação inválido');
    const q = exigirNumero(quantidade, 'a quantidade', { min: 0 });
    exigir(q > 0, 'Quantidade deve ser maior que zero');
    const proximo = Math.round((m.estoque + (tipo === 'Saída' ? -q : q)) * 1000) / 1000;
    exigir(proximo >= 0, 'Estoque insuficiente');
    store.atualizar('materiais', id, { estoque: proximo });
    const obs = String(nota || '').trim();
    notificar(store, u, { ref: m.opNumero || m.codigo, tipo: 'material', descricao: `${tipo} de ${q} ${m.unidade} de ${m.nome}. ${obs}`.trim(), origem: 'Almoxarifado', destinatarios: ['PCP', 'Produção'], prioridade: proximo < m.minimo ? 'Alta' : 'Normal' });
    auditar(store, u, { acao: 'Movimentação de estoque', entidade: 'material', entidadeId: id, antes: { estoque: m.estoque }, depois: { estoque: proximo, tipo, quantidade: q }, nota: obs });
  });
}
