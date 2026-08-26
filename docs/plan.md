# conferente — implementation plan

> **For agentic workers:** use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** a small agent harness whose distinguishing feature is that it never
presents unchecked model output as checked.

**Architecture:** agents are files, not code. The model sits behind a
single-method adapter so tests and the demo run offline. Verifiers are registered
pure functions returning three states — passed, failed, could-not-check — and the
run loop turns those verdicts into a disposition the caller cannot misread. Every
decision, including which agent was chosen and why, lands in a transcript that is
a value rather than a log line.

**Tech stack:** Node ≥ 22.6 with `--experimental-strip-types`, `node:test`,
`node:assert/strict`. **Zero runtime dependencies.**

**Spec:** `docs/design.md` — read it before Task 1. The plan argues from it.

## Global constraints

- **Node ≥ 22.6**, `"type": "module"`, no build step. Local imports carry the
  explicit `.ts` extension.
- **Zero runtime dependencies.** No YAML library, no CLI framework, no test
  framework. If a task seems to need one, the design is wrong for this project.
- **Comments and documentation in English. Identifiers in Portuguese** — the
  metaphor *is* the vocabulary here (`conferente`, `veredito`, `conferir`), and
  splitting it across two languages would cost more than it buys. This is a
  declared decision; the README states it.
- **Every task ends with `npm test` and `npm run typecheck` green.** No task is
  done because the code was written.
- **A failure never becomes silence.** Anything that cannot be checked, parsed, or
  reached must produce a value saying so, and that value must reach the caller.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/).

---

## File structure

| file | responsibility |
|---|---|
| `src/verificacao/veredito.ts` | the three-state verdict and its constructors |
| `src/verificacao/registro.ts` | verifier registry: register, resolve, run safely |
| `src/agente/definicao.ts` | agent file → `Agente`, with loud failure |
| `src/agente/frontmatter.ts` | minimal frontmatter parser, constrained on purpose |
| `src/agente/selecao.ts` | scoring router; ambiguity is a result, not a winner |
| `src/modelo/adaptador.ts` | the one-method model interface |
| `src/modelo/falso.ts` | deterministic fake used by tests and the demo |
| `src/execucao/rodar.ts` | request → agent → model → verifiers → disposition |
| `src/transcricao/transcricao.ts` | the transcript value and its renderer |
| `src/cli/conferente.ts` | `perguntar` and `agentes` |
| `agentes/*.md` | the three example agents |
| `test/*.test.ts` | one suite per pure module, plus one end-to-end |

---

## Task 1: the verdict and the registry

The thesis lives here, so it goes first. Nothing else can be built honestly until
“could not check” is a real value.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `src/verificacao/veredito.ts`, `src/verificacao/registro.ts`
- Create: `test/verificacao.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Veredito`, `passou()`, `falhou()`, `naoDeuParaConferir()`,
  `interface Verificador = (saida: string, pedido: string) => Veredito | Promise<Veredito>`,
  `criarRegistro(mapa)` returning `{ resolver(nome): Verificador | undefined; conferir(nome, saida, pedido): Promise<Veredito>; nomes(): string[] }`.

- [x] **Step 1: project skeleton**

`package.json`:

```json
{
  "name": "conferente",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "An agent harness that never presents unchecked output as checked",
  "engines": { "node": ">=22.6" },
  "scripts": {
    "test": "node --experimental-strip-types --no-warnings --test test/*.test.ts",
    "typecheck": "tsc --noEmit",
    "conferente": "node --experimental-strip-types --no-warnings src/cli/conferente.ts"
  },
  "devDependencies": {
    "@types/node": "^22.20.1",
    "typescript": "^5.9.3"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

`.gitignore`:

```
node_modules/
*.log
.DS_Store
.env
.env.*
!.env.example
```

Then `npm install`.

- [x] **Step 2: write the failing test**

```ts
// test/verificacao.test.ts
/**
 * The verdict is the whole thesis: a verifier that cannot do its job must say so,
 * and “could not check” must be a value the caller receives rather than a detail
 * the harness swallows.
 *
 * The test that matters most is the last one. A verifier that throws must never be
 * indistinguishable from a verifier that passed — that single confusion is what
 * turns a checking harness into a harness that only looks like one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { falhou, naoDeuParaConferir, passou } from '../src/verificacao/veredito.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';

describe('veredito', () => {
  it('carries the verifier name in all three states', () => {
    assert.equal(passou('termos-proibidos').verificador, 'termos-proibidos');
    assert.equal(falhou('termos-proibidos', 'x').verificador, 'termos-proibidos');
    assert.equal(naoDeuParaConferir('termos-proibidos', 'x').verificador, 'termos-proibidos');
  });

  it('failure and could-not-check both carry a reason', () => {
    assert.equal(falhou('v', 'found a forbidden term').motivo, 'found a forbidden term');
    assert.equal(naoDeuParaConferir('v', 'no style guide supplied').motivo, 'no style guide supplied');
  });
});

describe('criarRegistro', () => {
  it('resolves a registered verifier and runs it', async () => {
    const r = criarRegistro({ sempre: () => passou('sempre') });
    const v = await r.conferir('sempre', 'output', 'request');
    assert.equal(v.estado, 'passou');
  });

  it('an unregistered name is could-not-check, never passed', async () => {
    const r = criarRegistro({});
    const v = await r.conferir('inexistente', 'output', 'request');
    assert.equal(v.estado, 'nao_deu_para_conferir');
    assert.match(v.motivo, /not registered/i);
  });

  it('awaits an async verifier', async () => {
    const r = criarRegistro({ lento: async () => falhou('lento', 'nope') });
    assert.equal((await r.conferir('lento', 'o', 'p')).estado, 'falhou');
  });

  it('a verifier that throws becomes could-not-check, never passed', async () => {
    const r = criarRegistro({
      quebra: () => {
        throw new Error('style guide unreachable');
      },
    });
    const v = await r.conferir('quebra', 'o', 'p');
    assert.equal(v.estado, 'nao_deu_para_conferir');
    assert.match(v.motivo, /style guide unreachable/);
  });

  it('a verifier that returns garbage becomes could-not-check', async () => {
    // A verifier is other people's code. Trusting its return shape is the same
    // mistake as trusting the model's.
    const r = criarRegistro({ torto: () => ({ tudo: 'bem' }) as never });
    assert.equal((await r.conferir('torto', 'o', 'p')).estado, 'nao_deu_para_conferir');
  });

  it('lists registered names, for startup validation', () => {
    assert.deepEqual(criarRegistro({ a: () => passou('a'), b: () => passou('b') }).nomes(), ['a', 'b']);
  });
});
```

- [x] **Step 3: run it and watch it fail**

Run: `npm test`
Expected: module not found for `veredito.ts`.

- [x] **Step 4: implement**

```ts
// src/verificacao/veredito.ts
/**
 * The verdict of one check on one output.
 *
 * Three states, and the third is the reason this project exists: a verifier that
 * could not reach what it needed has not approved anything, and the difference has
 * to survive all the way to whoever reads the answer.
 */
export interface Passou { estado: 'passou'; verificador: string }
export interface Falhou { estado: 'falhou'; verificador: string; motivo: string }
export interface NaoDeuParaConferir { estado: 'nao_deu_para_conferir'; verificador: string; motivo: string }

export type Veredito = Passou | Falhou | NaoDeuParaConferir;

// Each constructor returns its own variant, not the union. Widening to
// `Veredito` breaks `falhou(...).motivo` at the call site — caught by
// `npm run typecheck` on 2026-08-26, on the plan's own test in Step 2.
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

