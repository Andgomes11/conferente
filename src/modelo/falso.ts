/**
 * A deterministic fake, and the default everywhere that is not production.
 *
 * Deterministic because a varying fake makes every test that touches it flaky,
 * and flaky tests teach people to ignore red. Scriptable because the disposition
 * table has to be driven from a known output.
 */
import type { EntradaDeModelo, ModeloAdapter } from './adaptador.ts';

/** Stable 32-bit hash, so the same request always yields the same answer. */
function digerir(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function criarModeloFalso(respostas: Record<string, string> = {}): ModeloAdapter {
  /**
   * Longest trigger first, so the most specific script wins.
   *
   * Taking the first match instead made the answer depend on object insertion
   * order: `{a, 'brand voice'}` and `{'brand voice', a}` answered the same
   * request differently, because "use our brand voice" contains an "a". Sorting
   * once here — not per call — keeps that out of the caller's hands entirely.
   */
  const gatilhos = Object.entries(respostas).sort(([a], [b]) => b.length - a.length);

  return {
    async responder({ instrucao, pedido }: EntradaDeModelo): Promise<string> {
      const alvo = pedido.toLowerCase();
      for (const [gatilho, resposta] of gatilhos) {
        if (alvo.includes(gatilho.toLowerCase())) return resposta;
      }
      return `[fake model ${digerir(instrucao + pedido)}] answering: ${pedido}`;
    },
  };
}
