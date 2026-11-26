// Operações sobre o conjunto de dados (só host): demonstração, começar vazio, importar backup.
import { autorizar, auditar } from './base.js';
import { ehHost } from '../../core/permissoes.js';
import { COLECOES, configPadrao, validarBackup } from '../store.js';
import { dadosDemonstracao } from '../demo.js';

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