/** Narrow an unknown value to a Veredito. A verifier is other people's code. */
export function ehVeredito(v: unknown): v is Veredito {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.verificador !== 'string') return false;
  if (o.estado === 'passou') return true;
  return (
    (o.estado === 'falhou' || o.estado === 'nao_deu_para_conferir') && typeof o.motivo === 'string'
  );
}
```

```ts
// src/verificacao/registro.ts
/**
 * The verifier registry.
 *
 * Verifiers are functions, never prompts. A check written as a prompt produces a
 * second unverified output and calls it a guarantee, which is the failure this
 * harness exists to avoid.
 *
 * Everything that can go wrong with running one — missing, throwing, returning a
 * shape nobody expected — becomes `nao_deu_para_conferir`. Never `passou`. A
 * broken check must not be indistinguishable from a satisfied one.
 */
import { ehVeredito, naoDeuParaConferir, type Veredito } from './veredito.ts';

export type Verificador = (saida: string, pedido: string) => Veredito | Promise<Veredito>;

export interface Registro {
  resolver(nome: string): Verificador | undefined;
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
        return naoDeuParaConferir(nome, `verifier "${nome}" is not registered`);
      }
      try {
        const v = await f(saida, pedido);
        if (!ehVeredito(v)) {
          return naoDeuParaConferir(nome, `verifier "${nome}" returned something that is not a verdict`);
        }
        return v;
      } catch (e) {
        return naoDeuParaConferir(nome, e instanceof Error ? e.message : String(e));
      }
    },
  };
}
```

- [x] **Step 5: run it and watch it pass**

Run: `npm test` then `npm run typecheck`
Expected: all green, no output from tsc.

- [x] **Step 6: commit**

```bash
git add -A
git commit -m "feat(verificacao): three-state verdict and a registry that cannot silently pass"
```

---

**Done 2026-08-26.** 8 tests, typecheck clean.

One deviation from the plan as written, found by `npm run typecheck` rather than
by `npm test`: typing the three constructors as returning `Veredito` makes
`falhou('v', 'reason').motivo` a compile error, because the constructed value is
widened to the union at the point of construction. The variants are now named
interfaces and each constructor returns its own — `Passou`, `Falhou`,
`NaoDeuParaConferir` — which Task 5 consumes when it maps verdicts to a
disposition. The tests passed the whole time; only the typecheck saw it, which is
why both gates are in the global constraints.

---

## Task 2: the agent file

**Files:**
- Create: `src/agente/frontmatter.ts`, `src/agente/definicao.ts`
- Create: `test/agente.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface Agente { nome, proposito, reivindica: string[], verificadores: string[], instrucao, arquivo }`,
  `lerFrontmatter(texto): { campos: Record<string, string | string[]>; corpo: string } | { erro: string }`,
  `interpretarAgente(arquivo: string, texto: string): { ok: true; agente: Agente } | { ok: false; erro: string }`.

- [x] **Step 1: write the failing test**

```ts
// test/agente.test.ts
/**
 * An agent is a file so that adding one never touches the harness. The parser is a
 * deliberately small subset of frontmatter — `chave: valor` and
 * `chave: [a, b]` — and anything outside it is an error rather than a guess.
 *
 * Guessing is the failure mode here. A silently ignored field is an agent that
 * declares a check nobody runs, which is worse than an agent with no checks at all.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lerFrontmatter } from '../src/agente/frontmatter.ts';
import { interpretarAgente } from '../src/agente/definicao.ts';

const arquivo = `---
nome: voz-de-marca
proposito: Rewrites text against a supplied style guide
reivindica: [rewrite, brand voice, tone]
verificadores: [termos-proibidos, cita-clausula]
---

You rewrite the supplied text so that it matches the supplied style guide.
Cite the clause you applied.
`;

describe('lerFrontmatter', () => {
  it('reads scalars, lists and the body', () => {
    const r = lerFrontmatter(arquivo);
    assert.ok(!('erro' in r));
    assert.equal(r.campos.nome, 'voz-de-marca');
    assert.deepEqual(r.campos.reivindica, ['rewrite', 'brand voice', 'tone']);
    assert.match(r.corpo, /^You rewrite the supplied text/);
  });

  it('missing delimiters is an error, not an empty result', () => {
    const r = lerFrontmatter('no frontmatter here');
    assert.ok('erro' in r && /delimiter/i.test(r.erro));
  });

  it('a line the subset cannot express is an error, not a skip', () => {
    const r = lerFrontmatter('---\nnome: x\nninhado:\n  chave: y\n---\nbody\n');
    assert.ok('erro' in r && /line 3|nested|subset/i.test(r.erro));
  });

  it('an empty list is a list, not a string', () => {
    const r = lerFrontmatter('---\nnome: x\nreivindica: []\n---\nbody\n');
    assert.ok(!('erro' in r));
    assert.deepEqual(r.campos.reivindica, []);
  });
});

describe('interpretarAgente', () => {
  it('builds the agent', () => {
    const r = interpretarAgente('agentes/voz-de-marca.md', arquivo);
    assert.ok(r.ok);
    assert.equal(r.agente.nome, 'voz-de-marca');
    assert.deepEqual(r.agente.verificadores, ['termos-proibidos', 'cita-clausula']);
    assert.equal(r.agente.arquivo, 'agentes/voz-de-marca.md');
  });

  it('a missing required field names the file and the field', () => {
    const r = interpretarAgente('agentes/x.md', '---\nnome: x\n---\nbody\n');
    assert.ok(!r.ok);
    assert.match(r.erro, /agentes\/x\.md/);
    assert.match(r.erro, /proposito/);
  });

  it('an empty instruction body is an error', () => {
    const r = interpretarAgente(
      'agentes/x.md',
      '---\nnome: x\nproposito: p\nreivindica: [a]\nverificadores: []\n---\n\n',
    );
    assert.ok(!r.ok);
    assert.match(r.erro, /instruction|body/i);
  });

  it('no verifiers is legitimate — the disposition, not the parser, decides', () => {
    const r = interpretarAgente(
      'agentes/x.md',
      '---\nnome: x\nproposito: p\nreivindica: [a]\nverificadores: []\n---\ndo the thing\n',
    );
    assert.ok(r.ok);
    assert.deepEqual(r.agente.verificadores, []);
  });

  it('a name that is not a slug is an error', () => {
    const r = interpretarAgente(
      'agentes/x.md',
      '---\nnome: Voz De Marca!\nproposito: p\nreivindica: [a]\nverificadores: []\n---\nx\n',
    );
    assert.ok(!r.ok);
    assert.match(r.erro, /nome/);
  });
});
```

- [x] **Step 2: run it and watch it fail**

Run: `npm test -- --test-name-pattern="Frontmatter|interpretarAgente"`
Expected: module not found.

- [x] **Step 3: implement the parser**

```ts
// src/agente/frontmatter.ts
/**
 * A deliberately small frontmatter subset: `chave: valor` and `chave: [a, b]`.
 *
 * Small because the alternative is a YAML dependency for four fields, and because
 * a parser that guesses is worse than one that refuses: a silently ignored line is
 * an agent declaring a check nobody runs. Anything outside the subset is an error
 * naming the line number.
 */
export interface Frontmatter {
  campos: Record<string, string | string[]>;
  corpo: string;
}

const LINHA = /^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i;

