// Planilha de USUÁRIOS do SimulFlow (apps-script/contas/Contas.gs), separada da planilha da Presença.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { carregarAppsScript } from './google-falso.js';

function ambiente() {
  const g = carregarAppsScript({ agora: '2026-11-27T09:00:00-03:00', arquivos: ['contas/Contas.gs'] });
  const token = (nome, perfil) => g.ctx.criarAcessoContas(nome, perfil).token;
  return { ...g, admin: token('PC Mariana', 'admin'), aparelho: token('PC Produção', 'aparelho') };
}
const conta = (login, em, extra = {}) => ({ id: 'u-' + login, login, nome: 'Nome ' + login, email: login + '@empresa.com', host: false, ativo: true, area: 'Produção', credencial: { salt: 's', hash: 'h-' + em, iteracoes: 120000 }, criadoEm: em, ...extra });

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
    assert.equal(l.usuarios[0].email, 'mariana@empresa.com');
    const linha = t.planilha.getSheetByName('Usuários')._linhas()[0];
    assert.deepEqual([linha[0], linha[1], linha[2]], ['mariana', 'mariana@empresa.com', 'Nome mariana']);
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

  test('validação: sem hash ou e-mail inválido é recusado', () => {
    const t = ambiente();
    assert.match(t.api('contas.salvar', { usuarios: [{ id: 'x', login: 'x' }] }, t.admin).erro, /sem senha em hash/);
    assert.match(t.api('contas.salvar', { usuarios: [conta('b', '2026-11-27T10:00:00Z', { email: 'errado' })] }, t.admin).erro, /E-mail inválido/);
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
});
