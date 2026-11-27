// Conexão com a planilha usada pela Presença (js/core/conexao.js) e funções só da Presença.
import { conexao, salvarConexao, limparConexao, validarUrl, chamar, explicarRespostaInvalida, testarConexao } from '../core/conexao.js';

export { conexao, salvarConexao, limparConexao, validarUrl, chamar, explicarRespostaInvalida, testarConexao };

export const podePlanejar = c => !!c && ['planejamento', 'admin'].includes(c.perfil);
export const ehAdminPlanilha = c => !!c && c.perfil === 'admin';

/** Link para configurar o celular de uma vez (o token vai no fragmento, que não é enviado a servidores). */
export function linkCelular(url, token) {
  const base = new URL('leitura.html', location.href);
  base.hash = new URLSearchParams({ url, token }).toString();
  return base.href;
}