export function lerFrontmatter(texto: string): Frontmatter | { erro: string } {
  const linhas = texto.split(/\r?\n/);
  if (linhas[0]?.trim() !== '---') {
    return { erro: 'missing opening `---` delimiter on the first line' };
  }
  const fim = linhas.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (fim === -1) return { erro: 'missing closing `---` delimiter' };

  const campos: Record<string, string | string[]> = {};
  for (let i = 1; i < fim; i++) {
    const linha = linhas[i]!;
    if (linha.trim() === '') continue;
    const m = LINHA.exec(linha);
    if (!m) {
      return {
        erro: `line ${i + 1} is outside the supported subset (\`chave: valor\` or \`chave: [a, b]\`): ${linha.trim()}`,
      };
    }
    const [, chave, bruto] = m as unknown as [string, string, string];
    const valor = bruto.trim();
    if (valor === '') {
      return { erro: `line ${i + 1}: field "${chave}" has no value; nested blocks are not supported` };
    }
    if (valor.startsWith('[') && valor.endsWith(']')) {
      const dentro = valor.slice(1, -1).trim();
      campos[chave] = dentro === '' ? [] : dentro.split(',').map((s) => s.trim()).filter((s) => s !== '');
    } else {
      campos[chave] = valor;
    }
  }

  return { campos, corpo: linhas.slice(fim + 1).join('\n').trim() };
}
```

- [x] **Step 4: implement the definition**

```ts
// src/agente/definicao.ts
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

const SLUG = /^[a-z][a-z0-9-]{0,48}$/; // `{1,48}` required two chars and broke four of this task's own fixtures

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
    return { ok: false, erro: `${arquivo}: "nome" must be a slug (lowercase, digits, hyphen): ${nome}` };
  }
  const proposito = campos.proposito;
  if (typeof proposito !== 'string') return falta('proposito');

  const reivindica = lista(campos.reivindica);
  if (reivindica === undefined) return falta('reivindica');
  if (reivindica.length === 0) {
    return { ok: false, erro: `${arquivo}: "reivindica" is empty — an agent that claims nothing is never chosen` };
  }
  const verificadores = lista(campos.verificadores);
  if (verificadores === undefined) return falta('verificadores');

  if (corpo === '') {
    return { ok: false, erro: `${arquivo}: the instruction body is empty` };
  }

  return { ok: true, agente: { nome, proposito, reivindica, verificadores, instrucao: corpo, arquivo } };
}
```

- [x] **Step 5: run and watch it pass**

Run: `npm test` then `npm run typecheck`

- [x] **Step 6: commit**

```bash
git commit -am "feat(agente): agent files, with a parser that refuses instead of guessing"
```

---

**Done 2026-08-26.** 17 tests, typecheck clean.

One deviation, and it was a contradiction inside this task rather than a coding
mistake: `SLUG = /^[a-z][a-z0-9-]{1,48}$/` requires a minimum of two characters,
while four of the fixtures in Step 1 use `nome: x`. Three tests failed at the
wrong field — complaining about `nome` where they meant to reach `proposito`, the
empty body, and the happy path. One root cause, one fix: `{0,48}`. A one-letter
agent name is a valid slug; the bound exists to keep a name printable on a CLI
list, not to impose a minimum nobody asked for.

---

## Task 3: selection

**Files:**
- Create: `src/agente/selecao.ts`
- Create: `test/selecao.test.ts`

**Interfaces:**
- Consumes: `Agente` from Task 2.
- Produces: `type Escolha = { ok: true; agente: Agente; pontuacoes: Pontuacao[] } | { ok: false; motivo: 'nenhum' | 'ambiguo'; pontuacoes: Pontuacao[]; empatados?: string[] }`,
  `interface Pontuacao { agente: string; pontos: number }`, `escolher(agentes, pedido): Escolha`.

- [x] **Step 1: write the failing test**

```ts
// test/selecao.test.ts
/**
 * Choosing an agent is pure code, never a model call: “the model decided” is not
 * an explanation, and this choice has to be explainable in the transcript.
 *
 * Two rules are load-bearing. A tie is an ambiguity rather than a winner — picking
 * one of two equally-claimed agents silently is a wrong answer with no symptom.
 * And a total of zero is “nobody claims this”, never a default agent, because a
 * default agent answers questions it was never built for.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escolher } from '../src/agente/selecao.ts';
import type { Agente } from '../src/agente/definicao.ts';

const ag = (nome: string, reivindica: string[]): Agente => ({
  nome,
  proposito: 'p',
  reivindica,
  verificadores: [],
  instrucao: 'i',
  arquivo: `agentes/${nome}.md`,
});

describe('escolher', () => {
  it('a whole-phrase match wins', () => {
    const r = escolher([ag('voz', ['brand voice']), ag('imagem', ['image brief'])], 'rewrite this in our brand voice');
    assert.ok(r.ok);
    assert.equal(r.agente.nome, 'voz');
  });

  it('a whole phrase beats scattered words', () => {
    const r = escolher(
      [ag('frase', ['image brief']), ag('palavras', ['image', 'brief', 'thing'])],
      'write an image brief',
    );
    assert.ok(r.ok);
    assert.equal(r.agente.nome, 'frase');
  });

  it('nobody claiming it is a result, not a fallback', () => {
    const r = escolher([ag('voz', ['brand voice'])], 'deploy the cluster');
    assert.ok(!r.ok);
    assert.equal(r.motivo, 'nenhum');
  });

  it('a tie is an ambiguity naming both, never a coin flip', () => {
    const r = escolher([ag('a', ['growth experiment']), ag('b', ['growth experiment'])], 'design a growth experiment');
    assert.ok(!r.ok);
    assert.equal(r.motivo, 'ambiguo');
    assert.deepEqual(r.empatados, ['a', 'b']);
  });

  it('every score is reported, so the choice can be explained', () => {
    const r = escolher([ag('voz', ['brand voice']), ag('imagem', ['image brief'])], 'our brand voice');
    assert.equal(r.pontuacoes.length, 2);
    assert.ok(r.pontuacoes.every((p) => typeof p.pontos === 'number'));
  });

  it('matching ignores case and accents', () => {
    const r = escolher([ag('voz', ['voz de marca'])], 'reescreva na VOZ DE MARCA');
    assert.ok(r.ok);
  });

  it('an empty agent list is “nobody claims this”, not a crash', () => {
    const r = escolher([], 'anything');
    assert.ok(!r.ok);
    assert.equal(r.motivo, 'nenhum');
  });
});
```

- [x] **Step 2: run and watch it fail**

Run: `npm test -- --test-name-pattern="escolher"`

- [x] **Step 3: implement**

```ts
// src/agente/selecao.ts
/**
 * Which agent claims this request.
 *
 * Deliberately dull scoring, because a clever router is an unexplainable one and
 * this choice has to be defensible in the transcript. No model is consulted:
 * “the model decided” cannot be audited.
 */
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

/** A whole phrase is worth 2; scattered words are worth 1 each, capped below it. */
function pontuar(reivindica: readonly string[], pedido: string): number {
  const alvo = normalizar(pedido);
  let total = 0;
  for (const bruta of reivindica) {
    const frase = normalizar(bruta);
    if (frase === '') continue;
    if (alvo.includes(frase)) {
      total += 2;
      continue;
    }
    const palavras = frase.split(' ');
    const soltas = palavras.filter((p) => new RegExp(`(^| )${p}( |$)`).test(alvo)).length;
    // Capped at one below a phrase match so a full phrase always wins.
    total += Math.min(soltas, Math.max(palavras.length - 1, 0));
  }
  return total;
}

