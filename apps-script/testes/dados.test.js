// Testes da API de dados compartilhados do SimulFlow (aba "Dados"), sobre o Google falso.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from './google-falso.js';

function ambiente() {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00' });
  return {
    ...g,
    admin: g.criarToken('PC Mariana', 'admin'),
    sistema: g.criarToken('PC Produção', 'sistema'),
    planej: g.criarToken('PC Planejamento', 'planejamento'),
    leitor: g.criarToken('Celular', 'leitor'),
  };
}

const estadoExemplo = () => ({
  usuarios: [{ id: 'u1', nome: 'Host', login: 'host', host: true }],
  ops: [{ id: 'op-1', numero: 'OP-2026-001', produto: 'Eixo', status: 'Em andamento' }],
  fas: [],
  config: { politicas: { quantidade: 'opcional' }, contadores: { fa: 0 } },
});

describe('dados compartilhados', () => {
  test('planilha nova: vazia, versão 0; o computador do sistema faz a primeira carga', () => {
    const t = ambiente();
    const r = t.api('dados.tudo', {}, t.sistema);
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.versao, 0);
    assert.deepEqual(r.estado.ops, []);
    const s = t.api('dados.substituir', { estado: estadoExemplo() }, t.sistema);
    assert.equal(s.ok, true, s.erro);
    const tudo = t.api('dados.tudo', {}, t.planej);
    assert.equal(tudo.estado.ops[0].numero, 'OP-2026-001');
    assert.equal(tudo.estado.usuarios[0].login, 'host');
    assert.equal(tudo.estado.config.contadores.fa, 0);
    assert.equal(tudo.geracao, s.geracao);
  });

  test('gravar e buscar só o que mudou desde a última versão', () => {
    const t = ambiente();
    const { geracao } = t.api('dados.substituir', { estado: estadoExemplo() }, t.admin);
    const v0 = t.api('dados.tudo', {}, t.sistema).versao;
    const g1 = t.api('dados.gravar', { geracao, mudancas: [
      { colecao: 'ops', id: 'op-1', registro: { id: 'op-1', numero: 'OP-2026-001', produto: 'Eixo', status: 'Concluída' } },
      { colecao: 'fas', id: 'fa-1', registro: { id: 'fa-1', numero: 'FA-001' } },
    ] }, t.sistema);
    assert.equal(g1.ok, true, g1.erro);
    assert.equal(g1.versao, v0 + 1);
    const m = t.api('dados.mudancas', { desde: v0, geracao }, t.planej);
    assert.equal(m.mudancas.length, 2);
    assert.equal(m.mudancas.find(x => x.id === 'op-1').registro.status, 'Concluída');
    assert.deepEqual(t.api('dados.mudancas', { desde: g1.versao, geracao }, t.planej).mudancas, []);
    // Registros gravados como texto (JSON) na aba Dados, com quem gravou.
    const linha = t.planilha.getSheetByName('Dados')._linhas().find(l => l[1] === 'fa-1');
    assert.equal(linha[0], 'fas');
    assert.equal(JSON.parse(linha[2]).numero, 'FA-001');
    assert.equal(linha[5], 'PC Produção');
  });

  test('exclusão chega como registro null e some do estado completo', () => {
    const t = ambiente();
    const { geracao } = t.api('dados.substituir', { estado: estadoExemplo() }, t.admin);
    const v = t.api('dados.tudo', {}, t.sistema).versao;
    t.api('dados.gravar', { geracao, mudancas: [{ colecao: 'ops', id: 'op-1', registro: null }] }, t.sistema);
    const m = t.api('dados.mudancas', { desde: v, geracao }, t.sistema);
    assert.deepEqual(m.mudancas, [{ colecao: 'ops', id: 'op-1', registro: null }]);
    assert.deepEqual(t.api('dados.tudo', {}, t.sistema).estado.ops, []);
  });

  test('geração nova (dados substituídos): quem estava desatualizado recebe "recarregar" e não grava', () => {
    const t = ambiente();
    const g1 = t.api('dados.substituir', { estado: estadoExemplo() }, t.admin).geracao;
    const g2 = t.api('dados.substituir', { estado: { ...estadoExemplo(), ops: [] } }, t.admin).geracao;
    assert.notEqual(g1, g2);
    assert.equal(t.api('dados.mudancas', { desde: 5, geracao: g1 }, t.sistema).recarregar, true);
    const r = t.api('dados.gravar', { geracao: g1, mudancas: [{ colecao: 'ops', id: 'x', registro: { id: 'x' } }] }, t.sistema);
    assert.equal(r.ok, false);
    assert.equal(r.status, 409);
    assert.deepEqual(t.api('dados.tudo', {}, t.sistema).estado.ops, []);
  });

  test('permissões: leitor não acessa dados; sistema não vê presença; substituir com dados exige admin', () => {
    const t = ambiente();
    assert.equal(t.api('dados.tudo', {}, t.leitor).status, 403);
    assert.equal(t.api('hoje', {}, t.sistema).status, 403);
    assert.equal(t.api('leitura', { codigo: '04AA' }, t.sistema).status, 403);
    assert.equal(t.api('status', {}, t.sistema).ok, true);
    assert.equal(t.api('status', {}, t.sistema).planilhaUrl, undefined);
    t.api('dados.substituir', { estado: estadoExemplo() }, t.sistema);
    assert.equal(t.api('dados.substituir', { estado: estadoExemplo() }, t.sistema).status, 403);
    assert.equal(t.api('dados.substituir', { estado: estadoExemplo() }, t.planej).status, 403);
    assert.equal(t.api('dados.substituir', { estado: estadoExemplo() }, t.admin).ok, true);
    assert.equal(t.api('dados.tudo', {}).status, 401);
  });

  test('valida coleção, identificador e tamanho', () => {
    const t = ambiente();
    const { geracao } = t.api('dados.substituir', { estado: estadoExemplo() }, t.admin);
    assert.match(t.api('dados.gravar', { geracao, mudancas: [{ colecao: 'senhas', id: 'a', registro: {} }] }, t.sistema).erro, /Coleção desconhecida/);
    assert.match(t.api('dados.gravar', { geracao, mudancas: [{ colecao: 'ops', id: '', registro: {} }] }, t.sistema).erro, /Identificador/);
    assert.match(t.api('dados.gravar', { geracao, mudancas: [{ colecao: 'ops', id: 'g', registro: { x: 'a'.repeat(50000) } }] }, t.sistema).erro, /grande demais/);
  });

  test('dados.* não abre nem fecha planilha do dia da presença', () => {
    const t = ambiente();
    t.api('dados.tudo', {}, t.sistema);
    assert.equal(t.planilha.getSheetByName('Turnos')._linhas().filter(l => l[0]).length, 0);
  });
});
