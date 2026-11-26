// Testes do Apps Script da Presença operacional, rodando os .gs reais sobre o Google falso.
// Rodar: node --test apps-script/testes/   (ou npm test)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from './google-falso.js';

const SP = h => `2026-11-26T${h}:00-03:00`; // horário de São Paulo no dia 26/11/2026

function ambiente(hora = '08:00') {
  const g = carregarAppsScript({ agora: SP(hora) });
  const admin = g.criarToken('Administrador', 'admin');
  const planej = g.criarToken('PC do Planejamento', 'planejamento');
  const leitor = g.criarToken('Celular do Planejamento', 'leitor');
  const cad = (nome, matricula, funcao, tag, ativo = true) => {
    const r = g.api('colaboradores.salvar', { colaborador: { nome, matricula, funcao, tag, ativo } }, planej);
    assert.equal(r.ok, true, r.erro);
  };
  cad('Ana Souza', '00123', 'Soldador', '04:a1:b2:c3');
  cad('Bruno Lima', '00456', 'Montador', '04:D4:E5:F6');
  cad('Carla Dias', '00789', 'Soldador', '04:11:22:33');
  const ler = (codigo, origem = 'nfc', token = leitor) => g.api('leitura', { codigo, origem }, token);
  const hoje = () => g.api('hoje', {}, planej).planilha;
  return { ...g, admin, planej, leitor, ler, hoje };
}

describe('normalização do código da tag', () => {
  test('remove dois-pontos e coloca em maiúsculas', () => {
    const { ctx } = carregarAppsScript();
    assert.equal(ctx.normalizarTag('04:a1:b2'), '04A1B2');
    assert.equal(ctx.normalizarTag(' 04:A1:B2:C3 '), '04A1B2C3');
    assert.equal(ctx.normalizarTag('04a1b2'), '04A1B2');
  });
  test('tag cadastrada com dois-pontos é encontrada pelo serialNumber em minúsculas', () => {
    const t = ambiente();
    const r = t.ler('04:A1:B2:C3'.toLowerCase());
    assert.equal(r.leitura.resultado, 'registrado');
    assert.equal(r.leitura.colaborador.nome, 'Ana Souza');
  });
});

describe('leitura', () => {
  test('leitura válida registra Nome | Matrícula | Função | Data/Hora', () => {
    const t = ambiente('08:05');
    const r = t.ler('04:A1:B2:C3');
    assert.equal(r.ok, true);
    assert.deepEqual(
      { ...r.leitura.colaborador, data: r.leitura.data, horario: r.leitura.horario, fora: r.leitura.foraTurno },
      { nome: 'Ana Souza', matricula: '00123', funcao: 'Soldador', data: '2026-11-26', horario: '08:05', fora: false },
    );
    const p = t.hoje();
    assert.equal(p.contadores.presentes, 1);
    assert.equal(p.presentes[0].dataHora, '26/11/2026 08:05');
    // Gravado como texto na planilha (sem virar data/número).
    const linha = t.planilha.getSheetByName('Registros')._linhas()[0];
    assert.equal(linha[0], '2026-11-26');
    assert.equal(linha[2], '00123');
  });

  test('tag desconhecida: "Tag não cadastrada" e nada é gravado', () => {
    const t = ambiente();
    const r = t.ler('99:99:99:99');
    assert.equal(r.ok, true);
    assert.equal(r.leitura.ok, false);
    assert.equal(r.leitura.resultado, 'desconhecida');
    assert.equal(r.leitura.mensagem, 'Tag não cadastrada');
    assert.equal(t.planilha.getSheetByName('Registros')._linhas().length, 0);
  });

  test('duplicidade no dia: não duplica e informa "já registrado às HH:MM"', () => {
    const t = ambiente('07:45');
    t.ler('04:A1:B2:C3');
    t.relogio.definir(SP('09:10'));
    const r = t.ler('04:A1:B2:C3');
    assert.equal(r.leitura.resultado, 'duplicado');
    assert.equal(r.leitura.mensagem, 'Já registrado às 07:45');
    assert.equal(t.planilha.getSheetByName('Registros')._linhas().length, 1);
    // No dia seguinte pode registrar de novo.
    t.relogio.definir('2026-11-27T08:00:00-03:00');
    assert.equal(t.ler('04:A1:B2:C3').leitura.resultado, 'registrado');
  });

  test('leitura fora do turno (antes das 07:30) é aceita e marcada', () => {
    const t = ambiente('07:10');
    const r = t.ler('04:D4:E5:F6');
    assert.equal(r.leitura.resultado, 'registrado');
    assert.equal(r.leitura.foraTurno, true);
    assert.equal(r.leitura.mensagem, 'Presença registrada (fora do turno)');
    assert.equal(t.hoje().presentes[0].foraTurno, true);
  });

  test('às 07:30 já está dentro do turno', () => {
    const t = ambiente('07:30');
    assert.equal(t.ler('04:D4:E5:F6').leitura.foraTurno, false);
  });

  test('colaborador inativo não registra', () => {
    const t = ambiente();
    t.api('colaboradores.salvar', { colaborador: { nome: 'Bruno Lima', matricula: '00456', funcao: 'Montador', tag: '04:D4:E5:F6', ativo: false, matriculaOriginal: '00456' } }, t.planej);
    const r = t.ler('04D4E5F6');
    assert.equal(r.leitura.resultado, 'inativo');
    assert.equal(t.planilha.getSheetByName('Registros')._linhas().length, 0);
  });

  test('simulação aceita matrícula ou código; leitura NFC não aceita matrícula', () => {
    const t = ambiente();
    assert.equal(t.ler('00789', 'simulacao').leitura.colaborador.nome, 'Carla Dias');
    assert.equal(t.ler('00456', 'nfc').leitura.resultado, 'desconhecida');
  });
});

