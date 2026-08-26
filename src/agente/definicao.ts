/**
 * An agent file becomes an `Agente`, or an error naming the file and the field.
 *
 * Adding an agent must never require touching the harness. The corollary is that
 * a malformed agent has to fail loudly at startup — the harness cannot ask a
 * person to notice that one of twelve files was skipped.
 */
import { lerFrontmatter } from './frontmatter.ts';

export interface Agente {
  nome: string;
  proposito: string;
  /** Claim phrases the router scores against the request. */
  reivindica: string[];
  /** Names resolved in the verifier registry. Empty is legitimate. */
  verificadores: string[];
  /** The body of the file: what the agent is told. */
  instrucao: string;
  arquivo: string;
}

export type Interpretacao = { ok: true; agente: Agente } | { ok: false; erro: string };

/**
 * A slug: lowercase, digits, hyphen. One character is allowed — the length bound
 * exists to keep a name printable on a CLI list, not to impose a minimum nobody
 * asked for. (The plan wrote `{1,48}`, which silently required two characters and
 * broke three of its own test fixtures.)
 */
const SLUG = /^[a-z][a-z0-9-]{0,48}$/;

/** A single-item list may be written without brackets; both reach the harness
 * as a list, because the router only ever iterates. */
const lista = (v: string | string[] | undefined): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v : [v];

export function interpretarAgente(arquivo: string, texto: string): Interpretacao {
  const lido = lerFrontmatter(texto);
  if ('erro' in lido) return { ok: false, erro: `${arquivo}: ${lido.erro}` };

  const { campos, corpo } = lido;
  const falta = (campo: string): Interpretacao => ({
    ok: false,
    erro: `${arquivo}: missing required field "${campo}"`,
  });

  const nome = campos.nome;
  if (typeof nome !== 'string') return falta('nome');
  if (!SLUG.test(nome)) {
    return {
      ok: false,
      erro: `${arquivo}: "nome" must be a slug (lowercase, digits, hyphen): ${nome}`,
    };
  }
  const proposito = campos.proposito;
  if (typeof proposito !== 'string') return falta('proposito');

  const reivindica = lista(campos.reivindica);
  if (reivindica === undefined) return falta('reivindica');
  if (reivindica.length === 0) {
    return {
      ok: false,
      erro: `${arquivo}: "reivindica" is empty — an agent that claims nothing is never chosen`,
    };
  }
  // `verificadores: []` is legitimate and must stay legitimate. An agent with no
  // checks is a real thing; presenting its output as checked is what is not. The
  // disposition table decides that, not the parser.
  const verificadores = lista(campos.verificadores);
  if (verificadores === undefined) return falta('verificadores');

  if (corpo === '') {
    return { ok: false, erro: `${arquivo}: the instruction body is empty` };
  }

  return {
    ok: true,
    agente: { nome, proposito, reivindica, verificadores, instrucao: corpo, arquivo },
  };
}
