// Testes das regras de negócio e das ações (rodados por: node tools/simulflow.js testar).
// Usa apenas node:assert e um adaptador em memória — nada de navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function executar(raiz) {
  const mod = rel => import(pathToFileURL(path.join(raiz, rel)).href);
  const { definirConfig, config } = await mod('js/core/config.js');
  definirConfig({
    app: JSON.parse(fs.readFileSync(path.join(raiz, 'config/app.json'), 'utf8')),
    abas: JSON.parse(fs.readFileSync(path.join(raiz, 'config/abas.json'), 'utf8')),
    campos: {},
  });
  const R = await mod('js/data/regras.js');
  const { combinaTexto, somarDias, hoje } = await mod('js/core/util.js');
  const { pode, permissoesPadrao, regrasAcesso } = await mod('js/core/permissoes.js');
  const { criarStore } = await mod('js/data/store.js');
  const { criarAdaptadorMemoria } = await mod('js/data/adapters/local.js');
  const { criarAcoes } = await mod('js/data/acoes/index.js');
  const { dadosDemonstracao } = await mod('js/data/demo.js');
  const { montarPainel, erroPeriodo, periodo } = await mod('js/data/painel-dados.js');

  const testes = [];
  const t = (nome, fn) => testes.push([nome, fn]);
  const D = n => somarDias(hoje(), n);

  // ---- OPs (paridade com os testes do protótipo) ----
  t('avanço da OP pela quantidade produzida', () => assert.equal(R.progressoOP({ planejado: 500, produzido: 340 }), 68));
  t('OP aberta e vencida é atrasada', () => assert.equal(R.opAtrasada({ status: 'Em andamento', prazo: '2026-11-11' }, '2026-11-12'), true));
  t('OP concluída nunca é atrasada', () => assert.equal(R.opAtrasada({ status: 'Concluída', prazo: '2026-11-11' }, '2026-11-12'), false));
  t('produção que completa a OP vai para Aguardando qualidade', () => assert.equal(R.transicaoOP({ status: 'Em andamento', produzido: 90, planejado: 100 }, 'produção', { quantidade: 10 }).status, 'Aguardando qualidade'));
  t('produção acima do planejado é recusada', () => assert.throws(() => R.transicaoOP({ status: 'Em andamento', produzido: 95, planejado: 100 }, 'produção', { quantidade: 10 })));
  t('falta de matéria-prima vai para Aguardando material e avisa Almoxarifado', () => {
    const r = R.transicaoOP({ status: 'Em andamento', produzido: 0, planejado: 10 }, 'parada', { motivo: 'Falta de matéria-prima', nota: 'x' });
    assert.equal(r.status, 'Aguardando material'); assert.ok(r.destinatarios.includes('Almoxarifado'));
  });
  t('ocorrência exige observação', () => assert.throws(() => R.transicaoOP({ status: 'Em andamento', produzido: 0, planejado: 10 }, 'parada', { motivo: 'Outros', nota: '' })));
  t('só conclui com inspeção aprovada', () => {
    assert.equal(R.transicaoOP({ status: 'Aguardando qualidade', produzido: 10, planejado: 10 }, 'inspeção', { motivo: 'Aprovada', nota: 'ok' }).status, 'Concluída');
    assert.equal(R.transicaoOP({ status: 'Aguardando qualidade', produzido: 10, planejado: 10 }, 'inspeção', { motivo: 'Reprovada', nota: 'nc' }).status, 'Parada');
    assert.throws(() => R.transicaoOP({ status: 'Em andamento', produzido: 5, planejado: 10 }, 'inspeção', { motivo: 'Aprovada', nota: 'ok' }));
  });
  t('retomada volta para aguardando qualidade quando já completa', () => assert.equal(R.transicaoOP({ status: 'Parada', produzido: 10, planejado: 10 }, 'retomada', { nota: 'ok' }).status, 'Aguardando qualidade'));

  // ---- Busca ----
  const op = { numero: 'OP-2026-001', faFicha: 'FA-001', produto: 'Conjunto de engrenagens', responsavel: 'Carlos Silva', setor: 'Usinagem', status: 'Em andamento', prazo: '2099-11-18' };
  const obra = { nome: 'Linha Atlas', contrato: 'C-1' };
  t('busca por número, obra, responsável e status', () => { for (const q of ['OP-2026-001', 'Atlas', 'Carlos Silva', 'Em andamento', 'Atlas Carlos andamento']) assert.ok(R.combinaOP(op, obra, q), q); });
  t('busca rejeita termo que não aparece', () => assert.equal(R.combinaOP(op, obra, 'Atlas Juliana'), false));
  t('busca ignora acentos e maiúsculas', () => assert.ok(combinaTexto(' CONCLUIDA ', ['Concluída'])));

  // ---- Itens / programação ----
  t('avanço inclui etapas adicionais não canceladas', () => {
    const item = { id: 'i', previsto: 10, realizado: 5 };
    assert.equal(R.percentual(item, [{ itemId: 'i', previsto: 10, realizado: 5, status: 'em andamento' }, { itemId: 'i', previsto: 50, realizado: 0, status: 'cancelada' }]), 50);
  });
  t('laudo reprovado limita o avanço a 99%', () => assert.equal(R.percentual({ id: 'i', previsto: 10, realizado: 10, laudo: { status: 'Reprovado' } }), 99));
  t('100% exige laudo aprovado', () => { assert.equal(R.podeConcluir({}), false); assert.equal(R.podeConcluir({ laudo: { status: 'Aprovado' } }), true); });
  t('esperado é interpolação linear do início do ciclo ao prazo', () => assert.equal(R.esperado({ prazo: '2026-01-11' }, { inicio: '2026-01-01' }, '2026-01-06'), 50));
  t('status do item: bloqueado tem prioridade', () => {
    const item = { id: 'i', previsto: 10, realizado: 10, laudo: { status: 'Aprovado' }, prazo: D(5) };
    assert.equal(R.statusItem(item, null, [{ itemId: 'i', status: 'solicitado', statusDesde: new Date().toISOString(), codigo: 'L1' }]), 'bloqueado');
    assert.equal(R.statusItem(item, null, []), 'concluído');
  });
  t('item com prazo vencido está em atraso', () => assert.equal(R.statusItem({ id: 'i', previsto: 10, realizado: 2, prazo: D(-1) }, null, []), 'em atraso'));
  t('ciclo de 21 dias ou com justificativa', () => {
    assert.ok(R.cicloValido('2026-01-01', '2026-01-22'));
    assert.equal(R.cicloValido('2026-01-01', '2026-01-20'), false);
    assert.ok(R.cicloValido('2026-01-01', '2026-01-20', 'feriado'));
  });
  t('fluxo de ensaio: NII antes de NIII, sem atalhos', () => {
    assert.equal(R.proximoStatusEnsaio('solicitado'), 'em execução');
    assert.equal(R.proximoStatusEnsaio('em execução'), 'aguardando NII');
    assert.equal(R.proximoStatusEnsaio('aguardando NII', 'aprovado'), 'aguardando NIII');
    assert.equal(R.proximoStatusEnsaio('aguardando NIII', 'aprovado'), 'aprovado');
    assert.equal(R.proximoStatusEnsaio('aguardando NII', 'reprovado'), 'reprovado');
  });
  t('gargalo só com limite configurado', () => {
    const e = { status: 'solicitado', statusDesde: new Date(Date.now() - 5 * 3600000).toISOString() };
    assert.equal(R.gargalo(e, { limites: {} }), false);
    assert.equal(R.gargalo(e, { limites: { solicitado: 4 } }), true);
  });
  t('política de observação condicional', () => {
    assert.equal(R.observacaoObrigatoria('opcional', 1, 5, true), false);
    assert.equal(R.observacaoObrigatoria('condicional', 1, 5, false), true);
    assert.equal(R.observacaoObrigatoria('condicional', 6, 5, false), false);
    assert.equal(R.observacaoObrigatoria('sempre', 6, 5, false, true), false);
  });
  t('pedidos ordenados pela data de entrega', () => assert.deepEqual(R.pedidosPorData([{ numero: '2', dataEntrega: '2027-02-01' }, { numero: '1', dataEntrega: '2027-01-01' }]).map(p => p.numero), ['1', '2']));
  t('FA: transições e atraso', () => {
    assert.ok(R.transicaoFAValida('Aberta', 'Em andamento'));
    assert.equal(R.transicaoFAValida('Cancelada', 'Concluída'), false);
    assert.ok(R.faAtrasada({ status: 'Aberta', prazo: '2020-01-01' }));
    assert.equal(R.faAtrasada({ status: 'Concluída', prazo: '2020-01-01' }), false);
  });

  // ---- Permissões ----
  const usr = (p = {}) => ({ id: 'u', ativo: true, host: false, area: 'Produção', funcoes: [], permissoes: {}, ...p });
  t('host pode tudo; desativado nada', () => { assert.ok(pode(usr({ host: true }), 'pcp', true)); assert.equal(pode(usr({ host: true, ativo: false }), 'pcp'), false); });
  t('ver não permite editar', () => { const u = usr({ permissoes: { pcp: 'ver' } }); assert.ok(pode(u, 'pcp')); assert.equal(pode(u, 'pcp', true), false); });
  t('abas do host não são liberadas a usuários comuns', () => assert.equal(pode(usr({ permissoes: { usuarios: 'editar' } }), 'usuarios'), false));
  t('padrão da área: editar na própria aba, ver nas outras', () => { const p = permissoesPadrao('Qualidade'); assert.equal(p.qualidade, 'editar'); assert.equal(p.pcp, 'ver'); assert.equal(p.usuarios, undefined); });
  t('verificador NIII só depois do NII aprovado e se atribuído', () => {
    const u = usr({ funcoes: ['niii'], permissoes: { qualidade: 'editar' } });
    const e = { status: 'aguardando NIII', nii: { status: 'aprovado' }, niii: { verificadorId: 'u' } };
    assert.ok(regrasAcesso.verificarEnsaio(u, e));
    assert.equal(regrasAcesso.verificarEnsaio(u, { ...e, niii: { verificadorId: 'outro' } }), false);
    assert.equal(regrasAcesso.verificarEnsaio(u, { ...e, status: 'aguardando NII' }), false);
  });

  // ---- Ações com store em memória ----
  const novoStore = () => {
    const store = criarStore(criarAdaptadorMemoria()); store.carregar(); store.substituir(dadosDemonstracao());
    let atual = null; const acoes = criarAcoes(store, () => atual);
    atual = acoes.usuarios.criarHost({ login: 'Host@Teste', nome: 'Host', credencial: { hash: 'h', salt: 's' } });
    return { store, acoes, entrarComo: u => { atual = u; } };
  };
  t('host criado com login normalizado e só uma vez', () => {
    const { store, acoes } = novoStore();
    assert.equal(store.todos('usuarios')[0].login, 'host@teste');
    assert.throws(() => acoes.usuarios.criarHost({ login: 'x', nome: 'y', credencial: { hash: 'h' } }));
  });
  t('usuário só com "ver" não cadastra OP e a tentativa é auditada', () => {
    const { store, acoes, entrarComo } = novoStore();
    const leitor = acoes.usuarios.salvarUsuario({ login: 'leitor', nome: 'Leitor', area: 'Qualidade', permissoes: { pcp: 'ver' }, credencial: { hash: 'h', salt: 's' } });
    entrarComo(leitor);
    assert.throws(() => acoes.ops.salvarOP({ numero: 'OP-X', faFicha: 'F', produto: 'P', obraId: 'o-vasos', planejado: 1, responsavel: 'R', inicio: hoje(), prazo: hoje() }), /autorizados/);
    assert.ok(store.todos('auditoria').some(a => a.acao.startsWith('Tentativa não autorizada')));
    assert.equal(store.todos('ops').some(o => o.numero === 'OP-X'), false);
  });
  t('OP exige obra e número único', () => {
    const { acoes } = novoStore();
    assert.throws(() => acoes.ops.salvarOP({ numero: 'OP-2026-001', faFicha: 'F', produto: 'P', obraId: 'o-vasos', planejado: 1, responsavel: 'R', inicio: hoje(), prazo: hoje() }), /já existe/);
    assert.throws(() => acoes.ops.salvarOP({ numero: 'OP-NOVA', faFicha: 'F', produto: 'P', obraId: '', planejado: 1, responsavel: 'R', inicio: hoje(), prazo: hoje() }), /Projeto\/Obra/);
  });
  t('transação desfaz tudo em caso de erro', () => {
    const { store, acoes } = novoStore();
    const antes = store.obter('materiais', 'm-0').estoque;
    assert.throws(() => acoes.itens.consumirMaterial({ id: 'i-t24', materialId: 'm-0', quantidade: antes + 1 }));
    assert.equal(store.obter('materiais', 'm-0').estoque, antes);
  });
  t('conclusão do item bloqueada sem laudo e liberada com laudo aprovado', () => {
    const { store, acoes } = novoStore();
    assert.throws(() => acoes.itens.atualizarAvanco({ id: 'i-t29', realizado: 10, turno: 'manhã' }), /laudo aprovado/);
    acoes.itens.registrarLaudo({ id: 'i-t29', status: 'Aprovado', nota: 'ok' });
    acoes.itens.atualizarAvanco({ id: 'i-t29', realizado: 10, turno: 'manhã' });
    assert.equal(store.obter('itens', 'i-t29').realizado, 10);
  });
  t('turno obrigatório na atualização de quantidade', () => { const { acoes } = novoStore(); assert.throws(() => acoes.itens.atualizarAvanco({ id: 'i-t29', realizado: 3, turno: '' }), /turno/); });
  t('arquivar obra arquiva sub-projetos, pedidos e itens; desarquivar filho exige pai', () => {
    const { store, acoes } = novoStore();
    acoes.obras.arquivar({ entidade: 'obra', id: 'o-torpedo', arquivar: true });
    assert.ok(store.obter('obras', 'o-ancoragem').arquivado && store.obter('pedidos', 'p-024-02').arquivado && store.obter('itens', 'i-t35').arquivado);
    assert.throws(() => acoes.obras.arquivar({ entidade: 'obra', id: 'o-ancoragem', arquivar: false }), /pai/);
    acoes.obras.arquivar({ entidade: 'obra', id: 'o-torpedo', arquivar: false });
    assert.equal(store.obter('itens', 'i-t35').arquivado, false);
  });
  t('contrato aditivado: pedidos com datas diferentes e número único por obra', () => {
    const { store, acoes } = novoStore();
    const ped = store.filtrar('pedidos', p => p.obraId === 'o-torpedo');
    assert.ok(new Set(ped.map(p => p.dataEntrega)).size > 1);
    assert.throws(() => acoes.obras.salvarPedido({ obraId: 'o-torpedo', numero: 'PED-024-01', dataEntrega: D(10) }), /já cadastrado/);
  });
  t('ensaio completo: execução, NII, NIII e aprovação desbloqueiam o item', () => {
    const { store, acoes } = novoStore();
    const host = store.todos('usuarios')[0];
    const e = acoes.ensaios.solicitarEnsaio({ itemId: 'i-t35', tipoId: 'te-1', codigo: 'LD-T35', inspetorId: host.id, niiId: host.id, niiiId: host.id });
    assert.equal(R.statusItem(store.obter('itens', 'i-t35'), null, store.todos('ensaios')), 'bloqueado');
    acoes.ensaios.executarEnsaio({ id: e.id }); acoes.ensaios.executarEnsaio({ id: e.id });
    assert.throws(() => acoes.ensaios.verificarEnsaio({ id: e.id, decisao: 'reprovado', nota: '' }), /observação/);
    acoes.ensaios.verificarEnsaio({ id: e.id, decisao: 'aprovado' });
    acoes.ensaios.verificarEnsaio({ id: e.id, decisao: 'aprovado' });
    assert.equal(store.obter('ensaios', e.id).status, 'aprovado');
    assert.notEqual(R.statusItem(store.obter('itens', 'i-t35'), null, store.todos('ensaios')), 'bloqueado');
  });
  t('FA: numeração automática, observação obrigatória e notificação ao destino', () => {
    const { store, acoes } = novoStore();
    const fa = acoes.fas.salvarFA({ titulo: 'Teste', setorOrigem: 'PCP', setorDestino: 'Qualidade', responsavelNome: 'Z', prazo: D(3), obraId: 'o-torpedo', itemIds: ['i-t24'] });
    assert.equal(fa.numero, 'FA-013');
    assert.ok(store.todos('eventos').some(e => e.faId === fa.id && e.destinatarios.includes('Qualidade')));
    assert.throws(() => acoes.fas.statusFA({ id: fa.id, status: 'Concluída', nota: '' }), /observação/);
    acoes.fas.statusFA({ id: fa.id, status: 'Em andamento', nota: 'iniciado' });
    assert.equal(store.obter('fas', fa.id).status, 'Em andamento');
    assert.throws(() => acoes.fas.salvarFA({ titulo: 'X', setorOrigem: 'PCP', setorDestino: 'Qualidade', responsavelNome: 'Z', prazo: D(3), obraId: 'o-vasos', itemIds: ['i-t24'] }), /não pertence/);
  });
  t('Dashboard: período e indicadores', () => {
    const { store } = novoStore();
    assert.equal(erroPeriodo({ inicio: '2026-01-10', fim: '2026-01-01' }), 'Data final não pode ser anterior à data inicial.');
    assert.match(erroPeriodo({ inicio: '2026-01-01', fim: '2026-03-01' }, 30), /limite/);
    const f = { ...periodo('30', store.todos('ciclos')), statusItem: [], statusEnsaio: [], statusExtra: [], obras: [], etapa: '', tipo: '', preset: '30' };
    const d = { obras: store.todos('obras'), etapas: store.todos('etapas'), ciclos: store.todos('ciclos'), itens: store.todos('itens'), ensaios: store.todos('ensaios'), tipos: store.todos('tiposEnsaio'), extras: [], eventos: store.todos('eventos'), auditoria: store.todos('auditoria') };
    const v = montarPainel(d, { ...f, inicio: D(-30), fim: D(60) });
    assert.equal(v.indicadores.length, 5);
    assert.ok(Number(v.indicadores[3].valor) >= 1);
  });

  // ---- Demonstração ----
  const { atualizarDemonstracaoSePreciso } = await mod('js/data/acoes/dados.js');
  const { VERSAO_DEMO } = await mod('js/data/demo.js');
  t('demonstração: 3 obras, 24 OPs, 12 FAs e 15 materiais coerentes com a configuração', () => {
    const d = dadosDemonstracao();
    assert.equal(d.obras.length, 3);
    assert.equal(d.ops.length, 24);
    assert.equal(d.fas.length, 12);
    assert.equal(d.materiais.length, 15);
    for (const [col, campo] of [['ops', 'numero'], ['fas', 'numero'], ['materiais', 'codigo'], ['ops', 'id'], ['fas', 'id'], ['eventos', 'id'], ['auditoria', 'id']]) {
      const v = d[col].map(r => r[campo]);
      assert.equal(new Set(v).size, v.length, `${col}.${campo} repetido`);
    }
    assert.ok(d.ops.every(o => /^OP-2026-\d{3}$/.test(o.numero) && d.obras.some(x => x.id === o.obraId) && config.app.setoresOP.includes(o.setor) && config.app.statusOP.includes(o.status)));
    assert.ok(d.fas.every(f => /^FA-\d{3}$/.test(f.numero) && (!f.opId || d.ops.some(o => o.id === f.opId)) && f.itemIds.every(id => d.itens.some(i => i.id === id))
      && config.app.areas.includes(f.setorOrigem) && config.app.areas.includes(f.setorDestino) && config.app.statusFA.includes(f.status)));
    assert.ok(d.materiais.every(m => config.app.unidadesMaterial.includes(m.unidade) && (!m.opNumero || d.ops.some(o => o.numero === m.opNumero))));
    assert.ok(d.eventos.every(e => !e.opId || d.ops.some(o => o.id === e.opId && o.numero === e.ref)));
    assert.equal(d.config.contadores.fa, 12);
    assert.ok(d.ops.some(o => R.opAtrasada(o)) && d.fas.some(f => R.faAtrasada(f)) && d.materiais.filter(m => m.estoque < m.minimo).length >= 4);
  });
  t('demonstração antiga é trocada pela nova só quando o navegador tem apenas dados de demonstração', () => {
    const antiga = () => {
      const st = criarStore(criarAdaptadorMemoria()); st.carregar();
      const d = dadosDemonstracao(); delete d.config.demoVersao; d.ops = d.ops.slice(0, 8); d.fas = d.fas.slice(0, 3); d.materiais = d.materiais.slice(0, 5);
      d.tiposEnsaio[0].limites.solicitado = 12; // limite configurado pelo host: deve ser mantido
      d.usuarios = [{ id: 'u1', login: 'host', nome: 'Host', host: true, ativo: true, credencial: { hash: 'x' } }];
      st.substituir(d);
      return st;
    };
    const st = antiga();
    assert.equal(atualizarDemonstracaoSePreciso(st), true);
    assert.equal(st.todos('ops').length, 24);
    assert.equal(st.todos('fas').length, 12);
    assert.equal(st.todos('materiais').length, 15);
    assert.equal(st.todos('usuarios')[0].login, 'host');
    assert.equal(st.todos('tiposEnsaio')[0].limites.solicitado, 12);
    assert.equal(st.config.demoVersao, VERSAO_DEMO);
    const ids = st.todos('auditoria').map(a => a.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(atualizarDemonstracaoSePreciso(st), false, 'não repete');
    // Com um cadastro real, não mexe.
    const real = antiga();
    real.transacao(s => s.inserir('ops', { numero: 'OP-REAL-1', produto: 'Cadastro real' }));
    assert.equal(atualizarDemonstracaoSePreciso(real), false);
    assert.equal(real.todos('ops').length, 9);
    // Depois de "Limpar dados" (sem registros), não volta a demonstração.
    const vazio = criarStore(criarAdaptadorMemoria()); vazio.carregar(); vazio.substituir({ usuarios: [{ id: 'u1', host: true, ativo: true }] });
    assert.equal(atualizarDemonstracaoSePreciso(vazio), false);
    assert.equal(vazio.todos('ops').length, 0);
  });

  // ---- Filtros do topo do Dashboard (Período, Operação, Status) ----
  const FD = await mod('js/data/filtros-dashboard.js');
  t('dashboard: período Diário = hoje, Semanal = últimos 7 dias, Mensal = últimos 30 dias', () => {
    assert.deepEqual(FD.intervaloDash('diario', '2026-11-27'), { inicio: '2026-11-27', fim: '2026-11-27' });
    assert.deepEqual(FD.intervaloDash('semanal', '2026-11-27'), { inicio: '2026-11-21', fim: '2026-11-27' });
    assert.deepEqual(FD.intervaloDash('mensal', '2026-11-27'), { inicio: '2026-10-29', fim: '2026-11-27' });
    assert.equal(FD.intervaloDash('', '2026-11-27'), null);
  });
  t('dashboard: status agrupado (pendente inclui atrasada)', () => {
    const dia = '2026-11-27';
    const op = (status, prazo = '2026-12-31') => FD.grupoStatusOP({ status, prazo }, dia);
    assert.equal(op('Em andamento'), 'andamento');
    assert.equal(op('Em andamento', '2026-11-20'), 'pendente');
    assert.equal(op('Aguardando material'), 'pendente');
    assert.equal(op('Aguardando qualidade'), 'pendente');
    assert.equal(op('Parada'), 'interrompida');
    assert.equal(op('Parada', '2026-11-20'), 'interrompida');
    assert.equal(op('Concluída', '2026-11-20'), 'concluida');
    const fa = (status, prazo = '2026-12-31') => FD.grupoStatusFA({ status, prazo }, dia);
    assert.equal(fa('Aberta'), 'pendente');
    assert.equal(fa('Em andamento'), 'andamento');
    assert.equal(fa('Em andamento', '2026-11-20'), 'pendente');
    assert.equal(fa('Concluída'), 'concluida');
    assert.equal(fa('Cancelada'), 'interrompida');
  });
  t('dashboard: período pega o que esteve em execução (atrasada e não concluída vai até hoje)', () => {
    const dia = '2026-11-27', semana = FD.intervaloDash('semanal', dia), hojeI = FD.intervaloDash('diario', dia);
    assert.equal(FD.opNoPeriodo({ status: 'Em andamento', inicio: '2026-11-01', prazo: '2026-12-10' }, hojeI, dia), true);
    assert.equal(FD.opNoPeriodo({ status: 'Em andamento', inicio: '2026-09-01', prazo: '2026-10-01' }, hojeI, dia), true);
    assert.equal(FD.opNoPeriodo({ status: 'Em andamento', inicio: '2026-12-05', prazo: '2026-12-20' }, semana, dia), false);
    assert.equal(FD.opNoPeriodo({ status: 'Concluída', inicio: '2026-09-01', prazo: '2026-10-01' }, semana, dia), false);
    assert.equal(FD.opNoPeriodo({ status: 'Concluída', inicio: '2026-09-01', prazo: '2026-10-01', atualizadoEm: '2026-11-25T10:00:00Z' }, semana, dia), true);
    assert.equal(FD.faNoPeriodo({ status: 'Concluída', criadoEm: '2026-10-01T00:00:00Z', prazo: '2026-10-10', concluidaEm: '2026-10-09T12:00:00Z' }, semana, dia), false);
    assert.equal(FD.faNoPeriodo({ status: 'Aberta', criadoEm: '2026-11-26T00:00:00Z', prazo: '2026-12-10' }, hojeI, dia), true);
  });
  t('dashboard: operação = etapa de produção (OPs e FAs ligadas aos itens da etapa)', () => {
    const store = criarStore(criarAdaptadorMemoria()); store.carregar(); store.substituir(dadosDemonstracao());
    const ops = FD.opcoesOperacao(store);
    assert.ok(ops.length >= 3 && ops.includes('Soldagem') && new Set(ops).size === ops.length);
    const nomeEtapa = id => store.obter('etapas', id)?.nome;
    for (const nome of ops) {
      const F = FD.criarFiltroDash(store, { operacao: nome });
      const numeros = new Set(store.filtrar('itens', i => !i.arquivado && nomeEtapa(i.etapaId) === nome).map(i => i.opNumero).filter(Boolean));
      assert.deepEqual(store.todos('ops').filter(F.op).map(o => o.numero).sort(), [...numeros].sort());
    }
    const todos = FD.criarFiltroDash(store, {});
    assert.equal(store.todos('ops').filter(todos.op).length, store.todos('ops').length);
    assert.equal(todos.ativo, false);
    const pend = FD.criarFiltroDash(store, { status: 'pendente' });
    assert.ok(store.todos('ops').filter(pend.op).every(o => FD.grupoStatusOP(o) === 'pendente'));
    assert.equal(FD.criarFiltroDash(store, { status: 'concluida' }).itemAtrasado({ id: 'x' }), false);
    assert.match(FD.resumoFiltrosDash({ periodo: 'semanal', operacao: 'Soldagem', status: 'pendente' }), /Semanal.*Soldagem.*Pendente/);
  });

  let falhas = 0;
  for (const [nome, fn] of testes) {
    try { await fn(); console.log('  ✓ ' + nome); } catch (e) { falhas++; console.log('  ✗ ' + nome + '\n      ' + (e.message || e)); }
  }
  console.log(`\n${testes.length - falhas} de ${testes.length} testes passaram.`);
  return falhas;
}
