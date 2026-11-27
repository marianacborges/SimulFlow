// Operações sobre o conjunto de dados (só host): demonstração, começar vazio, importar backup.
import { autorizar, auditar } from './base.js';
import { ehHost } from '../../core/permissoes.js';
import { COLECOES, configPadrao, validarBackup } from '../store.js';
import { dadosDemonstracao, VERSAO_DEMO } from '../demo.js';

function manterUsuarios(store, novos) {
  const estado = { config: { ...configPadrao(), ...(novos.config || {}) } };
  for (const c of COLECOES) estado[c] = novos[c] || [];
  estado.usuarios = store.todos('usuarios');
  estado.auditoria = [...store.todos('auditoria'), ...(novos.auditoria || [])];
  estado.config.politicas = store.config.politicas;
  estado.config.dashboardMaxDias = store.config.dashboardMaxDias;
  return estado;
}

/** Substitui os dados de negócio pela demonstração (usuários e auditoria são mantidos). */
export function restaurarDemonstracao(store, u) {
  autorizar(store, u, ehHost(u), 'restaurar demonstração', {}, 'Ação exclusiva do host');
  store.substituir(manterUsuarios(store, dadosDemonstracao()));
  store.transacao(() => auditar(store, u, { acao: 'Dados de demonstração restaurados', entidade: 'sistema' }));
}

/**
 * Ao abrir o sistema: se o navegador só tem dados de DEMONSTRAÇÃO de uma versão antiga (nenhum registro
 * cadastrado por alguém), troca pela demonstração atual. Usuários, senhas, auditoria, tipos de ensaio
 * (limites configurados) e políticas são mantidos. Havendo qualquer registro real, não mexe em nada.
 * Devolve true se atualizou.
 */
export function atualizarDemonstracaoSePreciso(store) {
  if (store.config.demoVersao === VERSAO_DEMO) return false;
  const negocio = COLECOES.filter(c => !['usuarios', 'auditoria', 'tiposEnsaio'].includes(c));
  const registros = negocio.flatMap(c => store.todos(c));
  if (!registros.length || !registros.every(r => r.demo === true)) return false;
  const novos = dadosDemonstracao();
  const estado = manterUsuarios(store, novos);
  estado.tiposEnsaio = store.todos('tiposEnsaio').length ? store.todos('tiposEnsaio') : novos.tiposEnsaio;
  estado.config.demoVersao = VERSAO_DEMO;
  const vistos = new Set();
  estado.auditoria = estado.auditoria.filter(r => !vistos.has(r.id) && vistos.add(r.id));
  estado.auditoria.push({ id: 'au-demo-v' + VERSAO_DEMO, em: new Date().toISOString(), atorId: null, ator: 'Sistema', acao: 'Demonstração atualizada (mais OPs, FAs e materiais)', entidade: 'sistema', entidadeId: null, obraId: null, antes: null, depois: null, nota: 'Só dados de demonstração foram substituídos', turno: '', criadoEm: new Date().toISOString() });
  store.substituir(estado);
  return true;
}

/** Apaga os dados de negócio (obras, OPs, FAs…) mantendo usuários e auditoria. */
export function comecarVazio(store, u) {
  autorizar(store, u, ehHost(u), 'limpar dados', {}, 'Ação exclusiva do host');
  store.substituir(manterUsuarios(store, { config: { contadores: { fa: 0 } } }));
  store.transacao(() => auditar(store, u, { acao: 'Dados de negócio limpos (Limpar dados)', entidade: 'sistema' }));
}

/** Importa um backup completo (substitui tudo, inclusive usuários). */
export function importarBackup(store, u, pacote) {
  autorizar(store, u, ehHost(u), 'importar backup', {}, 'Ação exclusiva do host');
  validarBackup(pacote);
  store.importar(pacote);
}