describe('fechamento do turno', () => {
  test('fecha às 16:40: 16:39 aberto, 16:40 fechado com histórico (presentes e ausentes)', () => {
    const t = ambiente('08:00');
    t.ler('04:A1:B2:C3');
    t.relogio.definir(SP('07:10')); // leitura antes do turno também entra na planilha
    t.ler('04:D4:E5:F6');
    t.relogio.definir(SP('16:39'));
    t.ctx.fechamentoAgendado();
    assert.equal(t.hoje().aberto, true);
    t.relogio.definir(SP('16:40'));
    t.ctx.fechamentoAgendado();
    const p = t.hoje();
    assert.equal(p.aberto, false);
    assert.equal(p.tipoFechamento, 'automatico');
    const turno = t.planilha.getSheetByName('Turnos')._linhas()[0];
    assert.equal(turno[3], 'automatico');
    assert.equal(turno[5], '2');
    const hist = t.planilha.getSheetByName('Histórico detalhado')._linhas();
    assert.deepEqual(hist.map(h => [h[1], h[2]]), [['Presente', 'Bruno Lima'], ['Presente', 'Ana Souza'], ['Ausente', 'Carla Dias']]);
    const lista = t.api('historico.listar', {}, t.planej).historico;
    assert.deepEqual(lista.map(h => [h.data, h.totalPresentes]), [['2026-11-26', 2]]);
  });

  test('após o fechamento: leitura até 23:59 vai para a lista separada, sem alterar o snapshot', () => {
    const t = ambiente('08:00');
    t.ler('04:A1:B2:C3');
    t.relogio.definir(SP('17:30'));
    const r = t.ler('04:11:22:33');
    assert.equal(r.leitura.resultado, 'registrado');
    assert.equal(r.leitura.aposFechamento, true);
    assert.equal(r.leitura.foraTurno, true);
    const p = t.hoje();
    assert.equal(p.contadores.presentes, 1);
    assert.equal(p.aposFechamento.length, 1);
    assert.equal(p.aposFechamento[0].nome, 'Carla Dias');
    assert.equal(p.ausentes.length, 1); // Bruno
    const turno = t.planilha.getSheetByName('Turnos')._linhas()[0];
    assert.equal(turno[5], '1');
    // Planilha fechada não pode ser fechada/editada de novo.
    assert.equal(t.api('turno.fechar', { confirmar: true }, t.admin).status, 409);
  });

  test('fechamento tardio: dia anterior aberto é fechado ao abrir no dia seguinte', () => {
    const t = ambiente('10:00');
    t.ler('04:A1:B2:C3');
    // Ninguém abriu o sistema nem o gatilho rodou depois das 16:40 (Google parado).
    t.relogio.definir('2026-11-27T08:15:00-03:00');
    const p = t.hoje();
    assert.equal(p.data, '2026-11-27');
    assert.equal(p.aberto, true);
    const turnos = t.planilha.getSheetByName('Turnos')._linhas();
    assert.equal(turnos[0][0], '2026-11-26');
    assert.equal(turnos[0][3], 'tardio');
    assert.equal(turnos[1][0], '2026-11-27');
    assert.equal(turnos[1][2], '');
    const dia = t.api('historico.dia', { data: '2026-11-26' }, t.planej).planilha;
    assert.equal(dia.aberto, false);
    assert.deepEqual(dia.presentes.map(x => [x.nome, x.horario]), [['Ana Souza', '10:00']]);
  });

  test('gatilho atrasado no mesmo dia (17:30) fecha como tardio', () => {
    const t = ambiente('09:00');
    t.relogio.definir(SP('17:30'));
    t.ctx.fechamentoAgendado();
    assert.equal(t.planilha.getSheetByName('Turnos')._linhas()[0][3], 'tardio');
  });

  test('"Fechar turno agora" só para admin e com confirmação', () => {
    const t = ambiente('11:00');
    t.ler('04:A1:B2:C3');
    assert.equal(t.api('turno.fechar', { confirmar: true }, t.planej).status, 403);
    assert.equal(t.api('turno.fechar', {}, t.admin).status, 400);
    const r = t.api('turno.fechar', { confirmar: true }, t.admin);
    assert.equal(r.ok, true);
    assert.equal(r.fechamento.tipo, 'manual');
    const depois = t.ler('04:D4:E5:F6');
    assert.equal(depois.leitura.aposFechamento, true);
    assert.equal(depois.leitura.foraTurno, false); // 11:00 está no horário, mas a planilha já fechou
  });
});

