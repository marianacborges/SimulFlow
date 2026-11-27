// "Instalar app": o Chrome/Edge oferece instalar o SimulFlow (ou a tela de leitura) como aplicativo
// quando o site tem manifesto + service worker. Guardamos o pedido para mostrar nosso próprio botão.
let pedido = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach(fn => { try { fn(!!pedido); } catch (e) { console.error(e); } });

globalThis.addEventListener?.('beforeinstallprompt', e => { e.preventDefault(); pedido = e; avisar(); });
globalThis.addEventListener?.('appinstalled', () => { pedido = null; avisar(); });

/** fn(disponivel) é chamada agora e sempre que a instalação ficar (in)disponível. */
export function aoPoderInstalar(fn) { ouvintes.add(fn); fn(!!pedido); return () => ouvintes.delete(fn); }

export async function instalarApp() {
  if (!pedido) return false;
  const p = pedido;
  pedido = null;
  avisar();
  await p.prompt();
  const { outcome } = await p.userChoice;
  return outcome === 'accepted';
}
