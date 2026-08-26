/**
 * The verifier registry.
 *
 * Verifiers are functions, never prompts. A check written as a prompt produces a
 * second unverified output and calls it a guarantee, which is the failure this
 * harness exists to avoid.
 *
 * Everything that can go wrong with running one — missing, throwing, returning a
 * shape nobody expected — becomes `nao_deu_para_conferir`. Never `passou`. This
 * is the one place where being generous with the caller would be dishonest: a
 * check that did not run is not a check that was satisfied.
 */
import { ehVeredito, naoDeuParaConferir, type Veredito } from './veredito.ts';

export type Verificador = (saida: string, pedido: string) => Veredito | Promise<Veredito>;

export interface Registro {
  /** The function behind a name, or `undefined`. Used at startup to reject an
   * agent that declares a check nobody implemented. */
  resolver(nome: string): Verificador | undefined;
  /** Run one check. Never throws, never returns `passou` for a check that did
   * not actually run. */
  conferir(nome: string, saida: string, pedido: string): Promise<Veredito>;
  nomes(): string[];
}

export function criarRegistro(mapa: Record<string, Verificador>): Registro {
  return {
    resolver: (nome) => mapa[nome],
    nomes: () => Object.keys(mapa),
    async conferir(nome, saida, pedido) {
      const f = mapa[nome];
      if (!f) {
        // Startup validation should have caught this. If it reaches here, the
        // answer is still not "passed".
        return naoDeuParaConferir(nome, `verifier "${nome}" is not registered`);
      }
      try {
        const v = await f(saida, pedido);
        if (!ehVeredito(v)) {
          return naoDeuParaConferir(
            nome,
            `verifier "${nome}" returned something that is not a verdict`,
          );
        }
        return v;
      } catch (e) {
        return naoDeuParaConferir(nome, e instanceof Error ? e.message : String(e));
      }
    },
  };
}