export function escolher(agentes: readonly Agente[], pedido: string): Escolha {
  const pontuacoes: Pontuacao[] = agentes.map((a) => ({
    agente: a.nome,
    pontos: pontuar(a.reivindica, pedido),
  }));

  const melhor = pontuacoes.reduce((m, p) => Math.max(m, p.pontos), 0);
  if (melhor === 0) return { ok: false, motivo: 'nenhum', pontuacoes };

  const empatados = pontuacoes.filter((p) => p.pontos === melhor);
  if (empatados.length > 1) {
    return { ok: false, motivo: 'ambiguo', pontuacoes, empatados: empatados.map((p) => p.agente) };
  }

  const nome = empatados[0]!.agente;
  return { ok: true, agente: agentes.find((a) => a.nome === nome)!, pontuacoes };
}
```

- [x] **Step 4: run, typecheck, commit**

```bash
npm test && npm run typecheck
git commit -am "feat(agente): scoring router where a tie is an ambiguity, not a winner"
```

---

**Done 2026-08-26.** 26 tests, typecheck clean.

Two deviations, both in the scoring rule.

**The rule broke its own invariant.** "A full-phrase match always beats a
scattered-word match" was stated in the plan and false in the plan's code: with a
flat bonus of 2 per matched phrase, summed across claims, an agent claiming
`[image, brief, thing]` scored 4 against `[image brief]`'s 2 on the request
"write an image brief" — because a one-word claim collects the whole phrase bonus,
and summing rewards an agent for listing many claims. Fixed twice over: a phrase
hit is now worth `2 × wordCount`, and an agent scores as its **single best
claim** rather than the sum. The max is also the more explainable of the two —
"chosen because this claim matched this way" is a sentence a transcript can
carry; "chosen because four of its nine claims happened to appear" is not.

**A claim phrase went into a `RegExp` unescaped.** `c++ refactor` is an ordinary
thing to claim and becomes `/(^| )c++( |$)/` — a SyntaxError that takes down
selection for every agent. The quieter half is worse: unescaped, the dot in
`node.js` matches any character, so `nodexjs` scores as a hit and an agent that
does not claim the request answers it anyway, with no crash and no symptom.

Worth recording how the second one was nearly missed. The first two tests written
for it passed **without** the escape — `c++ refactor` is a substring of
"plan a c++ refactor", so the phrase branch returns before any regex is built,
and `a+b` is valid regex. A test that cannot fail proves nothing. Both were
replaced with inputs verified to fail against the unescaped version first.

---

## Task 4: the model boundary

**Files:**
- Create: `src/modelo/adaptador.ts`, `src/modelo/falso.ts`
- Create: `test/modelo.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `interface ModeloAdapter { responder(entrada: EntradaDeModelo): Promise<string> }`,
  `interface EntradaDeModelo { instrucao: string; pedido: string }`,
  `criarModeloFalso(respostas?: Record<string, string>): ModeloAdapter`.

- [x] **Step 1: write the failing test**

```ts
// test/modelo.test.ts
/**
 * One method, one boundary. The fake is the default in tests and in the demo, so
 * `npm test` and `npm run conferente` both work with no API key and no network —
 * which is what lets a stranger clone this and see it run.
 *
 * The fake is deterministic on purpose. A fake that varies makes every test that
 * depends on it flaky, and a flaky test teaches people to ignore red.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarModeloFalso } from '../src/modelo/falso.ts';

describe('criarModeloFalso', () => {
  it('is deterministic for the same input', async () => {
    const m = criarModeloFalso();
    const a = await m.responder({ instrucao: 'i', pedido: 'p' });
    const b = await m.responder({ instrucao: 'i', pedido: 'p' });
    assert.equal(a, b);
  });

  it('different requests give different answers', async () => {
    const m = criarModeloFalso();
    const a = await m.responder({ instrucao: 'i', pedido: 'um' });
    const b = await m.responder({ instrucao: 'i', pedido: 'dois' });
    assert.notEqual(a, b);
  });

  it('a scripted answer is returned verbatim, for driving the disposition table', async () => {
    const m = criarModeloFalso({ 'brand voice': 'clause 3 applied: we write plainly.' });
    assert.equal(await m.responder({ instrucao: 'i', pedido: 'use our brand voice' }), 'clause 3 applied: we write plainly.');
  });

  it('an empty scripted answer comes back empty, so the run loop can reject it', async () => {
    const m = criarModeloFalso({ vazio: '' });
    assert.equal(await m.responder({ instrucao: 'i', pedido: 'vazio' }), '');
  });
});
```

- [x] **Step 2: run and watch it fail**

- [x] **Step 3: implement**

```ts
// src/modelo/adaptador.ts
/**
 * The whole model boundary.
 *
 * One method, on purpose: everything this harness is about happens before and
 * after the call, and a wide interface would invite the harness to grow into a
 * gateway. A real provider is a file that implements this and nothing else.
 */
export interface EntradaDeModelo {
  /** The agent's instruction — the body of its file. */
  instrucao: string;
  /** What the caller asked for. */
  pedido: string;
}

export interface ModeloAdapter {
  responder(entrada: EntradaDeModelo): Promise<string>;
}
```

```ts
// src/modelo/falso.ts
/**
 * A deterministic fake, and the default everywhere that is not production.
 *
 * Deterministic because a varying fake makes every test that touches it flaky, and
 * flaky tests teach people to ignore red. Scriptable because the disposition table
 * has to be driven from a known output.
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
  return {
    async responder({ instrucao, pedido }: EntradaDeModelo): Promise<string> {
      for (const [gatilho, resposta] of Object.entries(respostas)) {
        if (pedido.toLowerCase().includes(gatilho.toLowerCase())) return resposta;
      }
      return `[fake model ${digerir(instrucao + pedido)}] answering: ${pedido}`;
    },
  };
}
```

- [x] **Step 4: run, typecheck, commit**

```bash
git commit -am "feat(modelo): one-method adapter and a deterministic fake"
```

---

**Done 2026-08-26.** 31 tests, typecheck clean. The plan's four tests passed
first try; one defect was found by probing beyond them.

**The fake answered by insertion order.** Taking the first matching trigger meant
`{a, 'brand voice'}` and `{'brand voice', a}` gave different answers to the same
request — "use our brand voice" contains an "a", so a one-character trigger
shadowed the specific one. Task 5 drives the whole disposition table from these
scripts, and this module's own stated rule is that a fake which varies makes
flaky tests, which teach people to ignore red. Triggers are now sorted longest
first, once at construction: most specific wins, order-independent.

One suspected defect was probed and is **not** one, so nothing was changed for
it: `digerir(instrucao + pedido)` is ambiguous about where the split falls, and
`{instrucao: 'ab', pedido: 'c'}` really does collide with
`{instrucao: 'a', pedido: 'bc'}`. But the returned string carries the request
verbatim, so the two answers differ anyway — and a collision with an equal
`pedido` would require an equal `instrucao`. Worth writing down that it was
checked rather than assumed.

---

## Task 5: the run loop and the disposition

The centre of the project. Everything before this was so that this can be honest.

