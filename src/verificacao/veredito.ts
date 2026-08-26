/**
 * The verdict of one check on one output.
 *
 * Three states, and the third is the reason this project exists: a verifier that
 * could not reach what it needed has not approved anything, and the difference
 * has to survive all the way to whoever reads the answer.
 *
 * Two states would be cheaper and would be a lie. With pass/fail alone, every
 * unreachable style guide, every timed-out lookup, every malformed input has to
 * be squeezed into one bucket or the other — and whichever bucket you pick is
 * wrong. Squeeze it into "fail" and the harness cries wolf until people stop
 * reading it. Squeeze it into "pass" and it launders unchecked output as checked,
 * which is the exact failure this whole project is built to prevent.
 */
export interface Passou {
  estado: 'passou';
  verificador: string;
}
export interface Falhou {
  estado: 'falhou';
  verificador: string;
  motivo: string;
}
export interface NaoDeuParaConferir {
  estado: 'nao_deu_para_conferir';
  verificador: string;
  motivo: string;
}

export type Veredito = Passou | Falhou | NaoDeuParaConferir;

/**
 * Each constructor returns its own variant, not the union.
 *
 * Widening the return type to `Veredito` would throw away what the constructor
 * already knows: `falhou(...).motivo` would stop compiling even though the value
 * demonstrably has one. The variant is still assignable to `Veredito` wherever
 * the union is what the caller wants, so nothing is lost by being precise here.
 */
export const passou = (verificador: string): Passou => ({ estado: 'passou', verificador });

export const falhou = (verificador: string, motivo: string): Falhou => ({
  estado: 'falhou',
  verificador,
  motivo,
});

export const naoDeuParaConferir = (verificador: string, motivo: string): NaoDeuParaConferir => ({
  estado: 'nao_deu_para_conferir',
  verificador,
  motivo,
});

/**
 * Narrow an unknown value to a Veredito.
 *
 * A verifier is other people's code. Trusting the shape of what it returns is
 * the same mistake as trusting the shape of what the model returns, and this
 * harness is not allowed to make that mistake twice.
 */
export function ehVeredito(v: unknown): v is Veredito {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.verificador !== 'string') return false;
  if (o.estado === 'passou') return true;
  return (
    (o.estado === 'falhou' || o.estado === 'nao_deu_para_conferir') && typeof o.motivo === 'string'
  );
}
