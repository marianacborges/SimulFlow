// Ações de item reutilizadas em Projetos/Obras, Produção, Programação, Qualidade e Almoxarifado.
import { html, campo, seletor, modal, botao, badge, toast, confirmar } from '../core/ui.js';
import { config } from '../core/config.js';
import { formCamposExtras, opcoesUsuarios, abrirHistorico, rotuloCiclo } from './comuns.js';
import { percentual, itemAtrasado, observacaoObrigatoria } from '../data/regras.js';
import { numero } from '../core/util.js';

export function badgeLaudo(item) {
  const s = item.laudo?.status;
  return badge(s || 'Aguardando laudo', s === 'Aprovado' ? 'green' : s === 'Reprovado' ? 'red' : 'amber');
}

function obrasDaRaiz(store, raizId) {
  return [raizId, ...store.filtrar('obras', o => o.parentId === raizId && !o.arquivado).map(o => o.id)];
}

/** Formulário de cadastro/edição do item. fixos: { obraId, pedidoId, cicloId } */
export function formItem(ctx, item = null, fixos = {}) {
  const { store, acoes } = ctx;
  const obraId = item?.obraId || fixos.obraId;
  const raizes = store.filtrar('obras', o => !o.parentId && !o.arquivado);
  const obraAtual = obraId || raizes[0]?.id || '';
  const opcoesDaObra = id => {
    const obras = obrasDaRaiz(store, id);
    return {
      subs: store.filtrar('obras', o => o.parentId === id && !o.arquivado),
      pedidos: store.filtrar('pedidos', p => obras.includes(p.obraId) && !p.arquivado),
      ciclos: store.filtrar('ciclos', c => c.obraId === id && c.status !== 'encerrado'),
      etapas: store.filtrar('etapas', e => obras.includes(e.obraId) && !e.arquivado).sort((a, b) => a.ordem - b.ordem),
    };
  };
  const corpoDependente = id => {
    const o = opcoesDaObra(id);
    return html`
      ${campo('Pedido (prazo de entrega)', seletor('pedidoId', [{ v: '', t: 'Sem pedido' }, ...o.pedidos.map(p => ({ v: p.id, t: `${p.numero} · entrega ${p.dataEntrega.split('-').reverse().join('/')}` }))], item?.pedidoId ?? fixos.pedidoId ?? ''))}
      ${campo('Sub-projeto', seletor('subprojetoId', [{ v: '', t: 'Sem sub-projeto' }, ...o.subs.map(s => ({ v: s.id, t: s.nome }))], item?.subprojetoId ?? ''))}
      ${campo('Ciclo da programação', seletor('cicloId', [{ v: '', t: 'Sem ciclo' }, ...o.ciclos.map(c => ({ v: c.id, t: rotuloCiclo(c) }))], item?.cicloId ?? fixos.cicloId ?? ''))}
      ${campo('Etapa (Produção)', seletor('etapaId', [{ v: '', t: 'Sem etapa' }, ...o.etapas.map(e => ({ v: e.id, t: e.nome + (e.obraId !== id ? ' (sub-projeto)' : '') }))], item?.etapaId ?? ''))}`;
  };
  modal({
    titulo: item ? `Editar item ${item.codigo}` : 'Novo item', largo: true,
    descricao: 'Item numerado individualmente, com prazo, status e avanço próprios.',
    corpo: html`<div class="form-grid">
      ${campo('Projeto/Obra', seletor('obraId', raizes.map(o => ({ v: o.id, t: o.nome })), obraAtual, item || fixos.obraId ? 'disabled' : 'data-obra'), { obrig: true })}
      ${campo('Número do item', html`<input name="codigo" required value="${item?.codigo || ''}" placeholder="T-24">`, { obrig: true })}
      <div class="form-grid full" data-dependente style="grid-column:1/-1">${corpoDependente(obraAtual)}</div>
      ${campo('Descrição / modelo', html`<input name="descricao" value="${item?.descricao || ''}">`)}
      ${campo('Número de série', html`<input name="serie" value="${item?.serie || ''}">`)}
      ${campo('Quantidade prevista', html`<input name="previsto" type="number" min="0.001" step="any" required value="${item?.previsto ?? 1}">`, { obrig: true, ajuda: 'Para acompanhar só em %, use 100 e unidade "%".' })}
      ${campo('Unidade', html`<input name="unidade" value="${item?.unidade || 'peça'}" list="unidades-item"><datalist id="unidades-item"><option value="peça"><option value="%"><option value="kg"><option value="m"><option value="un"></datalist>`)}
      ${campo('Prazo do item', html`<input name="prazo" type="date" value="${item?.prazo || ''}">`, { ajuda: 'Vazio = data de entrega do pedido.' })}
      ${campo('OP vinculada', seletor('opNumero', [{ v: '', t: 'Sem vínculo' }, ...store.todos('ops').map(o => ({ v: o.numero, t: `${o.numero} · ${o.produto}` }))], item?.opNumero || ''))}
      ${campo('Responsável', seletor('responsavelId', opcoesUsuarios(store, { vazio: 'Sem responsável' }), item?.responsavelId || ''))}
      ${formCamposExtras('item', item?.campos)}
    </div>`,
    aoMontar: form => {
      const sel = form.querySelector('[data-obra]');
      sel?.addEventListener('change', () => { form.querySelector('[data-dependente]').innerHTML = String(corpoDependente(sel.value)); });
    },
    onOk: d => {
      acoes.itens.salvarItem({ ...d, id: item?.id, obraId: item?.obraId || fixos.obraId || d.obraId });
      toast(item ? 'Item atualizado' : 'Item cadastrado');
    },
  });
}