**Files:**
- Create: `src/transcricao/transcricao.ts`, `src/execucao/rodar.ts`
- Create: `test/execucao.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: `type Disposicao = 'conferida' | 'parcialmente_conferida' | 'nao_conferida' | 'retida' | 'sem_agente' | 'ambigua' | 'erro_de_modelo'`,
  `interface Transcricao { pedido; agente?; pontuacoes; vereditos; disposicao; saida?; motivo? }`,
  `rodar(opcoes: { agentes; registro; modelo; pedido }): Promise<Transcricao>`.

- [x] **Step 1: write the failing test**

```ts
// test/execucao.test.ts
/**
 * The disposition table from the design document, in code.
 *
 * The row that matters is the last: an agent with no verifiers is legitimate, and
 * its output must arrive marked `nao_conferida`. Anything that lets that output
 * read as checked defeats the entire project, so it is asserted twice — on the
 * disposition and on the absence of verdicts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rodar } from '../src/execucao/rodar.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';
import { falhou, naoDeuParaConferir, passou } from '../src/verificacao/veredito.ts';
import { criarModeloFalso } from '../src/modelo/falso.ts';
import type { Agente } from '../src/agente/definicao.ts';

const ag = (verificadores: string[]): Agente => ({
  nome: 'voz',
  proposito: 'p',
  reivindica: ['brand voice'],
  verificadores,
  instrucao: 'rewrite it',
  arquivo: 'agentes/voz.md',
});

const rodarCom = (verificadores: string[], mapa = {}, pedido = 'use our brand voice') =>
  rodar({
    agentes: [ag(verificadores)],
    registro: criarRegistro(mapa),
    modelo: criarModeloFalso({ 'brand voice': 'rewritten text' }),
    pedido,
  });

describe('rodar', () => {
  it('all verifiers passed → conferida, naming the checks that ran', async () => {
    const t = await rodarCom(['a', 'b'], { a: () => passou('a'), b: () => passou('b') });
    assert.equal(t.disposicao, 'conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.deepEqual(t.vereditos.map((v) => v.verificador), ['a', 'b']);
  });

  it('any verifier failed → retida, and the output is NOT returned', async () => {
    const t = await rodarCom(['a'], { a: () => falhou('a', 'forbidden term "synergy"') });
    assert.equal(t.disposicao, 'retida');
    assert.equal(t.saida, undefined);
    assert.match(String(t.motivo), /synergy/);
  });

  it('one could not check, none failed → parcialmente_conferida, output returned', async () => {
    const t = await rodarCom(['a', 'b'], {
      a: () => passou('a'),
      b: () => naoDeuParaConferir('b', 'no style guide supplied'),
    });
    assert.equal(t.disposicao, 'parcialmente_conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.match(String(t.motivo), /no style guide supplied/);
  });

  it('no verifiers declared → nao_conferida, never conferida', async () => {
    const t = await rodarCom([]);
    assert.equal(t.disposicao, 'nao_conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.deepEqual(t.vereditos, []);
  });

  it('a failure outranks a could-not-check', async () => {
    const t = await rodarCom(['a', 'b'], {
      a: () => naoDeuParaConferir('a', 'unreachable'),
      b: () => falhou('b', 'wrong'),
    });
    assert.equal(t.disposicao, 'retida');
  });

  it('no agent claims it → sem_agente, and no model call happens', async () => {
    let chamou = false;
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: {
        async responder() {
          chamou = true;
          return 'x';
        },
      },
      pedido: 'deploy the cluster',
    });
    assert.equal(t.disposicao, 'sem_agente');
    assert.equal(chamou, false, 'a request nobody claims must not reach a model');
  });

  it('two agents claim it → ambigua, naming both', async () => {
    const t = await rodar({
      agentes: [ag([]), { ...ag([]), nome: 'outro', arquivo: 'agentes/outro.md' }],
      registro: criarRegistro({}),
      modelo: criarModeloFalso(),
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'ambigua');
    assert.match(String(t.motivo), /voz/);
    assert.match(String(t.motivo), /outro/);
  });

  it('the model throwing is erro_de_modelo with the output withheld', async () => {
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: {
        async responder() {
          throw new Error('429 from provider');
        },
      },
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'erro_de_modelo');
    assert.equal(t.saida, undefined);
    assert.match(String(t.motivo), /429/);
  });

  it('an empty model answer is a failure, not an empty success', async () => {
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: { async responder() { return '   '; } },
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'erro_de_modelo');
    assert.match(String(t.motivo), /empty/i);
  });

  it('the transcript carries every score, so the choice is explainable', async () => {
    const t = await rodarCom([]);
    assert.equal(t.pontuacoes.length, 1);
    assert.equal(t.agente, 'voz');
  });
});
```

- [x] **Step 2: run and watch it fail**

- [x] **Step 3: implement the transcript**

```ts
// src/transcricao/transcricao.ts
/**
 * What happened, as a value.
 *
 * A value rather than a log line because tests assert on it and the CLI renders
 * it: two consumers of one record, which is the only way the thing a person reads
 * and the thing a test checks cannot drift apart.
 */
import type { Pontuacao } from '../agente/selecao.ts';
import type { Veredito } from '../verificacao/veredito.ts';

export type Disposicao =
  | 'conferida'
  | 'parcialmente_conferida'
  | 'nao_conferida'
  | 'retida'
  | 'sem_agente'
  | 'ambigua'
  | 'erro_de_modelo';

export interface Transcricao {
  pedido: string;
  /** Chosen agent, when one was. */
  agente?: string;
  /** Every agent's score — the numeric answer to “why this agent?”. */
  pontuacoes: Pontuacao[];
  vereditos: Veredito[];
  disposicao: Disposicao;
  /** Present only when the disposition allows the output to be returned. */
  saida?: string;
  /** Why, whenever the disposition is anything other than fully checked. */
  motivo?: string;
}

const ROTULO: Record<Disposicao, string> = {
  conferida: 'CHECKED',
  parcialmente_conferida: 'PARTIALLY CHECKED',
  nao_conferida: 'NOT CHECKED',
  retida: 'WITHHELD',
  sem_agente: 'NO AGENT CLAIMS THIS',
  ambigua: 'AMBIGUOUS',
  erro_de_modelo: 'MODEL ERROR',
};

/** Renders for a person. The label always leads, before any output. */
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
  if (t.saida !== undefined) linhas.push('', t.saida);
  return linhas.join('\n');
}
```

- [x] **Step 4: implement the run loop**

```ts
// src/execucao/rodar.ts
/**
 * request → agent → model → verifiers → disposition.
 *
 * The disposition table is the product. Two rules in it are not defaults but
 * decisions: a single failure withholds the output entirely, and an agent with no
 * verifiers produces `nao_conferida` — never `conferida`. An agent without checks
 * is legitimate; presenting its output as checked is not.
 */
import type { Agente } from '../agente/definicao.ts';
import { escolher } from '../agente/selecao.ts';
import type { ModeloAdapter } from '../modelo/adaptador.ts';
import type { Registro } from '../verificacao/registro.ts';
import type { Veredito } from '../verificacao/veredito.ts';
import type { Transcricao } from '../transcricao/transcricao.ts';

export interface OpcoesDeRodada {
  agentes: readonly Agente[];
  registro: Registro;
  modelo: ModeloAdapter;
  pedido: string;
}

