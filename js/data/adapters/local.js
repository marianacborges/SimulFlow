// Adaptador de persistência em localStorage.
// Para trocar por API ou Google Drive, crie outro adaptador com a mesma interface
// { ler(), gravar(dados), limpar(), observarExterno(callback) } e passe-o ao store.

const CHAVE = 'simulflow.dados.v1';

export function criarAdaptadorLocal(chave = CHAVE) {
  return {
    nome: 'localStorage',
    ler() {
      try {
        const bruto = localStorage.getItem(chave);
        return bruto ? JSON.parse(bruto) : null;
      } catch {
        return null;
      }
    },
    gravar(dados) {
      try {
        localStorage.setItem(chave, JSON.stringify(dados));
      } catch (e) {
        throw new Error('Não foi possível gravar no navegador (armazenamento cheio ou bloqueado).');
      }
    },
    limpar() {
      try { localStorage.removeItem(chave); } catch { /* sem acesso */ }
    },
    /** Avisa quando outra aba/janela do mesmo navegador alterar os dados. */
    observarExterno(callback) {
      const fn = e => { if (e.key === chave) callback(); };
      window.addEventListener('storage', fn);
      return () => window.removeEventListener('storage', fn);
    },
  };
}

/** Adaptador em memória (testes no node). */
export function criarAdaptadorMemoria(inicial = null) {
  let dados = inicial ? JSON.parse(JSON.stringify(inicial)) : null;
  return {
    nome: 'memória',
    ler: () => (dados ? JSON.parse(JSON.stringify(dados)) : null),
    gravar: d => { dados = JSON.parse(JSON.stringify(d)); },
    limpar: () => { dados = null; },
    observarExterno: () => () => {},
  };
}
