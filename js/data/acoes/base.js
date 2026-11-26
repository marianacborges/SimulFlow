// Utilitários comuns às ações de negócio.
import { agoraISO } from '../../core/util.js';

export function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

export function exigirTexto(valor, rotulo) {
  const v = String(valor ?? '').trim();
  if (!v) throw new Error(`Informe ${rotulo}`);
  return v;
}

export function exigirNumero(valor, rotulo, { min = -Infinity, max = Infinity, inteiro = false } = {}) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || !Number.isFinite(n)) throw new Error(`Informe ${rotulo}`);
  if (inteiro && !Number.isInteger(n)) throw new Error(`${rotulo} deve ser um número inteiro`);
  if (n < min || n > max) throw new Error(`${rotulo} fora do intervalo permitido`);
  return n;
}

export function exigirData(valor, rotulo) {
  const v = String(valor ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) throw new Error(`Informe ${rotulo}`);
  return v;
}

/** Registro de auditoria (somente inserção — não há função para alterar ou apagar). */
export function auditar(store, u, { acao, entidade = '', entidadeId = null, obraId = null, antes = null, depois = null, nota = '', turno = '' }) {
  return store.inserir('auditoria', {
    em: agoraISO(), atorId: u?.id || null, ator: u?.nome || 'Sistema', acao, entidade, entidadeId, obraId,
    antes: antes ? JSON.parse(JSON.stringify(antes)) : null,
    depois: depois ? JSON.parse(JSON.stringify(depois)) : null,
    nota, turno,
  });
}

/** Notificação entre setores (aba Notificações). */
export function notificar(store, u, ev) {
  return store.inserir('eventos', {
    em: agoraISO(), ref: ev.ref || '', tipo: ev.tipo, descricao: ev.descricao, origem: ev.origem || '',
    destinatarios: ev.destinatarios || [], prioridade: ev.prioridade || 'Normal', lida: false, resolvida: false,
    providencia: '', nota: ev.nota || '', statusAnterior: ev.statusAnterior || '', statusNovo: ev.statusNovo || '',
    ator: u?.nome || 'Sistema', obraId: ev.obraId || null, itemId: ev.itemId || null, ensaioId: ev.ensaioId || null,
    opId: ev.opId || null, faId: ev.faId || null, destinatarioId: ev.destinatarioId || null,
  });
}

/**
 * Confere a permissão ANTES da transação. Se negada, grava a tentativa na auditoria
 * (em transação própria, para não ser desfeita) e lança erro.
 */
export function autorizar(store, u, permitido, acao, contexto = {}, mensagem = 'Seu perfil ou área não permite esta alteração') {
  if (!u || !u.ativo) throw new Error('Sessão expirada. Entre novamente.');
  if (permitido) return;
  store.transacao(() => auditar(store, u, { acao: 'Tentativa não autorizada: ' + acao, nota: mensagem, ...contexto }));
  throw new Error(mensagem);
}

/** Lê campos extras (config/campos.json) do formulário: chaves "campo.<nome>". */
export function camposDoForm(dados) {
  const campos = {};
  for (const [k, v] of Object.entries(dados || {})) if (k.startsWith('campo.')) campos[k.slice(6)] = v;
  return campos;
}

export function obraRaiz(store, obraId) {
  let o = store.obter('obras', obraId);
  while (o && o.parentId) o = store.obter('obras', o.parentId);
  return o;
}
