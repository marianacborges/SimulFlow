// Dados de demonstração (fictícios). Datas relativas ao dia de hoje para o cenário sempre fazer sentido.
// Não cria usuários: o primeiro acesso continua exigindo a criação do host.
import { hoje, somarDias } from '../core/util.js';

export function dadosDemonstracao(dia = hoje()) {
  const D = n => somarDias(dia, n);
  const agora = Date.now();
  const horasAtras = h => new Date(agora - h * 3600000).toISOString();
  const criadoEm = horasAtras(24 * 8);
  const base = { criadoEm, demo: true };

  const obras = [
    { id: 'o-torpedo', nome: 'Estaca Torpedo', contrato: 'DEMO-NUC-024', cliente: 'Petrobras', responsavel: 'Equipe de projetos', status: 'Em andamento', descricao: 'Estruturas de ancoragem submarina', parentId: null, temSubprojetos: true, escopoEtapas: 'obra', inicio: D(-30), fim: D(90), oculto: false, arquivado: false, campos: {}, ...base },
    { id: 'o-ancoragem', nome: 'Estruturas de ancoragem', contrato: 'DEMO-NUC-024-S1', cliente: 'Petrobras', responsavel: 'Equipe de projetos', status: 'Em andamento', descricao: 'Sub-projeto da Estaca Torpedo', parentId: 'o-torpedo', temSubprojetos: false, escopoEtapas: 'obra', inicio: '', fim: '', oculto: false, arquivado: false, campos: {}, ...base },
    { id: 'o-vasos', nome: 'Vasos de Pressão', contrato: 'DEMO-NUC-035', cliente: 'Eletronuclear', responsavel: 'Equipe de projetos', status: 'Em andamento', descricao: 'Fabricação e inspeção de vasos', parentId: null, temSubprojetos: false, escopoEtapas: 'obra', inicio: D(-20), fim: D(60), oculto: false, arquivado: false, campos: {}, ...base },
  ];

  // Contrato aditivado: a Estaca Torpedo tem dois pedidos com datas de entrega diferentes.
  const pedidos = [
    { id: 'p-024-01', obraId: 'o-torpedo', numero: 'PED-024-01', dataEntrega: D(14), status: 'Em andamento', observacoes: 'Pedido original do contrato', arquivado: false, campos: {}, ...base },
    { id: 'p-024-02', obraId: 'o-torpedo', numero: 'PED-024-02', dataEntrega: D(45), status: 'Em andamento', observacoes: 'Aditivo contratual nº 1', arquivado: false, campos: {}, ...base },
    { id: 'p-035-01', obraId: 'o-vasos', numero: 'PED-035-01', dataEntrega: D(14), status: 'Em andamento', observacoes: '', arquivado: false, campos: {}, ...base },
  ];

  const etapa = (id, obraId, nome, ordem, resp) => ({ id, obraId, nome, area: 'Produção', responsavelId: null, responsavelNome: resp, ordem, arquivado: false, responsavelDesde: criadoEm, campos: {}, ...base });
  const etapas = [
    etapa('e-solda', 'o-torpedo', 'Soldagem', 0, 'Equipe de soldagem'),
    etapa('e-montagem', 'o-torpedo', 'Montagem', 1, 'Equipe de montagem'),
    etapa('e-pintura', 'o-torpedo', 'Pintura', 2, 'Equipe de pintura'),
    etapa('e-usinagem', 'o-vasos', 'Usinagem', 0, 'Equipe de usinagem'),
    etapa('e-pintura-vp', 'o-vasos', 'Pintura', 1, 'Equipe de pintura'),
  ];

  const ciclos = [
    { id: 'c-torpedo', obraId: 'o-torpedo', inicio: D(-7), fim: D(14), meta: 80, status: 'em andamento', justificativa: '', ...base },
    { id: 'c-vasos', obraId: 'o-vasos', inicio: D(-7), fim: D(14), meta: 85, status: 'em andamento', justificativa: '', ...base },
  ];

  const laudoOk = { status: 'Aprovado', nota: 'Conforme especificação (demonstração)', por: 'Dados de exemplo', porId: null, em: horasAtras(20) };
  const item = (id, codigo, obraId, extra) => ({
    id, codigo, obraId, subprojetoId: null, pedidoId: null, cicloId: null, etapaId: null, responsavelId: null, serie: '', opNumero: '',
    descricao: '', unidade: 'peça', previsto: 10, realizado: 0, prazo: '', laudo: null, consumo: [], arquivado: false, campos: {}, ...base, ...extra,
  });
  const torpedo = [[3, -2], [8, 2], [4, -1], [10, 4], [2, 5], [0, 6]];
  const itens = [
    ...torpedo.map(([real, prazo], k) => item(`i-t${24 + k}`, `T-${24 + k}`, 'o-torpedo', {
      subprojetoId: k === 0 ? 'o-ancoragem' : null, pedidoId: 'p-024-01', cicloId: 'c-torpedo', etapaId: k < 3 ? 'e-solda' : 'e-montagem',
      descricao: 'Estrutura de ancoragem', realizado: real, prazo: D(prazo), serie: `ET-${24 + k}-001`,
      opNumero: k < 3 ? 'OP-2026-001' : 'OP-2026-007', laudo: real === 10 ? laudoOk : null,
    })),
    item('i-t35', 'T-35', 'o-torpedo', { pedidoId: 'p-024-02', etapaId: 'e-pintura', descricao: 'Estaca do aditivo contratual', prazo: D(40), serie: 'ET-35-001' }),
    ...[[7, 7], [2, 8], [10, 9], [0, 10]].map(([real, prazo], k) => item(`i-vp${k + 1}`, `VP-${k + 1}`, 'o-vasos', {
      pedidoId: 'p-035-01', cicloId: 'c-vasos', etapaId: 'e-usinagem', descricao: 'Corpo do vaso de pressão', realizado: real, prazo: D(prazo),
      opNumero: 'OP-2026-002', laudo: real === 10 ? laudoOk : null,
    })),
  ];

  const tiposEnsaio = ['Ultrassom', 'Radiografia', 'Líquido penetrante', 'Volumétrico'].map((nome, k) => ({ id: 'te-' + k, nome, limites: { 'solicitado': null, 'em execução': null, 'aguardando NII': null, 'aguardando NIII': null }, ...base }));
  const verif = (status, h, nota = '') => ({ verificadorId: null, status, nota, em: status === 'pendente' ? null : horasAtras(h), por: status === 'pendente' ? '' : 'Dados de exemplo' });
  const ensaio = (k, status, nii, niii, pend = '') => ({
    id: `en-${k}`, obraId: 'o-torpedo', itemId: `i-t${23 + k}`, tipoId: 'te-0', codigo: `DEMO-LD-${1230 + k}`, inspetorId: null, status,
    solicitadoEm: horasAtras(30), executadoEm: k >= 3 ? horasAtras(17) : null, statusDesde: horasAtras(15), pendencia: pend, cancelamento: '', nii, niii, ...base,
  });
  const reprova = 'Indicação fora da tolerância; refazer solda.';
  const ensaios = [
    ensaio(1, 'solicitado', verif('pendente'), verif('pendente')),
    ensaio(2, 'em execução', verif('pendente'), verif('pendente')),
    ensaio(3, 'aguardando NIII', verif('aprovado', 15), verif('pendente')),
    ensaio(4, 'aprovado', verif('aprovado', 16), verif('aprovado', 15)),
    ensaio(5, 'reprovado', verif('aprovado', 16), verif('reprovado', 15, reprova), reprova),
  ];

  const efetivo = [
    { id: 'f-1', obraId: 'o-torpedo', etapaId: 'e-solda', dia, turno: 'manhã', previstos: 10, disponiveis: 8, nota: 'Dados de demonstração', atorId: null, ...base },
    { id: 'f-2', obraId: 'o-torpedo', etapaId: 'e-montagem', dia, turno: 'manhã', previstos: 6, disponiveis: 6, nota: 'Dados de demonstração', atorId: null, ...base },
    { id: 'f-3', obraId: 'o-vasos', etapaId: 'e-usinagem', dia, turno: 'manhã', previstos: 5, disponiveis: 4, nota: 'Dados de demonstração', atorId: null, ...base },
  ];

  const op = (n, faFicha, produto, obraId, planejado, produzido, setor, responsavel, ini, prazo, status) => ({
    id: 'op-' + n, numero: 'OP-2026-00' + n, faFicha, produto, obraId, planejado, produzido, setor, responsavel, inicio: D(ini), prazo: D(prazo), status, campos: {}, ...base,
  });
  const ops = [
    op(1, 'FA-001', 'Conjunto de engrenagens', 'o-torpedo', 500, 340, 'Usinagem', 'Carlos Silva', -10, 6, 'Em andamento'),
    op(2, 'FA-002', 'Eixo de transmissão', 'o-vasos', 200, 80, 'Usinagem', 'Ana Souza', -9, -1, 'Em andamento'),
    op(3, 'FA-003', 'Suporte estrutural', 'o-torpedo', 350, 120, 'Montagem', 'Pedro Lima', -7, 8, 'Aguardando material'),
    op(4, 'FA-004', 'Painel de comando', 'o-torpedo', 80, 80, 'Qualidade', 'Juliana Costa', -11, 4, 'Aguardando qualidade'),
    op(5, 'FA-005', 'Flange de conexão', 'o-vasos', 600, 600, 'Usinagem', 'Carlos Silva', -17, -2, 'Concluída'),
    op(6, 'FA-006', 'Carcaça de motor', 'o-torpedo', 150, 60, 'Fundição', 'Marcos Alves', -8, 3, 'Parada'),
    op(7, 'FA-007', 'Válvula de controle', 'o-torpedo', 300, 210, 'Montagem', 'Ana Souza', -6, 10, 'Em andamento'),
    op(8, 'FA-008', 'Kit de fixação', 'o-vasos', 1000, 1000, 'Montagem', 'Pedro Lima', -15, 0, 'Concluída'),
  ];

  const materiais = [
    ['MAT-001', 'Aço carbono SAE 1020', 'Metais', 45, 100, 'kg', 'OP-2026-003'],
    ['MAT-002', 'Chapa de alumínio 3 mm', 'Metais', 280, 80, 'kg', 'OP-2026-006'],
    ['MAT-003', 'Parafuso M12 × 40', 'Fixadores', 1800, 500, 'un', 'OP-2026-008'],
    ['MAT-004', 'Rolamento 6205', 'Componentes', 32, 50, 'un', 'OP-2026-001'],
    ['MAT-005', 'Cabo flexível 2,5 mm', 'Elétricos', 420, 100, 'm', 'OP-2026-004'],
  ].map(([codigo, nome, categoria, estoque, minimo, unidade, opNumero], k) => ({ id: 'm-' + k, codigo, nome, categoria, estoque, minimo, unidade, opNumero, campos: {}, ...base }));

  const ev = (k, opN, tipo, descricao, origem, destinatarios, prioridade, h) => ({
    id: 'ev-' + k, em: horasAtras(h), ref: 'OP-2026-00' + opN, tipo, descricao, origem, destinatarios, prioridade, lida: false, resolvida: false,
    providencia: '', nota: '', statusAnterior: '', statusNovo: '', ator: 'Dados de exemplo', obraId: ops[opN - 1].obraId, itemId: null, ensaioId: null,
    opId: 'op-' + opN, faId: null, destinatarioId: null, ...base, criadoEm: horasAtras(h),
  });
  const eventos = [
    ev(1, 3, 'parada', 'Falta de matéria-prima. Aço carbono insuficiente para a montagem.', 'Produção', ['PCP', 'Almoxarifado'], 'Alta', 2),
    ev(2, 2, 'prazo', 'Prazo de entrega ultrapassado. Revisar o planejamento com o cliente.', 'PCP', ['PCP', 'Projetos'], 'Alta', 3),
    ev(3, 4, 'inspeção pendente', 'Produção finalizada. Painéis aguardando inspeção da qualidade.', 'Produção', ['Qualidade'], 'Normal', 4),
    ev(4, 6, 'parada', 'Problemas em máquinas. Manutenção do equipamento em andamento.', 'Produção', ['PCP', 'Produção'], 'Alta', 5),
    ev(5, 1, 'produção', '40 unidades produzidas na etapa de usinagem.', 'Produção', ['PCP'], 'Normal', 6),
    { ...ev(6, 8, 'inspeção', 'Inspeção aprovada. Ordem concluída e liberada.', 'Qualidade', ['PCP', 'Projetos'], 'Normal', 22), lida: true },
  ];

  const fa = (k, titulo, descricao, obraId, opId, itemIds, setorOrigem, setorDestino, responsavelNome, prazo, status) => ({
    id: 'fa-' + k, numero: 'FA-00' + k, titulo, descricao, obraId, opId, itemIds, setorOrigem, setorDestino, responsavelId: null, responsavelNome,
    prazo: D(prazo), status, concluidaEm: null, campos: {}, ...base,
  });
  const fas = [
    fa(1, 'Liberar aço carbono para a OP-2026-003', 'Reposição do MAT-001 para retomar a montagem', 'o-torpedo', 'op-3', ['i-t25'], 'PCP', 'Almoxarifado', 'Almoxarifado central', 2, 'Em andamento'),
    fa(2, 'Inspeção das soldas T-24 e T-25', 'Liberar laudos antes da montagem', 'o-torpedo', 'op-1', ['i-t24', 'i-t25'], 'Produção', 'Qualidade', 'Inspeção de soldas', -1, 'Aberta'),
    fa(3, 'Preparar pintura do aditivo (T-35)', 'Planejar a frente de pintura do pedido PED-024-02', 'o-torpedo', null, ['i-t35'], 'Projetos/Obras', 'Produção', 'Equipe de pintura', 30, 'Aberta'),
  ];

  // Alertas da programação (ensaio solicitado e reprovação) e registros de auditoria dos ensaios.
  const alertaItem = (k, ensaioId, itemId, codigoItem, descricao, prioridade, h) => ({
    id: 'ev-p' + k, em: horasAtras(h), ref: codigoItem, tipo: 'ensaio', descricao, origem: 'Qualidade', destinatarios: ['Produção', 'PCP'], prioridade,
    lida: false, resolvida: false, providencia: '', nota: '', statusAnterior: '', statusNovo: '', ator: 'Dados de exemplo', obraId: 'o-torpedo',
    itemId, ensaioId, opId: null, faId: null, destinatarioId: null, ...base, criadoEm: horasAtras(h),
  });
  eventos.push(
    alertaItem(1, 'en-1', 'i-t24', 'T-24', 'Item T-24 bloqueado: laudo DEMO-LD-1231 solicitado', 'Normal', 30),
    alertaItem(2, 'en-5', 'i-t28', 'T-28', `Retrabalho necessário: item T-28, laudo DEMO-LD-1235. ${reprova}`, 'Alta', 15),
  );
  const auditoriaEnsaios = ensaios.map(e => ({ id: 'au-' + e.id, em: horasAtras(15), atorId: null, ator: 'Dados de exemplo', acao: 'Demonstração', entidade: 'ensaio', entidadeId: e.id, obraId: e.obraId, antes: null, depois: { status: e.status }, nota: 'Registro fictício', turno: '', criadoEm: horasAtras(15) }));

  const auditoria = [...auditoriaEnsaios, { id: 'au-demo', em: new Date().toISOString(), atorId: null, ator: 'Dados de exemplo', acao: 'Demonstração carregada', entidade: 'sistema', entidadeId: null, obraId: null, antes: null, depois: null, nota: 'Registros fictícios para teste', turno: '', criadoEm: new Date().toISOString() }];

  return {
    obras, pedidos, etapas, atribuicoes: [], ciclos, itens, ops, fas, materiais, eventos, auditoria, tiposEnsaio, ensaios, extras: [], efetivo,
    config: { contadores: { fa: 3 } },
  };
}
