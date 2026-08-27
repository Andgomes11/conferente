/**
 * What happened, as a value.
 *
 * A value rather than a log line because tests assert on it and the CLI renders
 * it: two consumers of one record, which is the only way the thing a person reads
 * and the thing a test checks cannot drift apart.
 */
import type { Pontuacao } from '../agente/selecao.ts';
import type { NaoDeuParaConferir, Veredito } from '../verificacao/veredito.ts';

export type Disposicao =
  | 'conferida'
  | 'parcialmente_conferida'
  /** Checks were declared and not one of them could run. */
  | 'nada_conferido'
  /** The caller required checking, none was possible, and no model was called. */
  | 'recusada_sem_conferencia'
  | 'nao_conferida'
  | 'retida'
  | 'sem_agente'
  | 'ambigua'
  | 'erro_de_modelo';

export interface Transcricao {
  pedido: string;
  /** Chosen agent, when one was. */
  agente?: string;
  /** Every agent's score — the numeric answer to "why this agent?". */
  pontuacoes: Pontuacao[];
  vereditos: Veredito[];
  /**
   * What the pre-flight objected to, before any model call.
   *
   * Empty is the ordinary case, and it means every declared check was able to
   * run — or said nothing, which the harness treats the same way.
   */
  preVoo: NaoDeuParaConferir[];
  disposicao: Disposicao;
  /** Present only when the disposition allows the output to be returned. */
  saida?: string;
  /** Why, whenever the disposition is anything other than fully checked. */
  motivo?: string;
}

const ROTULO: Record<Disposicao, string> = {
  conferida: 'CHECKED',
  parcialmente_conferida: 'PARTIALLY CHECKED',
  nada_conferido: 'NOTHING COULD BE CHECKED',
  recusada_sem_conferencia: 'REFUSED — NOTHING CAN BE CHECKED',
  nao_conferida: 'NOT CHECKED',
  retida: 'WITHHELD',
  sem_agente: 'NO AGENT CLAIMS THIS',
  ambigua: 'AMBIGUOUS',
  erro_de_modelo: 'MODEL ERROR',
};

/**
 * Renders for a person. The label always leads, before any output.
 *
 * Order is the whole point: someone who reads only the first line must not come
 * away with the wrong impression. Output printed above its own label would be
 * read first and qualified second, which is how unchecked text gets quoted as
 * checked.
 */
export function renderizar(t: Transcricao): string {
  const linhas: string[] = [`[${ROTULO[t.disposicao]}]`];
  if (t.agente) linhas.push(`agent: ${t.agente}`);
  if (t.motivo) linhas.push(`reason: ${t.motivo}`);
  for (const v of t.vereditos) {
    const detalhe = v.estado === 'passou' ? 'passed' : `${v.estado} — ${v.motivo}`;
    linhas.push(`  check ${v.verificador}: ${detalhe}`);
  }
  if (t.vereditos.length === 0 && t.disposicao === 'nao_conferida') {
    linhas.push('  no checks were declared for this agent');
  }
  for (const v of t.preVoo) {
    linhas.push(`  before running — ${v.verificador}: ${v.motivo}`);
  }
  if (t.disposicao === 'nada_conferido') {
    linhas.push(`  every one of the ${t.vereditos.length} declared checks failed to run`);
  }
  if (t.saida !== undefined) linhas.push('', t.saida);
  return linhas.join('\n');
}
