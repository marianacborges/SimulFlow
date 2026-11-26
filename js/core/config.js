// Carrega config/app.json, config/abas.json e config/campos.json.
// Quando o sistema é empacotado em um único HTML (tools/simulflow.js empacotar),
// as configurações já vêm embutidas em window.__SIMULFLOW_CONFIG__.

export const config = { app: {}, abas: [], campos: {} };

async function lerJSON(caminho) {
  const r = await fetch(caminho, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Não foi possível ler ${caminho}`);
  return r.json();
}

export async function carregarConfig() {
  const embutida = globalThis.__SIMULFLOW_CONFIG__;
  if (embutida) {
    Object.assign(config, embutida);
  } else {
    const [app, abas, campos] = await Promise.all([lerJSON('config/app.json'), lerJSON('config/abas.json'), lerJSON('config/campos.json')]);
    Object.assign(config, { app, abas, campos });
  }
  config.abas = [...config.abas].sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  return config;
}

/** Usado pelos testes no node. */
export function definirConfig(parcial) {
  Object.assign(config, parcial);
}

export function aba(id) {
  return config.abas.find(a => a.id === id);
}

/** Campos extras cadastrados para uma entidade (comando `campo`). */
export function camposExtras(entidade) {
  return config.campos?.[entidade] || [];
}