export function modalAvanco(ctx, item) {
  const { store, acoes } = ctx;
  const politica = store.config.politicas.quantidade;
  const atrasado = itemAtrasado(item, store.obter('ciclos', item.cicloId), store.todos('extras'));
  modal({
    titulo: `Atualizar avanço · ${item.codigo}`,
    descricao: `${numero(item.realizado, 3)} de ${numero(item.previsto, 3)} ${item.unidade} realizados (${numero(percentual(item, store.todos('extras')))}%)`,
    corpo: html`<div class="form-grid">
      ${campo(`Quantidade realizada total (${item.unidade})`, html`<input name="realizado" type="number" min="0" max="${item.previsto}" step="any" required value="${item.realizado}">`, { obrig: true, ajuda: item.laudo?.status === 'Aprovado' ? '' : 'Concluir (100%) exige laudo aprovado da Qualidade.' })}
      ${campo('Turno', seletor('turno', config.app.turnos, config.app.turnos[0]), { obrig: true })}
      <label class="toggle full" style="grid-column:1/-1"><input type="checkbox" name="semObservacao"> Não vou deixar observação</label>
      ${campo('Observação', html`<textarea name="nota" data-obs></textarea>`, { full: true, ajuda: politica === 'sempre' ? 'Observação obrigatória.' : politica === 'condicional' ? 'Obrigatória em redução ou item atrasado' + (atrasado ? ' (item atrasado).' : '.') : 'Opcional.' })}
    </div>`,
    aoMontar: form => {
      const chk = form.querySelector('[name=semObservacao]');
      const obs = form.querySelector('[data-obs]');
      const atualizar = () => {
        obs.disabled = chk.checked;
        const novo = Number(form.querySelector('[name=realizado]').value);
        obs.required = !chk.checked && observacaoObrigatoria(politica, novo, item.realizado, atrasado);
      };
      form.addEventListener('input', atualizar);
      chk.addEventListener('change', atualizar);
      atualizar();
    },
    onOk: d => { acoes.itens.atualizarAvanco({ id: item.id, ...d }); toast('Avanço registrado'); },
  });
}

export function modalLaudo(ctx, item) {
  modal({
    titulo: `Laudo · ${item.codigo}`, descricao: `${item.descricao || ''} ${item.opNumero ? '· ' + item.opNumero : '· Sem OP vinculada'}`,
    corpo: html`${campo('Resultado do laudo', seletor('status', [{ v: '', t: 'Selecione o resultado', desab: true }, 'Aprovado', 'Reprovado'], item.laudo?.status || '', 'required'), { obrig: true })}
      ${campo('Observação do laudo', html`<textarea name="nota" required>${item.laudo?.nota || ''}</textarea>`, { obrig: true })}`,
    rotuloOk: 'Salvar laudo',
    onOk: d => { ctx.acoes.itens.registrarLaudo({ id: item.id, ...d }); toast('Laudo registrado'); },
  });
}

export function modalConsumo(ctx, item) {
  const mats = ctx.store.todos('materiais');
  modal({
    titulo: `Consumir material · ${item.codigo}`, descricao: 'A quantidade é baixada do estoque do Almoxarifado.',
    corpo: html`${campo('Material', seletor('materialId', [{ v: '', t: 'Selecione o material' }, ...mats.map(m => ({ v: m.id, t: `${m.codigo} · ${m.nome} · ${numero(m.estoque, 3)} ${m.unidade}` }))], '', 'required'), { obrig: true })}
      <p class="muted small" data-info></p>
      ${campo('Quantidade', html`<input name="quantidade" type="number" min="0.001" step="any" required>`, { obrig: true })}`,
    rotuloOk: 'Registrar consumo',
    aoMontar: form => {
      const sel = form.querySelector('[name=materialId]');
      sel.addEventListener('change', () => {
        const m = mats.find(x => x.id === sel.value);
        form.querySelector('[data-info]').textContent = m ? `Disponível: ${numero(m.estoque, 3)} ${m.unidade} · Mínimo: ${numero(m.minimo, 3)} ${m.unidade}` : '';
        form.querySelector('[name=quantidade]').max = m ? m.estoque : '';
      });
    },
    onOk: d => { ctx.acoes.itens.consumirMaterial({ id: item.id, ...d }); toast('Consumo registrado e estoque atualizado'); },
  });
}

