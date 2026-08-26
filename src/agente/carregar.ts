/**
 * Reading the agents directory.
 *
 * Errors are collected rather than thrown so the caller can report all of them at
 * once — a startup that reveals one broken file per run wastes a person's
 * afternoon. But they are never dropped: a non-empty `erros` must stop the
 * process, and it is the CLI's job to make sure it does.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { interpretarAgente, type Agente } from './definicao.ts';
import type { Registro } from '../verificacao/registro.ts';

export function carregarAgentes(dir: string): { agentes: Agente[]; erros: string[] } {
  let nomes: string[];
  try {
    nomes = readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.md'))
      .sort();
  } catch (e) {
    return {
      agentes: [],
      erros: [
        `could not read the agents directory "${dir}": ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const agentes: Agente[] = [];
  const erros: string[] = [];
  const vistos = new Map<string, string>();

  for (const n of nomes) {
    const caminho = join(dir, n);
    let texto: string;
    try {
      texto = readFileSync(caminho, 'utf8');
    } catch (e) {
      erros.push(`${caminho}: could not read (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    const r = interpretarAgente(caminho, texto);
    if (!r.ok) {
      erros.push(r.erro);
      continue;
    }
    const anterior = vistos.get(r.agente.nome);
    if (anterior) {
      // Two agents with one name means the router's answer depends on which file
      // the filesystem listed first. That is not a tie the transcript can explain.
      erros.push(`duplicate agent name "${r.agente.nome}" in ${anterior} and ${caminho}`);
      continue;
    }
    vistos.set(r.agente.nome, caminho);
    agentes.push(r.agente);
  }

  return { agentes, erros };
}

/**
 * Every verifier an agent names must resolve.
 *
 * A declared check that nobody implemented is the worst state this system can be
 * in: the agent file promises verification, and nothing at runtime disagrees.
 * Catching it here is what makes `nada_conferido` rare — it cannot make it
 * impossible, because a verifier that throws at run time arrives at the same
 * place, which is why that disposition exists at all.
 */
export function validarVerificadores(agentes: readonly Agente[], registro: Registro): string[] {
  const erros: string[] = [];
  for (const a of agentes) {
    for (const nome of a.verificadores) {
      if (!registro.resolver(nome)) {
        erros.push(
          `agent "${a.nome}" (${a.arquivo}) names verifier "${nome}", which is not registered`,
        );
      }
    }
  }
  return erros;
}
