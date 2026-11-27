// Planilha de USUÁRIOS do SimulFlow (apps-script/contas/Contas.gs), separada da planilha da Presença.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from './google-falso.js';

function ambiente() {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00', arquivos: ['contas/Contas.gs'] });
  const token = (nome, perfil) => g.ctx.criarAcessoContas(nome, perfil).token;
  return { ...g, admin: token('PC Mariana', 'admin'), aparelho: token('PC Produção', 'aparelho') };
}
const conta = (login, em, extra = {}) => ({ id: 'u-' + login, login, nome: 'Nome ' + login, host: false, ativo: true, area: 'Produção', credencial: { salt: 's', hash: 'h-' + em, iteracoes: 120000 }, criadoEm: em, ...extra });

describe('planilha de usuários', () => {
  test('prepara as abas Usuários e Acessos (protegidas) e guarda o token só como hash', () => {
    const t = ambiente();
    assert.ok(t.planilha.getSheetByName('Usuários') && t.planilha.getSheetByName('Acessos'));
    assert.ok(t.planilha.getSheetByName('Usuários').getProtections().length === 1);
    const linha = t.planilha.getSheetByName('Acessos')._linhas()[0];
    assert.equal(linha[1], 'admin');
    assert.match(linha[2], /^[0-9a-f]{64}$/);
    assert.ok(!t.admin.includes(linha[2]));
  });

  test('status identifica a planilha de contas; outro aparelho lista a conta criada no primeiro', () => {
    const t = ambiente();
    const st = t.api('status', {}, t.aparelho);
    assert.equal(st.tipo, 'contas');
    assert.equal(st.perfil, 'aparelho');
    const r = t.api('contas.salvar', { usuarios: [conta('mariana', '2026-11-27T10:00:00Z', { host: true })] }, t.admin);
    assert.equal(r.ok, true, r.erro);
    const l = t.api('contas.listar', {}, t.aparelho);
    assert.equal(l.usuarios[0].login, 'mariana');
    const linha = t.planilha.getSheetByName('Usuários')._linhas()[0];
    assert.deepEqual([linha[0], linha[1], linha[2]], ['mariana', 'Nome mariana', 'u-mariana']);
    assert.ok(!JSON.stringify(linha).includes('senhaforte'));
  });

  test('vale o mais novo: troca de senha sobe; cópia antiga é ignorada; mesmo login com letras diferentes é a mesma conta', () => {
    const t = ambiente();
    t.api('contas.salvar', { usuarios: [conta('Ana', '2026-11-27T10:00:00Z')] }, t.admin);
    assert.equal(t.api('contas.salvar', { usuarios: [conta('ana', '2026-11-27T10:00:00Z', { atualizadoEm: '2026-11-27T12:00:00Z', credencial: { hash: 'nova' } })] }, t.aparelho).salvos, 1);
    assert.equal(t.api('contas.salvar', { usuarios: [conta('ana', '2026-11-27T10:00:00Z')] }, t.aparelho).ignorados, 1);
    const l = t.api('contas.listar', {}, t.admin).usuarios;
    assert.equal(l.length, 1);
    assert.equal(l[0].credencial.hash, 'nova');
  });

  test('validação: sem hash é recusado; e-mail que chegar é descartado', () => {
    const t = ambiente();
    assert.match(t.api('contas.salvar', { usuarios: [{ id: 'x', login: 'x' }] }, t.admin).erro, /sem senha em hash/);
    t.api('contas.salvar', { usuarios: [conta('b', '2026-11-27T10:00:00Z', { email: 'b@empresa.com' })] }, t.admin);
    assert.ok(!JSON.stringify(t.planilha.getSheetByName('Usuários')._linhas()).includes('@empresa.com'));
    assert.equal('email' in t.api('contas.listar', {}, t.admin).usuarios[0], false);
  });

  test('planilha da versão anterior: a coluna E-mail é apagada e o e-mail sai do JSON', () => {
    const t = ambiente();
    const aba = t.planilha.getSheetByName('Usuários');
    const cab = ['Login', 'E-mail', 'Nome', 'ID', 'Conta (JSON, senha em hash)', 'Atualizado em'];
    aba.getRange(1, 1, 1, 7).setValues([[...cab, '']]);
    const antiga = conta('ana', '2026-11-27T10:00:00Z', { email: 'ana@empresa.com' });
    aba.getRange(2, 1, 1, 6).setValues([['ana', 'ana@empresa.com', 'Nome ana', 'u-ana', JSON.stringify(antiga), '2026-11-27T10:00:00Z']]);
    const l = t.api('contas.listar', {}, t.admin).usuarios;
    assert.equal(l[0].login, 'ana');
    assert.equal('email' in l[0], false);
    assert.deepEqual(aba.getRange(1, 1, 1, 6).getValues()[0], ['Login', 'Nome', 'ID', 'Conta (JSON, senha em hash)', 'Atualizado em', 'Verificador']);
    assert.ok(!JSON.stringify(aba._linhas()).includes('@empresa.com'));
    assert.equal(t.api('contas.verificador', { login: 'ana', verificador: 'a'.repeat(64) }, t.admin).ok, true);
    assert.equal(aba._linhas()[0][5], 'a'.repeat(64));
  });

  test('acessos: só admin cria e revoga; token revogado deixa de entrar', () => {
    const t = ambiente();
    assert.equal(t.api('acessos.criar', { nome: 'X', perfil: 'aparelho' }, t.aparelho).status, 403);
    const novo = t.api('acessos.criar', { nome: 'Celular da Ana', perfil: 'aparelho' }, t.admin).acesso;
    assert.match(novo.token, /^sfc_/);
    assert.equal(t.api('contas.listar', {}, novo.token).ok, true);
    const id = t.api('acessos.listar', {}, t.admin).acessos.find(a => a.nome === 'Celular da Ana').id;
    assert.equal(t.api('acessos.revogar', { id }, t.admin).ok, true);
    assert.equal(t.api('contas.listar', {}, novo.token).status, 401);
    assert.equal(t.api('contas.listar', {}).status, 401);
  });

  test('token de leitura: lê as contas, mas não cadastra nem altera', () => {
    const t = ambiente();
    const leitura = t.ctx.criarAcessoContas('Site (embutido)', 'leitura').token;
    t.api('contas.salvar', { usuarios: [conta('ana', '2026-11-27T10:00:00Z')] }, t.admin);
    assert.equal(t.api('contas.listar', {}, leitura).usuarios.length, 1);
    assert.equal(t.api('contas.salvar', { usuarios: [conta('intruso', '2026-11-27T11:00:00Z', { host: true })] }, leitura).status, 403);
    assert.equal(t.api('contas.verificador', { login: 'ana', verificador: 'a'.repeat(64) }, leitura).status, 403);
    assert.equal(t.api('acessos.criar', { nome: 'x', perfil: 'admin' }, leitura).status, 403);
  });

  test('troca da própria senha pelo token de leitura: só com a prova da senha atual; verificador nunca é devolvido', () => {
    const t = ambiente();
    const leitura = t.ctx.criarAcessoContas('Site (embutido)', 'leitura').token;
    const v1 = 'a'.repeat(64), v2 = 'b'.repeat(64);
    t.api('contas.salvar', { usuarios: [conta('ana', '2026-11-27T10:00:00Z', { verificador: v1, trocarSenha: true })] }, t.admin);
    assert.ok(!JSON.stringify(t.api('contas.listar', {}, leitura)).includes(v1), 'verificador não sai pela API');
    const nova = { hash: 'nova', salt: 's2', iteracoes: 120000 };
    const errada = t.api('contas.senha', { login: 'ana', prova: 'c'.repeat(64), credencial: nova, verificador: v2 }, leitura);
    assert.equal(errada.status, 403);
    const r = t.api('contas.senha', { login: 'ANA', prova: v1, credencial: nova, verificador: v2, atualizadoEm: '2026-11-27T13:00:00Z' }, leitura);
    assert.equal(r.ok, true, r.erro);
    const ana = t.api('contas.listar', {}, leitura).usuarios[0];
    assert.equal(ana.credencial.hash, 'nova');
    assert.equal(ana.trocarSenha, false);
    assert.equal(t.api('contas.senha', { login: 'ana', prova: v1, credencial: nova, verificador: v2 }, leitura).status, 403, 'a prova antiga deixa de valer');
    // Conta sem verificador: precisa que o host redefina a senha.
    t.api('contas.salvar', { usuarios: [conta('bia', '2026-11-27T10:00:00Z')] }, t.admin);
    assert.match(t.api('contas.senha', { login: 'bia', prova: v1, credencial: nova, verificador: v2 }, leitura).erro, /Peça ao host/);
    assert.equal(t.api('contas.verificador', { login: 'bia', verificador: v1 }, t.admin).ok, true);
    assert.equal(t.api('contas.senha', { login: 'bia', prova: v1, credencial: nova, verificador: v2 }, leitura).ok, true);
    // Uma edição do host (sem verificador) não apaga o verificador guardado.
    t.api('contas.salvar', { usuarios: [conta('bia', '2026-11-27T10:00:00Z', { atualizadoEm: '2026-11-27T15:00:00Z' })] }, t.admin);
    assert.equal(t.planilha.getSheetByName('Usuários')._linhas().find(l => l[0] === 'bia')[5], v2);
  });
});
