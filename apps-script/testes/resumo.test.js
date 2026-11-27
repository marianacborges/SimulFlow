// E-mail diário do fechamento e relatório mensal da presença (Resumo.gs), sobre o Google falso.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from './google-falso.js';

const SP = (dia, h) => `2026-11-${dia}T${h}:00-03:00`;

function ambiente(dia = '26', hora = '08:00') {
  const estado = {};
  const g = carregarAppsScript({ agora: SP(dia, hora), estado });
  const admin = g.criarToken('PC Mariana', 'admin');
  const planej = g.criarToken('PC Planejamento', 'planejamento');
  const leitor = g.criarToken('Celular', 'leitor');
  for (const [nome, matricula, funcao, tag] of [['Ana Souza', '00123', 'Soldador', '04A1'], ['Bruno Lima', '00456', 'Montador', '04B2'], ['Carla Dias', '00789', 'Soldador', '04C3']]) {
    assert.equal(g.api('colaboradores.salvar', { colaborador: { nome, matricula, funcao, tag, ativo: true } }, planej).ok, true);
  }
  const ler = codigo => g.api('leitura', { codigo, origem: 'nfc' }, leitor);
  const emails = () => estado.emails || [];
  return { ...g, estado, admin, planej, leitor, ler, emails };
}

describe('e-mail diário com o resumo', () => {
  test('configurar destinatários: só admin, valida os e-mails', () => {
    const t = ambiente();
    assert.equal(t.api('config.salvar', { emailsResumo: 'pcp@empresa.com' }, t.planej).status, 403);
    assert.match(t.api('config.salvar', { emailsResumo: 'pcp@empresa.com, errado' }, t.admin).erro, /E-mail inválido: errado/);
    assert.equal(t.api('config.salvar', { emailsResumo: 'pcp@empresa.com; gerente@empresa.com' }, t.admin).emailsResumo, 'pcp@empresa.com, gerente@empresa.com');
    assert.equal(t.api('config.ler', {}, t.admin).emailsResumo, 'pcp@empresa.com, gerente@empresa.com');
  });

  test('fechamento automático às 16:40 envia um e-mail com presentes, por função e quem faltou — uma vez só', () => {
    const t = ambiente();
    t.api('config.salvar', { emailsResumo: 'pcp@empresa.com, gerente@empresa.com' }, t.admin);
    t.ler('04A1');
    t.relogio.definir(SP('26', '07:10'));
    t.ler('04B2');
    t.relogio.definir(SP('26', '16:40'));
    t.ctx.fechamentoAgendado();
    assert.equal(t.emails().length, 1);
    const m = t.emails()[0];
    assert.equal(m.to, 'pcp@empresa.com,gerente@empresa.com');
    assert.equal(m.subject, 'SimulFlow · Presença 26/11/2026: 2 de 3 presentes');
    assert.match(m.body, /Por função: Montador: 1 · Soldador: 1/);
    assert.match(m.body, /Não passaram o cartão \(1\): Carla Dias \(00789\)/);
    assert.match(m.body, /1 fora do turno/);
    assert.match(m.htmlBody, /Abrir a planilha/);
    const turno = t.planilha.getSheetByName('Turnos')._linhas()[0];
    assert.match(turno[7], /pcp@empresa.com/);
    // O gatilho continua rodando a cada 5 minutos: não repete o e-mail.
    t.relogio.definir(SP('26', '16:45'));
    t.ctx.fechamentoAgendado();
    t.relogio.definir(SP('26', '20:00'));
    t.api('hoje', {}, t.planej);
    assert.equal(t.emails().length, 1);
  });

  test('fechamento manual e tardio também enviam; sem destinatários, não envia', () => {
    const t = ambiente();
    t.ler('04A1');
    assert.equal(t.api('turno.fechar', { confirmar: true }, t.admin).fechamento.email, 'sem destinatários');
    assert.equal(t.emails().length, 0);
    t.api('config.salvar', { emailsResumo: 'pcp@empresa.com' }, t.admin);
    t.relogio.definir(SP('27', '09:00'));
    t.api('hoje', {}, t.planej); // cria o dia 27
    t.relogio.definir(SP('28', '08:00'));
    t.api('hoje', {}, t.planej); // dia 27 esquecido aberto: fecha como tardio e manda o e-mail
    assert.equal(t.emails().length, 1);
    assert.match(t.emails()[0].subject, /27\/11\/2026: 0 de 3 presentes/);
    assert.match(t.emails()[0].body, /fechada \(tardio\)/);
  });

  test('falha no envio do e-mail não impede o fechamento do dia', () => {
    const t = ambiente();
    t.api('config.salvar', { emailsResumo: 'pcp@empresa.com' }, t.admin);
    t.estado.falharEmail = true;
    const r = t.api('turno.fechar', { confirmar: true }, t.admin);
    assert.equal(r.ok, true);
    assert.match(r.fechamento.email, /falhou: Cota/);
    assert.equal(t.api('hoje', {}, t.planej).planilha.aberto, false);
  });

  test('e-mail de teste (admin) com a situação de agora', () => {
    const t = ambiente();
    assert.match(t.api('resumo.teste', {}, t.admin).erro, /Salve ao menos um e-mail/);
    t.api('config.salvar', { emailsResumo: 'pcp@empresa.com' }, t.admin);
    t.ler('04A1');
    assert.equal(t.api('resumo.teste', {}, t.admin).enviadoPara, 'pcp@empresa.com');
    assert.match(t.emails()[0].subject, /^\[teste\] SimulFlow · Presença 26\/11\/2026: 1 de 3 presentes/);
    assert.match(t.emails()[0].body, /ainda aberta/);
  });
});