export async function rodar({ agentes, registro, modelo, pedido }: OpcoesDeRodada): Promise<Transcricao> {
  const escolha = escolher(agentes, pedido);

  if (!escolha.ok) {
    // A request nobody claims must not reach a model: a default agent answers
    // questions it was never built for, and the answer looks like any other.
    return escolha.motivo === 'nenhum'
      ? {
          pedido,
          pontuacoes: escolha.pontuacoes,
          vereditos: [],
          disposicao: 'sem_agente',
          motivo: 'no agent claims this request',
        }
      : {
          pedido,
          pontuacoes: escolha.pontuacoes,
          vereditos: [],
          disposicao: 'ambigua',
          motivo: `more than one agent claims this request: ${escolha.empatados.join(', ')}`,
        };
  }

  const agente = escolha.agente;
  const base = { pedido, agente: agente.nome, pontuacoes: escolha.pontuacoes };

  let saida: string;
  try {
    saida = await modelo.responder({ instrucao: agente.instrucao, pedido });
  } catch (e) {
    return {
      ...base,
      vereditos: [],
      disposicao: 'erro_de_modelo',
      motivo: e instanceof Error ? e.message : String(e),
    };
  }
  if (saida.trim() === '') {
    // An empty answer is a failure. Returning it as a success would be the
    // harness's own version of the defect it exists to prevent.
    return { ...base, vereditos: [], disposicao: 'erro_de_modelo', motivo: 'the model returned an empty answer' };
  }

  const vereditos: Veredito[] = [];
  for (const nome of agente.verificadores) {
    vereditos.push(await registro.conferir(nome, saida, pedido));
  }

  const falhas = vereditos.filter((v) => v.estado === 'falhou');
  if (falhas.length > 0) {
    return {
      ...base,
      vereditos,
      disposicao: 'retida',
      motivo: falhas.map((f) => `${f.verificador}: ${'motivo' in f ? f.motivo : ''}`).join(' · '),
    };
  }

  const naoDeu = vereditos.filter((v) => v.estado === 'nao_deu_para_conferir');
  if (naoDeu.length > 0) {
    return {
      ...base,
      vereditos,
      saida,
      disposicao: 'parcialmente_conferida',
      motivo: naoDeu.map((n) => `${n.verificador}: ${'motivo' in n ? n.motivo : ''}`).join(' · '),
    };
  }

  if (vereditos.length === 0) {
    return {
      ...base,
      vereditos,
      saida,
      disposicao: 'nao_conferida',
      motivo: 'this agent declares no checks',
    };
  }

  return { ...base, vereditos, saida, disposicao: 'conferida' };
}
```

- [x] **Step 5: run, typecheck, commit**

```bash
npm test && npm run typecheck
git commit -am "feat(execucao): the disposition table, where an unchecked answer says so"
```

---

**Done 2026-08-26.** 43 tests, typecheck clean. The plan's eleven tests passed
first try; the disposition table then turned out to be missing a row.

**`parcialmente_conferida` claimed checking that never happened.** An agent
declaring two verifiers, neither registered, produced `[PARTIALLY CHECKED]`
printed directly above its output — with zero of two checks actually run. The
design document's row read "none failed, some could not check", and "some"
quietly assumed at least one had passed. "Partially" asserts that some checking
happened, so this was the harness telling the caller a comforting thing that was
not true: the exact failure the whole project exists to prevent, sitting in its
centre.

Added `nada_conferido` / `NOTHING COULD BE CHECKED`, and updated the table in
`docs/design.md` — the spec is the source, so the row belongs there too. It stays
distinct from `nao_conferida` because the two call for different actions:
declaring no checks is a legitimate choice, while declaring checks nobody
implemented is a broken setup someone has to fix. Same amount of verification —
zero — and conflating them hides the second.

Both return the output. Withholding stays reserved for an actual failure, never
for an absence of information; the harness makes missing verification visible
rather than punishing the caller for it.

Task 6 must account for the new state: `carregarAgentes` rejecting an unregistered
verifier name at startup is what makes `nada_conferido` rare in practice, but it
cannot make it impossible — a verifier that throws at run time reaches the same
place.

---

## Task 6: loading agents and the built-in verifiers

**Files:**
- Create: `src/agente/carregar.ts`, `src/verificacao/embutidos.ts`
- Create: `test/carregar.test.ts`
- Create: `agentes/voz-de-marca.md`, `agentes/brief-de-imagem.md`, `agentes/experimento-de-growth.md`

**Interfaces:**
- Consumes: `interpretarAgente` (Task 2), `Verificador` (Task 1).
- Produces: `carregarAgentes(dir: string): { agentes: Agente[]; erros: string[] }`,
  `validarVerificadores(agentes, registro): string[]`,
  `VERIFICADORES_EMBUTIDOS: Record<string, Verificador>`.

- [ ] **Step 1: write the failing test**

```ts
// test/carregar.test.ts
/**
 * Startup has to fail loudly. An agent file that did not parse, or a verifier
 * named by an agent and implemented by nobody, is worse than a missing agent: it
 * is a declared check that never runs, and nothing downstream can tell.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { carregarAgentes, validarVerificadores } from '../src/agente/carregar.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';
import { passou } from '../src/verificacao/veredito.ts';
import { VERIFICADORES_EMBUTIDOS } from '../src/verificacao/embutidos.ts';

const pasta = (arquivos: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), 'conferente-'));
  for (const [nome, conteudo] of Object.entries(arquivos)) writeFileSync(join(d, nome), conteudo);
  return d;
};

const bom = `---
nome: voz
proposito: p
reivindica: [brand voice]
verificadores: [termos-proibidos]
---
rewrite it
`;

describe('carregarAgentes', () => {
  it('loads the valid files', () => {
    const r = carregarAgentes(pasta({ 'voz.md': bom }));
    assert.equal(r.agentes.length, 1);
    assert.deepEqual(r.erros, []);
  });

  it('a malformed file is an error naming the file, and does not stop the others', () => {
    const r = carregarAgentes(pasta({ 'voz.md': bom, 'ruim.md': 'not an agent' }));
    assert.equal(r.agentes.length, 1);
    assert.equal(r.erros.length, 1);
    assert.match(r.erros[0]!, /ruim\.md/);
  });

  it('a missing directory is an error, not an empty list', () => {
    const r = carregarAgentes('/definitely/not/here');
    assert.deepEqual(r.agentes, []);
    assert.equal(r.erros.length, 1);
  });

  it('two agents with the same name is an error', () => {
    const r = carregarAgentes(pasta({ 'a.md': bom, 'b.md': bom }));
    assert.ok(r.erros.some((e) => /duplicate|same name/i.test(e)));
  });

  it('ignores files that are not .md', () => {
    const r = carregarAgentes(pasta({ 'voz.md': bom, 'notes.txt': 'hello' }));
    assert.equal(r.agentes.length, 1);
    assert.deepEqual(r.erros, []);
  });
});

describe('validarVerificadores', () => {
  it('a verifier named by an agent and registered by nobody is an error', () => {
    const { agentes } = carregarAgentes(pasta({ 'voz.md': bom }));
    const erros = validarVerificadores(agentes, criarRegistro({}));
    assert.equal(erros.length, 1);
    assert.match(erros[0]!, /termos-proibidos/);
    assert.match(erros[0]!, /voz/);
  });

  it('no error when every name resolves', () => {
    const { agentes } = carregarAgentes(pasta({ 'voz.md': bom }));
    assert.deepEqual(validarVerificadores(agentes, criarRegistro({ 'termos-proibidos': () => passou('x') })), []);
  });
});

describe('VERIFICADORES_EMBUTIDOS', () => {
  it('termos-proibidos fails on a forbidden term supplied in the request', async () => {
    const v = VERIFICADORES_EMBUTIDOS['termos-proibidos']!;
    const r = await v('we found great synergy', 'rewrite this. forbidden: synergy, leverage');
    assert.equal(r.estado, 'falhou');
    assert.match(r.estado === 'falhou' ? r.motivo : '', /synergy/);
  });

  it('termos-proibidos cannot check when the request lists no terms', async () => {
    const v = VERIFICADORES_EMBUTIDOS['termos-proibidos']!;
    const r = await v('anything', 'rewrite this');
    assert.equal(r.estado, 'nao_deu_para_conferir');
  });

  it('campos-obrigatorios fails when a required field is absent', async () => {
    const v = VERIFICADORES_EMBUTIDOS['campos-obrigatorios']!;
    const r = await v('subject: a cat\n', 'brief. required: subject, aspect, mood');
    assert.equal(r.estado, 'falhou');
    assert.match(r.estado === 'falhou' ? r.motivo : '', /aspect|mood/);
  });

  it('metrica-unica fails when two metrics are proposed', async () => {
    const v = VERIFICADORES_EMBUTIDOS['metrica-unica']!;
    const r = await v('metric: signups\nmetric: revenue\n', 'design an experiment');
    assert.equal(r.estado, 'falhou');
  });
});
```

- [ ] **Step 2: run and watch it fail**

- [ ] **Step 3: implement loading**

```ts
// src/agente/carregar.ts
/**
 * Reading the agents directory.
 *
 * Errors are collected rather than thrown so the caller can report all of them at
 * once — a startup that reveals one broken file per run wastes a person's
 * afternoon. But they are never dropped: `erros` non-empty must stop the process.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { interpretarAgente, type Agente } from './definicao.ts';
import type { Registro } from '../verificacao/registro.ts';

export function carregarAgentes(dir: string): { agentes: Agente[]; erros: string[] } {
  let nomes: string[];
  try {
    nomes = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.md')).sort();
  } catch (e) {
    return { agentes: [], erros: [`could not read the agents directory "${dir}": ${e instanceof Error ? e.message : String(e)}`] };
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
 */