describe('acesso e cadastro', () => {
  test('sem token: 401; token revogado: 401; leitor não vê a planilha (403)', () => {
    const t = ambiente();
    assert.equal(t.api('leitura', { codigo: '04A1B2C3' }).status, 401);
    assert.equal(t.api('leitura', { codigo: '04A1B2C3' }, 'sf_inventado').status, 401);
    assert.equal(t.api('hoje', {}, t.leitor).status, 403);
    assert.equal(t.api('colaboradores.salvar', { colaborador: {} }, t.leitor).status, 403);
    const acessos = t.api('acessos.listar', {}, t.admin).acessos;
    const cel = acessos.find(a => a.nome === 'Celular do Planejamento');
    assert.equal(t.api('acessos.revogar', { id: cel.id }, t.admin).ok, true);
    assert.equal(t.ler('04A1B2C3').status, 401);
  });

  test('token guardado só como hash; acesso novo devolve o token uma vez', () => {
    const t = ambiente();
    const r = t.api('acessos.criar', { nome: 'Tablet', perfil: 'leitor' }, t.admin);
    assert.match(r.acesso.token, /^sf_[0-9a-f]{64}$/);
    const linhas = t.planilha.getSheetByName('Acessos')._linhas();
    assert.ok(linhas.every(l => !String(l[2]).startsWith('sf_')));
    assert.equal(t.api('status', {}, r.acesso.token).perfil, 'leitor');
  });

  test('matrícula e tag únicas (tag comparada já normalizada)', () => {
    const t = ambiente();
    const dupMat = t.api('colaboradores.salvar', { colaborador: { nome: 'X', matricula: '00123', funcao: 'Y' } }, t.planej);
    assert.equal(dupMat.status, 409);
    const dupTag = t.api('colaboradores.salvar', { colaborador: { nome: 'X', matricula: '999', funcao: 'Y', tag: '04a1b2c3' } }, t.planej);
    assert.equal(dupTag.status, 409);
    assert.match(dupTag.erro, /Ana Souza/);
  });

  test('importação CSV: tudo ou nada, atualiza pela matrícula', () => {
    const t = ambiente();
    const ruim = t.api('colaboradores.importar', { linhas: [
      { linha: 2, nome: 'Davi', matricula: '01000', funcao: 'Pintor', tag: '05:01' },
      { linha: 3, nome: '', matricula: '01001', funcao: 'Pintor', tag: '' },
      { linha: 4, nome: 'Eva', matricula: '01002', funcao: 'Pintor', tag: '04:A1:B2:C3' },
    ] }, t.planej);
    assert.equal(ruim.status, 400);
    assert.equal(ruim.detalhes.length, 2);
    assert.equal(t.api('colaboradores.listar', {}, t.planej).colaboradores.length, 3);
    const bom = t.api('colaboradores.importar', { linhas: [
      { nome: 'Davi', matricula: '01000', funcao: 'Pintor', tag: '05:01', ativo: 'Sim' },
      { nome: 'Ana Souza', matricula: '00123', funcao: 'Encarregada', tag: '04:A1:B2:C3', ativo: 'sim' },
    ] }, t.planej);
    assert.deepEqual(bom.importacao, { criados: 1, atualizados: 1 });
    const lista = t.api('colaboradores.listar', {}, t.planej).colaboradores;
    assert.equal(lista.find(c => c.matricula === '00123').funcao, 'Encarregada');
    assert.equal(lista.find(c => c.matricula === '01000').tag, '0501');
  });

  test('data no fuso de São Paulo, independente do fuso do servidor (23:30 SP = 02:30 UTC)', () => {
    const t = ambiente('08:00');
    t.relogio.definir('2026-11-27T02:30:00Z');
    const r = t.ler('04:A1:B2:C3');
    assert.equal(r.leitura.data, '2026-11-26');
    assert.equal(r.leitura.horario, '23:30');
  });

  test('planilha preparada: aba "Hoje" com fórmula, abas protegidas, gatilho de 5 min', () => {
    const t = ambiente();
    assert.match(t.planilha.getSheetByName('Hoje').getRange(1, 1).getFormula(), /QUERY\('Registros'!A:K/);
    for (const n of ['Registros', 'Turnos', 'Histórico detalhado', 'Acessos']) assert.equal(t.planilha.getSheetByName(n).getProtections().length, 1, n);
    assert.equal(t.planilha.getSheetByName('Colaboradores').getProtections().length, 0);
    t.ctx.instalarGatilho();
    t.ctx.instalarGatilho();
    assert.deepEqual(t.estado.gatilhos, [{ funcao: 'fechamentoAgendado', minutos: 5 }]);
  });
});
