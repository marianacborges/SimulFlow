// Fachada das ações: cada função recebe só os dados; store e usuário atual são injetados.
// Uso nas abas: ctx.acoes.ops.salvarOP({ ... })
import * as usuarios from './usuarios.js';
import * as obras from './obras.js';
import * as itens from './itens.js';
import * as etapas from './etapas.js';
import * as programacao from './programacao.js';
import * as ensaios from './ensaios.js';
import * as ops from './ops.js';
import * as fas from './fas.js';
import * as materiais from './materiais.js';
import * as eventos from './eventos.js';
import * as dados from './dados.js';

const MODULOS = { usuarios, obras, itens, etapas, programacao, ensaios, ops, fas, materiais, eventos, dados };

export function criarAcoes(store, usuarioAtual) {
  const fachada = {};
  for (const [nome, mod] of Object.entries(MODULOS)) {
    fachada[nome] = {};
    for (const [fn, impl] of Object.entries(mod)) {
      if (typeof impl === 'function' && fn !== 'normalizarLogin') fachada[nome][fn] = (d = {}) => impl(store, usuarioAtual(), d);
    }
  }
  return fachada;
}
