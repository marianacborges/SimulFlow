// Conexão com a planilha usada pela Presença: é a mesma do resto do SimulFlow (js/core/conexao.js).
import { conexao, salvarConexao, limparConexao, validarUrl, chamar, explicarRespostaInvalida, testarConexao, modoDados, definirModoDados, acessaDados } from '../core/conexao.js';

export { conexao, salvarConexao, limparConexao, validarUrl, chamar, explicarRespostaInvalida, testarConexao, modoDados, definirModoDados, acessaDados };

export const podePlanejar = c => !!c && ['planejamento', 'admin'].includes(c.perfil);
export const ehAdminPlanilha = c => !!c && c.perfil === 'admin';

/** Link para configurar o celular de uma vez (o token vai no fragmento, que não é enviado a servidores). */
export function linkCelular(url, token) {
  const base = new URL('leitura.html', location.href);
  base.hash = new URLSearchParams({ url, token }).toString();
  return base.href;
}
