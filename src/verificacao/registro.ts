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
import {
  ehVeredito,
  naoDeuParaConferir,
  type NaoDeuParaConferir,
  type Veredito,
} from './veredito.ts';

export type Verificador = (saida: string, pedido: string) => Veredito | Promise<Veredito>;

/**
 * A verifier that can say, before the model runs, whether it will be able to
 * check at all.
 *
 * `preVoo` sees only the request. A verifier that reads its criteria from the
 * request already knows the answer: if the request lists no forbidden terms, no
 * output will change that. It exists so the caller can learn that before paying
 * for an answer nobody can check.
 */
export interface VerificadorComPreVoo {
  conferir: Verificador;
  preVoo?: (pedido: string) => Veredito | Promise<Veredito>;
}

export type EntradaDeRegistro = Verificador | VerificadorComPreVoo;

const funcao = (e: EntradaDeRegistro): Verificador =>
  typeof e === 'function' ? e : e.conferir;

export interface Registro {
  /** The function behind a name, or `undefined`. Used at startup to reject an
   * agent that declares a check nobody implemented. */
  resolver(nome: string): Verificador | undefined;
  /** Run one check. Never throws, never returns `passou` for a check that did
   * not actually run. */
  conferir(nome: string, saida: string, pedido: string): Promise<Veredito>;
  /**
   * What stands in the way of this check running at all, or `undefined`.
   *
   * `undefined` is the only "go" answer, and it is deliberately not a verdict: a
   * pre-flight approves nothing, it merely fails to object. A verifier with no
   * `preVoo` always returns `undefined` — silence is not a refusal, and the
   * harness will not invent one the verifier did not make.
   */
  podeConferir(nome: string, pedido: string): Promise<NaoDeuParaConferir | undefined>;
  nomes(): string[];
}

export function criarRegistro(mapa: Record<string, EntradaDeRegistro>): Registro {
  return {
    resolver: (nome) => {
      const e = mapa[nome];
      return e === undefined ? undefined : funcao(e);
    },
    nomes: () => Object.keys(mapa),

    async podeConferir(nome, pedido) {
      const e = mapa[nome];
      if (!e) return naoDeuParaConferir(nome, `verifier "${nome}" is not registered`);
      if (typeof e === 'function' || !e.preVoo) return undefined;
      try {
        const v = await e.preVoo(pedido);
        if (!ehVeredito(v)) return undefined;
        // Only an objection travels. A pre-flight that passes has approved
        // nothing — the output it would judge does not exist yet.
        return v.estado === 'nao_deu_para_conferir' ? v : undefined;
      } catch (err) {
        return naoDeuParaConferir(nome, err instanceof Error ? err.message : String(err));
      }
    },
    async conferir(nome, saida, pedido) {
      const entrada = mapa[nome];
      const f = entrada === undefined ? undefined : funcao(entrada);
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