export function validarVerificadores(agentes: readonly Agente[], registro: Registro): string[] {
  const erros: string[] = [];
  for (const a of agentes) {
    for (const nome of a.verificadores) {
      if (!registro.resolver(nome)) {
        erros.push(`agent "${a.nome}" (${a.arquivo}) names verifier "${nome}", which is not registered`);
      }
    }
  }
  return erros;
}
```

- [ ] **Step 4: implement the built-in verifiers**

Each one takes its criteria from the request, never from a hard-coded list, so the
harness carries no organisation's content.

```ts
// src/verificacao/embutidos.ts
/**
 * The verifiers the example agents use.
 *
 * Each reads its criteria from the request — forbidden terms, required fields —
 * rather than from a list baked into the code. That keeps any organisation's
 * vocabulary out of this repository, and it is why every one of them has a real
 * `nao_deu_para_conferir` path: no criteria in the request means nothing to check
 * against, and that is not a pass.
 */
import { falhou, naoDeuParaConferir, passou, type Veredito } from './veredito.ts';
import type { Verificador } from './registro.ts';

/** Reads `chave: a, b, c` out of the request. */
function listaDoPedido(pedido: string, chave: string): string[] | undefined {
  const m = new RegExp(`${chave}\\s*:\\s*([^\\n]+)`, 'i').exec(pedido);
  if (!m?.[1]) return undefined;
  const itens = m[1].split(',').map((s) => s.trim().toLowerCase()).filter((s) => s !== '');
  return itens.length > 0 ? itens : undefined;
}

const termosProibidos: Verificador = (saida, pedido): Veredito => {
  const termos = listaDoPedido(pedido, 'forbidden');
  if (!termos) return naoDeuParaConferir('termos-proibidos', 'the request lists no forbidden terms');
  const achados = termos.filter((t) => saida.toLowerCase().includes(t));
  return achados.length === 0
    ? passou('termos-proibidos')
    : falhou('termos-proibidos', `output contains forbidden term(s): ${achados.join(', ')}`);
};

const camposObrigatorios: Verificador = (saida, pedido): Veredito => {
  const campos = listaDoPedido(pedido, 'required');
  if (!campos) return naoDeuParaConferir('campos-obrigatorios', 'the request lists no required fields');
  const faltando = campos.filter((c) => !new RegExp(`^\\s*${c}\\s*:`, 'im').test(saida));
  return faltando.length === 0
    ? passou('campos-obrigatorios')
    : falhou('campos-obrigatorios', `missing field(s): ${faltando.join(', ')}`);
};

const metricaUnica: Verificador = (saida): Veredito => {
  const n = (saida.match(/^\s*metric\s*:/gim) ?? []).length;
  if (n === 0) return falhou('metrica-unica', 'no `metric:` line found');
  return n === 1 ? passou('metrica-unica') : falhou('metrica-unica', `${n} metrics proposed; an experiment needs one`);
};

const citaClausula: Verificador = (saida): Veredito =>
  /clause\s+\S+/i.test(saida)
    ? passou('cita-clausula')
    : falhou('cita-clausula', 'output does not cite the guide clause it applied');

export const VERIFICADORES_EMBUTIDOS: Record<string, Verificador> = {
  'termos-proibidos': termosProibidos,
  'campos-obrigatorios': camposObrigatorios,
  'metrica-unica': metricaUnica,
  'cita-clausula': citaClausula,
};
```

- [ ] **Step 5: write the three agent files**

`agentes/voz-de-marca.md`:

```markdown
---
nome: voz-de-marca
proposito: Rewrites text to match a style guide supplied with the request
reivindica: [brand voice, rewrite, tone of voice]
verificadores: [termos-proibidos, cita-clausula]
---

Rewrite the text supplied in the request so that it matches the style guide, also
supplied in the request. Change wording, not meaning.

State the clause you applied as `clause <id>` so the choice can be checked. If the
request contains no style guide, say so and rewrite nothing.
```

`agentes/brief-de-imagem.md`:

```markdown
---
nome: brief-de-imagem
proposito: Turns a request into a structured image brief
reivindica: [image brief, illustration, visual]
verificadores: [campos-obrigatorios]
---

Produce an image brief as `field: value` lines, one per line, using exactly the
fields the request lists as required.

Never name a real, identifiable person as the subject. If the request asks for
one, say so instead of producing the brief.
```

`agentes/experimento-de-growth.md`:

```markdown
---
nome: experimento-de-growth
proposito: Proposes one growth experiment with a single metric
reivindica: [growth experiment, ab test, experiment]
verificadores: [metrica-unica]
---

Propose exactly one experiment, as `field: value` lines including a single
`metric:` line, a `sample:` line, and a `falsified by:` line stating what result
would show the idea is wrong.

One metric. If the request implies two, choose the one that decides the question
and say why you dropped the other.
```

- [ ] **Step 6: run, typecheck, commit**

```bash
npm test && npm run typecheck
git commit -am "feat(agente): loading with loud startup failure, plus example agents and verifiers"
```

---

## Task 7: the CLI

**Files:**
- Create: `src/cli/conferente.ts`
- Create: `test/ponta-a-ponta.test.ts`

**Interfaces:**
- Consumes: everything.
- Produces: `npm run conferente -- agentes` and `npm run conferente -- perguntar "<request>"`.

- [ ] **Step 1: write the end-to-end test**

```ts
// test/ponta-a-ponta.test.ts
/**
 * One run through the real pieces, with the fake model — the only test here that
 * would catch a wiring mistake between modules that are each individually correct.
 *
 * It asserts the rendered text, not just the disposition, because the label is the
 * product: a person reading the output has to see “NOT CHECKED” before they see
 * the answer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarAgentes, validarVerificadores } from '../src/agente/carregar.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';
import { VERIFICADORES_EMBUTIDOS } from '../src/verificacao/embutidos.ts';
import { criarModeloFalso } from '../src/modelo/falso.ts';
import { rodar } from '../src/execucao/rodar.ts';
import { renderizar } from '../src/transcricao/transcricao.ts';

const montar = () => {
  const { agentes, erros } = carregarAgentes('agentes');
  assert.deepEqual(erros, [], 'the shipped agent files must load cleanly');
  const registro = criarRegistro(VERIFICADORES_EMBUTIDOS);
  assert.deepEqual(validarVerificadores(agentes, registro), [], 'every declared verifier must resolve');
  return { agentes, registro };
};

describe('ponta a ponta', () => {
  it('the shipped agents load and every verifier they name resolves', () => {
    montar();
  });

  it('a checked answer leads with CHECKED', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4 applied: we write plainly.' }),
      pedido: 'rewrite this in our brand voice. forbidden: synergy, leverage',
    });
    assert.equal(t.disposicao, 'conferida');
    assert.match(renderizar(t), /^\[CHECKED\]/);
  });

  it('a forbidden term withholds the output', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4: great synergy ahead.' }),
      pedido: 'rewrite this in our brand voice. forbidden: synergy',
    });
    assert.equal(t.disposicao, 'retida');
    const texto = renderizar(t);
    assert.match(texto, /^\[WITHHELD\]/);
    assert.ok(!texto.includes('synergy ahead'), 'withheld output must not be printed');
  });

  it('no criteria in the request yields PARTIALLY CHECKED, not CHECKED', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4 applied: plain words.' }),
      pedido: 'rewrite this in our brand voice',
    });
    assert.equal(t.disposicao, 'parcialmente_conferida');
    assert.match(renderizar(t), /PARTIALLY CHECKED/);
    assert.match(renderizar(t), /no forbidden terms/i);
  });

  it('an unclaimed request never reaches the model', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({ agentes, registro, modelo: criarModeloFalso(), pedido: 'restart the database' });
    assert.equal(t.disposicao, 'sem_agente');
    assert.match(renderizar(t), /NO AGENT CLAIMS THIS/);
  });
});
```

- [ ] **Step 2: run and watch it fail**

- [ ] **Step 3: implement the CLI**

```ts
// src/cli/conferente.ts
/**
 * conferente — an agent harness that never presents unchecked output as checked.
 *
 *   npm run conferente -- agentes
 *   npm run conferente -- perguntar "rewrite this in our brand voice. forbidden: synergy"
 *
 * Uses the fake model unless `--modelo real` is passed, so the command works with
 * no API key. A demo that needs a secret to run is a demo nobody runs.
 */