export function modalMoverEtapa(ctx, item) {
  const { store } = ctx;
  const obras = obrasDaRaiz(store, item.obraId);
  const etapas = store.filtrar('etapas', e => obras.includes(e.obraId) && !e.arquivado).sort((a, b) => a.ordem - b.ordem);
  modal({
    titulo: `Mover ${item.codigo} de etapa`,
    corpo: campo('Etapa de destino', seletor('etapaId', [{ v: '', t: 'Sem etapa' }, ...etapas.map(e => ({ v: e.id, t: e.nome }))], item.etapaId || '')),
    rotuloOk: 'Mover',
    onOk: d => { ctx.acoes.itens.moverParaEtapa({ id: item.id, etapaId: d.etapaId }); toast('Item movido'); },
  });
}

/** Botões de ação de um item (respeitam as permissões). opcoes: lista de ações a mostrar. */
export function botoesItem(ctx, item, opcoes = ['avanco', 'laudo', 'consumo', 'historico']) {
  const { store, regra, pode } = ctx;
  const etapa = store.obter('etapas', item.etapaId);
  const ativo = !item.arquivado;
  const b = {
    editar: () => botao('', { acao: 'item-editar', dados: { id: item.id }, v: 'ghost', tam: 'icon', icone: 'edit', titulo: `Editar ${item.codigo}`, desab: !ativo || !regra('editarItens') }),
    avanco: () => botao('Avanço', { acao: 'item-avanco', dados: { id: item.id }, v: 'outline', tam: 'sm', icone: 'play', desab: !ativo || !regra('atualizarItem', etapa), titulo: 'Atualizar avanço' }),
    mover: () => botao('', { acao: 'item-mover', dados: { id: item.id }, v: 'ghost', tam: 'icon', icone: 'move', titulo: 'Mover de etapa', desab: !ativo || !regra('moverItem') }),
    laudo: () => pode('qualidade') ? botao('Laudo', { acao: 'item-laudo', dados: { id: item.id }, v: 'outline', tam: 'sm', icone: 'shield', desab: !ativo || !regra('laudo') }) : '',
    consumo: () => (pode('almoxarifado') || pode('producao')) ? botao('Consumir', { acao: 'item-consumo', dados: { id: item.id }, v: 'outline', tam: 'sm', icone: 'package', desab: !ativo || !regra('consumir'), titulo: 'Consumir material' }) : '',
    historico: () => botao('', { acao: 'item-historico', dados: { id: item.id }, v: 'ghost', tam: 'icon', icone: 'history', titulo: `Histórico ${item.codigo}` }),
    arquivar: () => botao('', { acao: 'item-arquivar', dados: { id: item.id }, v: 'ghost', tam: 'icon', icone: item.arquivado ? 'restore' : 'archive', titulo: item.arquivado ? `Desarquivar ${item.codigo}` : `Arquivar ${item.codigo}`, desab: !(regra('editarItens') || regra('arquivarProgramacao')) }),
  };
  return html`<div class="row-actions">${opcoes.map(o => b[o]?.() || '')}</div>`;
}

/** Handlers para os botões acima (mesclar no `cliques` de delegar). */
export function cliquesItem(ctx) {
  const item = id => ctx.store.obter('itens', id);
  return {
    'item-editar': d => formItem(ctx, item(d.id)),
    'item-avanco': d => modalAvanco(ctx, item(d.id)),
    'item-laudo': d => modalLaudo(ctx, item(d.id)),
    'item-consumo': d => modalConsumo(ctx, item(d.id)),
    'item-mover': d => modalMoverEtapa(ctx, item(d.id)),
    'item-historico': d => { const i = item(d.id); abrirHistorico(ctx.store, i.codigo, a => a.entidadeId === i.id || ctx.store.obter('extras', a.entidadeId)?.itemId === i.id); },
    'item-arquivar': async d => {
      const i = item(d.id);
      const arquivar = !i.arquivado;
      if (await confirmar(`${arquivar ? 'Arquivar' : 'Desarquivar'} ${i.codigo}?`, 'Nenhum dado ou histórico será apagado.')) {
        ctx.acoes.obras.arquivar({ entidade: 'item', id: i.id, arquivar });
        toast(arquivar ? 'Item arquivado' : 'Item desarquivado');
      }
    },
  };
}

export function consumoResumo(item) {
  if (!item.consumo?.length) return '';
  return html`<span class="subline">Materiais: ${item.consumo.map(c => `${c.codigo}: ${numero(c.quantidade, 3)} ${c.unidade}`).join(' · ')}</span>`;
}
