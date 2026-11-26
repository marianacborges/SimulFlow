// Regras de acesso. As MESMAS funções são usadas para esconder/desabilitar botões
// e para barrar as gravações em js/data/acoes/* (a tela nunca é a única proteção).
import { config } from './config.js';

export const NIVEIS = ['nenhum', 'ver', 'editar'];

export function ehHost(u) {
  return !!(u && u.ativo && u.host);
}

/** O usuário pode ver (ou editar) a aba? */
export function pode(u, abaId, editar = false) {
  if (!u || !u.ativo) return false;
  if (u.host) return true;
  const aba = config.abas.find(a => a.id === abaId);
  if (aba) {
    const perfis = aba.perfis && aba.perfis.length ? aba.perfis : ['todos'];
    if (!perfis.includes('todos') && !perfis.includes(u.area)) return false;
  }
  const nivel = u.permissoes?.[abaId] ?? 'nenhum';
  return editar ? nivel === 'editar' : nivel === 'ver' || nivel === 'editar';
}

export function temFuncao(u, funcao) {
  return ehHost(u) || !!(u && u.ativo && (u.funcoes || []).includes(funcao));
}

/** Abas que só o host pode receber. */
export function abaSoHost(aba) {
  const perfis = aba.perfis || ['todos'];
  return perfis.includes('host') && !perfis.includes('todos');
}

/** Permissões padrão de um novo usuário: editar na(s) aba(s) da área, ver nas demais. */
export function permissoesPadrao(area) {
  const minhas = config.app.abasDaArea?.[area] || [];
  const p = {};
  for (const a of config.abas) {
    if (abaSoHost(a)) continue;
    p[a.id] = minhas.includes(a.id) ? 'editar' : 'ver';
  }
  return p;
}

// ---------- Regras específicas (espelham as funções do banco do protótipo) ----------

export const regrasAcesso = {
  // Projetos/Obras
  editarObras: u => pode(u, 'projetos', true),
  // Itens: cadastro/edição/arquivamento ficam em Projetos/Obras
  editarItens: u => pode(u, 'projetos', true),
  // Produção: etapas, ordem e movimentação de itens entre etapas
  editarEtapas: u => pode(u, 'producao', true),
  moverItem: u => pode(u, 'producao', true),
  /** Avanço do item: editar Produção, ou editar Programação + Supervisor da área/responsável da etapa. */
  atualizarItem: (u, etapa) => ehHost(u) || pode(u, 'producao', true) ||
    (pode(u, 'programacao', true) && temFuncao(u, 'supervisor') && !!etapa && (etapa.area === u.area || etapa.responsavelId === u.id)),
  efetivo: (u, etapa) => regrasAcesso.atualizarItem(u, etapa),
  // Programação
  criarCiclo: u => ehHost(u) || (pode(u, 'programacao', true) && temFuncao(u, 'gestor')),
  moverCiclo: u => ehHost(u) || (pode(u, 'programacao', true) && temFuncao(u, 'gestor')),
  arquivarProgramacao: u => ehHost(u) || (pode(u, 'programacao', true) && temFuncao(u, 'gestor')),
  criarExtra: u => ehHost(u) || temFuncao(u, 'etapa_adicional'),
  atualizarExtra: (u, x) => ehHost(u) || (pode(u, 'programacao', true) && !!x && (x.responsavelId === u.id || x.criadoPor === u.id)),
  // Qualidade
  laudo: u => pode(u, 'qualidade', true),
  inspecaoOP: u => pode(u, 'qualidade', true),
  solicitarEnsaio: u => pode(u, 'qualidade', true) && temFuncao(u, 'inspetor'),
  executarEnsaio: (u, e) => pode(u, 'qualidade', true) && (ehHost(u) || (temFuncao(u, 'inspetor') && e?.inspetorId === u.id)),
  verificarEnsaio: (u, e) => {
    if (!e || !pode(u, 'qualidade', true)) return false;
    if (e.status !== 'aguardando NII' && e.status !== 'aguardando NIII') return false;
    if (e.status === 'aguardando NIII' && e.nii?.status !== 'aprovado') return false;
    if (ehHost(u)) return true;
    const nivel = e.status === 'aguardando NII' ? 'nii' : 'niii';
    return temFuncao(u, nivel) && e[nivel]?.verificadorId === u.id;
  },
  cancelarEnsaio: u => pode(u, 'qualidade', true) && temFuncao(u, 'gestor'),
  // Almoxarifado
  materiais: u => pode(u, 'almoxarifado', true),
  consumir: u => pode(u, 'almoxarifado', true) || pode(u, 'producao', true),
  // OPs
  editarOP: u => pode(u, 'pcp', true),
  registrarProducao: u => pode(u, 'producao', true),
  ocorrencia: u => pode(u, 'producao', true),
  retomada: u => pode(u, 'almoxarifado', true) || pode(u, 'producao', true),
  atualizacaoProjeto: u => pode(u, 'projetos', true),
  // FAs
  editarFA: u => pode(u, 'pcp', true),
  statusFA: (u, fa) => pode(u, 'pcp', true) || (!!fa && !!u && fa.responsavelId === u.id) ||
    (!!fa && !!u && (config.app.abasDaArea?.[u.area] || []).some(a => pode(u, a, true)) && (fa.setorDestino === u.area || fa.setorOrigem === u.area)),
  // Notificações
  notificacoes: u => pode(u, 'notificacoes', true),
};