describe('relatório mensal', () => {
  test('por colaborador: presenças, faltas, fora do turno, após o fechamento e % — só dias fechados', () => {
    const t = ambiente('24', '08:00');
    t.ler('04A1'); t.ler('04B2');                          // 24: Ana e Bruno
    t.relogio.definir(SP('24', '17:00')); t.ctx.fechamentoAgendado();
    t.ler('04C3');                                        // 24 após o fechamento: Carla
    t.relogio.definir(SP('25', '07:00')); t.ler('04A1');   // 25: Ana fora do turno
    t.relogio.definir(SP('25', '16:40')); t.ctx.fechamentoAgendado();
    t.relogio.definir(SP('26', '08:00')); t.ler('04A1'); t.ler('04C3'); // 26: ainda aberto (não entra)
    const r = t.api('relatorio.mes', { mes: '2026-11' }, t.planej);
    assert.equal(r.ok, true, r.erro);
    const rel = r.relatorio;
    assert.deepEqual(rel.dias.map(d => [d.data, d.presentes, d.ativos]), [['2026-11-24', 2, 3], ['2026-11-25', 1, 3]]);
    assert.deepEqual(rel.totais, { diasFechados: 2, mediaPresentes: 1.5 });
    const por = Object.fromEntries(rel.colaboradores.map(c => [c.nome, [c.presentes, c.faltas, c.foraTurno, c.aposFechamento, c.percentual]]));
    assert.deepEqual(por['Ana Souza'], [2, 0, 1, 0, 100]);
    assert.deepEqual(por['Bruno Lima'], [1, 1, 0, 0, 50]);
    assert.deepEqual(por['Carla Dias'], [0, 2, 0, 1, 0]);
    assert.deepEqual(rel.colaboradores.map(c => c.nome), ['Ana Souza', 'Bruno Lima', 'Carla Dias']);
  });

  test('mês inválido e permissões', () => {
    const t = ambiente();
    assert.match(t.api('relatorio.mes', { mes: '11/2026' }, t.planej).erro, /Mês inválido/);
    assert.equal(t.api('relatorio.mes', { mes: '2026-11' }, t.leitor).status, 403);
    assert.deepEqual(t.api('relatorio.mes', { mes: '2026-10' }, t.admin).relatorio.colaboradores, []);
  });
});