import { carregarAgentes, validarVerificadores } from '../agente/carregar.ts';
import { criarRegistro } from '../verificacao/registro.ts';
import { VERIFICADORES_EMBUTIDOS } from '../verificacao/embutidos.ts';
import { criarModeloFalso } from '../modelo/falso.ts';
import { rodar } from '../execucao/rodar.ts';
import { renderizar } from '../transcricao/transcricao.ts';

const args = process.argv.slice(2);
const comando = args[0];
const opcao = (n: string): string | undefined => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DIR = opcao('agentes') ?? 'agentes';

const { agentes, erros } = carregarAgentes(DIR);
const registro = criarRegistro(VERIFICADORES_EMBUTIDOS);
const errosDeVerificador = validarVerificadores(agentes, registro);

// Startup failures stop the process. A harness that runs with a broken agent file
// is a harness that silently skipped a declared check.
if (erros.length > 0 || errosDeVerificador.length > 0) {
  console.error('\n  conferente cannot start:\n');
  for (const e of [...erros, ...errosDeVerificador]) console.error(`   · ${e}`);
  console.error('');
  process.exit(1);
}

if (comando === 'agentes') {
  console.log(`\n  ${agentes.length} agent(s) in ${DIR}\n`);
  for (const a of agentes) {
    console.log(`  ${a.nome}`);
    console.log(`    ${a.proposito}`);
    console.log(`    claims:  ${a.reivindica.join(', ')}`);
    console.log(
      `    checks:  ${a.verificadores.length > 0 ? a.verificadores.join(', ') : 'none — its output is reported as NOT CHECKED'}`,
    );
    console.log('');
  }
  process.exit(0);
}

if (comando === 'perguntar') {
  const pedido = args.slice(1).filter((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--agentes').join(' ').trim();
  if (!pedido) {
    console.error('usage: npm run conferente -- perguntar "<request>"');
    process.exit(1);
  }
  const t = await rodar({ agentes, registro, modelo: criarModeloFalso(), pedido });
  console.log(`\n${renderizar(t)}\n`);
  process.exit(t.disposicao === 'retida' || t.disposicao === 'erro_de_modelo' ? 1 : 0);
}

console.error('usage: npm run conferente -- [agentes | perguntar "<request>"]');
process.exit(1);
```

- [ ] **Step 4: verify by hand**

```bash
npm run conferente -- agentes
npm run conferente -- perguntar "rewrite this in our brand voice. forbidden: synergy"
npm run conferente -- perguntar "rewrite this in our brand voice"
npm run conferente -- perguntar "restart the database"
```

Expected, in order: three agents listed, the third showing its checks; a
`[CHECKED]` or `[WITHHELD]` run; a `[PARTIALLY CHECKED]` run naming what could not
be checked; and `[NO AGENT CLAIMS THIS]`.

Then break an agent file on purpose — rename a verifier to `nao-existe` — and
confirm the process refuses to start and names both the agent and the verifier.

- [ ] **Step 5: run, typecheck, commit**

```bash
npm test && npm run typecheck
git commit -am "feat(cli): perguntar and agentes, with startup that refuses to run broken"
```

---

## Task 8: docs, licence, CI

**Files:**
- Create: `README.md`, `LICENSE.md`, `SECURITY.md`, `.github/workflows/ci.yml`, `.env.example`

- [ ] **Step 1: CI**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22.6'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      # The suite runs against the fake model: no network, no API key.
      - run: npm test
```

- [ ] **Step 2: README**

Structure, in English, following the sibling project:

1. One-line value proposition, then the thesis in two sentences: *verification is
   code, never a model call*, and the three states.
2. Badges: ci, licence, node.
3. Quick start — `npm install && npm test && npm run conferente -- perguntar "…"`,
   with the point that no API key is needed.
4. **The disposition table**, verbatim from the design document. It is the clearest
   thing in the project and belongs above the architecture.
5. Terminal output of the four hand-verification runs from Task 7, pasted. Showing
   `[PARTIALLY CHECKED] … reason: the request lists no forbidden terms` is worth
   more than any diagram.
6. How to add an agent — one file, no code.
7. How to plug a real model — one file implementing one method.
8. Architecture, and the four boundaries.
9. A short section on the language decision: comments and docs in English,
   identifiers in Portuguese because the metaphor is the vocabulary.
10. Licence.

- [ ] **Step 3: licence**

FSL-1.1-ALv2, same as the sibling project, fetched from the canonical source
rather than written from memory:

```bash
curl -sSL https://raw.githubusercontent.com/getsentry/fsl.software/main/FSL-1.1-ALv2.template.md \
  | sed 's/\${year}/2026/g; s/\${licensor name}/Anderson Gomes/g' > LICENSE.md
grep -c '\${' LICENSE.md   # must be 0
```

- [ ] **Step 4: publish**

```bash
git add -A && git commit -m "docs: readme, licence, security policy and CI"
gh repo create conferente --private --source=. --remote=origin \
  --description "An agent harness that never presents unchecked model output as checked"
git push -u origin main
```

Private first, as with the sibling project: read the README before it is public.

---

## Self-review of this plan

**Spec coverage.** Every section of `docs/design.md` has a task: the thesis and the
three states (1), agent files (2), selection with its scoring rules (3), the model
boundary and fake (4), the disposition table and transcript (5), the failure-state
table (spread across 1, 2, 5 and 6, each with a test), example agents (6), the CLI
and end-to-end (7), and docs, licence, CI (8).

**One gap I am accepting deliberately.** The design mentions a real model adapter;
no task implements one, because it cannot be tested offline and would put an API
key in the critical path of a first-run experience. The README documents the
interface and says a real provider is a file implementing one method. Whoever
wants it writes ten lines.

**Type consistency.** `Veredito` (1) is consumed by 5, 6 and 7 unchanged.
`Agente` (2) is consumed by 3, 5, 6, 7. `Pontuacao` and `Escolha` (3) are consumed
by 5. `ModeloAdapter` (4) is consumed by 5 and 7. `Transcricao` (5) is consumed by
7. `Registro` (1) is consumed by 5, 6 and 7. No name appears in two shapes.

**One risk worth naming.** The CLI's argument parsing for `perguntar` (Task 7,
step 3) is the fiddliest code in the plan and the least covered by tests, because
it is a CLI. If it fights back, the fix is to move argument parsing into a pure
function with its own test rather than to keep patching it in place — the same
move that pulled grouping out of the sibling project's CLI after a defect hid
there for a full round.
