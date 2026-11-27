// Usuários: criação do host no primeiro acesso, cadastro pelo host, senhas.
import { exigir, exigirTexto, auditar, autorizar } from './base.js';
import { ehHost } from '../../core/permissoes.js';
import { config } from '../../core/config.js';

const NIVEIS = ['nenhum', 'ver', 'editar'];

export function normalizarLogin(l) {
  return String(l || '').trim().toLowerCase();
}

/** Primeiro acesso: só funciona quando ainda não existe nenhum usuário. */
export function criarHost(store, _u, { login, nome, credencial }) {
  return store.transacao(() => {
    exigir(store.todos('usuarios').length === 0, 'O host já foi criado');
    exigir(credencial?.hash, 'Senha obrigatória');
    const novo = store.inserir('usuarios', {
      login: normalizarLogin(exigirTexto(login, 'o usuário')), nome: exigirTexto(nome, 'o nome'),
      area: 'PCP', host: true, ativo: true, funcoes: [], permissoes: {}, obrasDashboard: [], credencial, trocarSenha: false,
    });
    auditar(store, novo, { acao: 'Host criado', entidade: 'usuario', entidadeId: novo.id, depois: { login: novo.login, nome: novo.nome } });
    return novo;
  });
}

function semCredencial(u) {
  if (!u) return null;
  const { credencial, ...resto } = u;
  return resto;
}

/** Cadastro/edição de usuário pelo host. */
export function salvarUsuario(store, u, dados) {
  autorizar(store, u, ehHost(u), 'usuário', { entidade: 'usuario', entidadeId: dados.id || null }, 'Acesso restrito ao host');
  return store.transacao(() => {
    const login = normalizarLogin(exigirTexto(dados.login, 'o usuário (login)'));
    const nome = exigirTexto(dados.nome, 'o nome');
    exigir(nome.length <= 100, 'Nome muito longo');
    exigir(config.app.areas.includes(dados.area), 'Selecione a área');
    const email = String(dados.email || '').trim().toLowerCase();
    exigir(!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email), 'E-mail inválido');
    exigir(!store.achar('usuarios', x => x.login === login && x.id !== dados.id), 'Já existe um usuário com este login');
    const funcoesValidas = config.app.funcoes.map(f => f.id);
    const funcoes = (dados.funcoes || []).filter(f => funcoesValidas.includes(f));
    const permissoes = {};
    for (const [aba, nivel] of Object.entries(dados.permissoes || {})) {
      exigir(NIVEIS.includes(nivel), 'Permissão inválida');
      exigir(config.abas.some(a => a.id === aba), 'Aba inexistente: ' + aba);
      permissoes[aba] = nivel;
    }
    const host = !!dados.host;
    const ativo = dados.ativo !== false;
    const anterior = dados.id ? store.obter('usuarios', dados.id) : null;
    if (dados.id) {
      exigir(anterior, 'Usuário inexistente');
      if (anterior.id === u.id) exigir(host && ativo, 'Não é possível remover seu próprio acesso de host nem se desativar');
    } else {
      exigir(dados.credencial?.hash, 'Defina uma senha provisória');
    }
    if (anterior?.host && (!host || !ativo)) {
      exigir(store.filtrar('usuarios', x => x.host && x.ativo && x.id !== anterior.id).length > 0, 'É preciso manter ao menos um host ativo');
    }
    const obras = (dados.obrasDashboard || []).filter(Boolean);
    const antes = anterior?.obrasDashboard || [];
    for (const id of obras) {
      if (antes.includes(id)) continue;
      const o = store.obter('obras', id);
      exigir(o && !o.arquivado, 'Novos acessos ao Dashboard exigem obra ativa');
    }
    const valores = { login, nome, email, area: dados.area, host, ativo, funcoes, permissoes, obrasDashboard: obras };
    let reg;
    if (anterior) {
      reg = store.atualizar('usuarios', anterior.id, valores);
      if (dados.credencial?.hash) store.atualizar('usuarios', anterior.id, { credencial: dados.credencial, trocarSenha: true });
    } else {
      reg = store.inserir('usuarios', { ...valores, credencial: dados.credencial, trocarSenha: true });
    }
    auditar(store, u, { acao: anterior ? 'Usuário alterado' : 'Usuário criado', entidade: 'usuario', entidadeId: reg.id, antes: semCredencial(anterior), depois: semCredencial(reg) });
    for (const id of obras.filter(x => !antes.includes(x))) auditar(store, u, { acao: 'Obra liberada no Dashboard', entidade: 'usuario', entidadeId: reg.id, obraId: id, nota: reg.nome });
    for (const id of antes.filter(x => !obras.includes(x))) auditar(store, u, { acao: 'Obra removida do Dashboard', entidade: 'usuario', entidadeId: reg.id, obraId: id, nota: reg.nome });
    return reg;
  });
}

/** Troca de senha: o próprio usuário (troca normal) ou o host (senha provisória). */
export function definirSenha(store, u, { id, credencial }) {
  const proprio = u && u.id === id;
  autorizar(store, u, proprio || ehHost(u), 'senha', { entidade: 'usuario', entidadeId: id }, 'Somente o host ou o próprio usuário podem alterar a senha');
  return store.transacao(() => {
    exigir(credencial?.hash, 'Senha obrigatória');
    const alvo = store.obter('usuarios', id);
    exigir(alvo, 'Usuário inexistente');
    store.atualizar('usuarios', id, { credencial, trocarSenha: !proprio });
    auditar(store, u, { acao: proprio ? 'Senha alterada pelo usuário' : 'Senha provisória definida pelo host', entidade: 'usuario', entidadeId: id });
  });
}
