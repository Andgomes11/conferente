/**
 * Which agent claims this request.
 *
 * Deliberately dull scoring, because a clever router is an unexplainable one and
 * this choice has to be defensible in the transcript. No model is consulted:
 * "the model decided" cannot be audited.
 */
import { escaparRegex } from '../texto/regex.ts';
import type { Agente } from './definicao.ts';

export interface Pontuacao {
  agente: string;
  pontos: number;
}

export type Escolha =
  | { ok: true; agente: Agente; pontuacoes: Pontuacao[] }
  | { ok: false; motivo: 'nenhum'; pontuacoes: Pontuacao[] }
  | { ok: false; motivo: 'ambiguo'; pontuacoes: Pontuacao[]; empatados: string[] };

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * How strongly one claim phrase matches, in words.
 *
 * A whole-phrase hit is worth twice its length; scattered words are worth one
 * each, capped one below a full hit of the same phrase. Weighting by length is
 * what makes "a full phrase always beats scattered words" actually true — with a
 * flat bonus of 2, a single-word claim collected the full phrase bonus, so three
 * one-word claims outscored a genuine two-word phrase match.
 */
function valorDaReivindicacao(bruta: string, alvo: string): number {
  const frase = normalizar(bruta);
  if (frase === '') return 0;
  const palavras = frase.split(' ');
  if (alvo.includes(frase)) return 2 * palavras.length;
  const soltas = palavras.filter((p) => new RegExp(`(^| )${escaparRegex(p)}( |$)`).test(alvo)).length;
  return Math.min(soltas, Math.max(palavras.length - 1, 0));
}

/**
 * An agent scores as its single best claim, not as the sum of all of them.
 *
 * Summing rewards an agent for listing many claim phrases, which is both gameable
 * and unexplainable — "chosen because four of its nine claims happened to appear"
 * is not a sentence anyone can audit. The max gives the transcript a single
 * sentence: chosen because this claim matched this way.
 */
function pontuar(reivindica: readonly string[], pedido: string): number {
  const alvo = normalizar(pedido);
  return reivindica.reduce((m, bruta) => Math.max(m, valorDaReivindicacao(bruta, alvo)), 0);
}

export function escolher(agentes: readonly Agente[], pedido: string): Escolha {
  const pontuacoes: Pontuacao[] = agentes.map((a) => ({
    agente: a.nome,
    pontos: pontuar(a.reivindica, pedido),
  }));

  const melhor = pontuacoes.reduce((m, p) => Math.max(m, p.pontos), 0);
  // Zero is "nobody claims this", never a default agent: a default agent answers
  // questions it was never built for, and nothing in the output would say so.
  if (melhor === 0) return { ok: false, motivo: 'nenhum', pontuacoes };

  const empatados = pontuacoes.filter((p) => p.pontos === melhor);
  if (empatados.length > 1) {
    return { ok: false, motivo: 'ambiguo', pontuacoes, empatados: empatados.map((p) => p.agente) };
  }

  const nome = empatados[0]!.agente;
  return { ok: true, agente: agentes.find((a) => a.nome === nome)!, pontuacoes };
}
