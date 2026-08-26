# conferente

**An agent harness that never presents unchecked model output as checked.**

[![ci](https://github.com/Andgomes11/conferente/actions/workflows/ci.yml/badge.svg)](https://github.com/Andgomes11/conferente/actions/workflows/ci.yml)
[![licence: FSL-1.1-ALv2](https://img.shields.io/badge/licence-FSL--1.1--ALv2-blue.svg)](LICENSE.md)
[![node](https://img.shields.io/badge/node-%E2%89%A522.6-brightgreen.svg)](package.json)

A *conferente* is a real occupation: the person on a dock who checks cargo against
the manifest before signing for it. They do not move the cargo and they do not
decide what ships. Their whole job is to refuse to sign for what they could not
check.

## The thesis

**Verification is code, never a model call.** If the check on an agent's output is
itself a prompt, nothing was verified — a second unverified output was produced
and labelled a guarantee. So a verifier here is a registered function returning
one of three states: passed, failed, or **could not check**.

That third state is the point. A verifier that cannot reach the data it needs must
say so, and that statement has to survive all the way to whoever reads the answer.
An answer that could not be checked is not an answer that passed.

Every harness solves the first half — route a request, call a model, return text.
This one exists for the second half.

## Quick start

No API key. No network. The model that ships is a deterministic fake, because a
demo that needs a secret is a demo nobody runs.

```bash
npm install
npm test          # 72 tests
npm run typecheck

npm run conferente -- agentes
npm run conferente -- perguntar "rewrite this in our brand voice. forbidden: synergy" \
  --resposta "clause 4 applied: we write plainly."
```

`--resposta` supplies the answer and runs the checks on it. It exists because the
checking machinery is the product: without it the demo cannot show the machinery
working, since the unscripted fake never cites a clause and so every run ends
WITHHELD.

## The disposition table

This is the clearest thing in the project.

| verifiers | what the caller gets |
|---|---|
| all passed | the output, marked **CHECKED**, naming which checks ran |
| any failed | the output **WITHHELD**, with the failing check and its reason |
| none failed, some could not check, at least one passed | the output, **PARTIALLY CHECKED**, naming what could not be checked |
| checks were declared and not one could run | the output, **NOTHING COULD BE CHECKED**, naming each one |
| no verifiers declared | the output, marked **NOT CHECKED** — never "verified" |

The last two rows are the ones that matter, and they are the reason the project
exists. An agent with no checks is legitimate; presenting its output as checked is
not. And "partially checked" asserts that some checking happened — so when *every*
declared check failed to run, saying "partially" would be the harness telling you
a comforting thing that is not true.

Both of those rows still return the output. **Withholding is reserved for an actual
failure, never for an absence of information:** this harness makes missing
verification visible, it does not punish you for it.

## What it looks like

Real terminal output, not illustrations.

An answer that satisfies every check:

```
$ conferente perguntar "rewrite this in our brand voice. forbidden: synergy, leverage" \
    --resposta "clause 4 applied: we write plainly."

[CHECKED]
agent: voz-de-marca
  check termos-proibidos: passed
  check cita-clausula: passed

clause 4 applied: we write plainly.

exit 0
```

A forbidden term. Note that the answer is **not printed**:

```
$ conferente perguntar "rewrite this in our brand voice. forbidden: synergy" \
    --resposta "clause 4 applied: great synergy ahead."

[WITHHELD]
agent: voz-de-marca
reason: termos-proibidos: output contains forbidden term(s): synergy
  check termos-proibidos: falhou — output contains forbidden term(s): synergy
  check cita-clausula: passed

exit 1
```

A check that could not run. The answer comes back, and the label says exactly what
was not verified:

```
$ conferente perguntar "rewrite this in our brand voice" \
    --resposta "clause 4 applied: plain words."

[PARTIALLY CHECKED]
agent: voz-de-marca
reason: termos-proibidos: the request lists no forbidden terms
  check termos-proibidos: nao_deu_para_conferir — the request lists no forbidden terms
  check cita-clausula: passed

clause 4 applied: plain words.

exit 0
```

An agent that declares no checks. Legitimate, and labelled:

```
[NOT CHECKED]
agent: solto
reason: this agent declares no checks
  no checks were declared for this agent

here is an answer nobody checked.

exit 0
```

Nobody claims the request. No model is called — a default agent would answer a
question it was never built for:

```
$ conferente perguntar "restart the database"

[NO AGENT CLAIMS THIS]
reason: no agent claims this request

exit 1
```

And a verifier nobody implemented stops the process before anything runs:

```
$ conferente agentes --agentes ./broken

  conferente cannot start:

   · agent "voz" (broken/voz.md) names verifier "nao-existe", which is not registered

exit 1
```

The exit code is part of the contract: **0 when an answer was produced, 1 when
none was.** One condition covering every disposition, so a script piping
`perguntar` cannot read a withheld answer as a successful one.

## Adding an agent

One file. No code, and nothing in the harness to touch.

```markdown
---
nome: voz-de-marca
proposito: Rewrites text to match a style guide supplied with the request
reivindica: [brand voice, rewrite, tone of voice]
verificadores: [termos-proibidos, cita-clausula]
---

Rewrite the text supplied in the request so that it matches the style guide, also
supplied in the request. Change wording, not meaning.

State the clause you applied as `clause <id>` so the choice can be checked.
```

`reivindica` is what the router scores against a request. `verificadores` are
names resolved in the registry — **a name nobody implemented is a startup error**,
because an agent that declares a check nobody runs is worse than an agent that
declares none.

The frontmatter subset is deliberately tiny: `chave: valor` and `chave: [a, b]`.
Anything outside it is an error naming the line number, because a parser that
guesses is worse than one that refuses — a silently ignored line is a declared
check that vanishes.

## Plugging in a real model

One file implementing one method:

```ts
import type { ModeloAdapter } from './src/modelo/adaptador.ts';

export const meuProvedor: ModeloAdapter = {
  async responder({ instrucao, pedido }) {
    // your provider call here
    return texto;
  },
};
```

That is the whole boundary. Everything this project is about happens before and
after that call, and a wider interface would invite the harness to grow into a
gateway.

## How routing decides

Pure code, no model. "The model decided" cannot be audited, and the choice has to
be explainable.

- A claim phrase found whole in the request scores twice its length in words.
- Scattered words score one each, capped one below a whole-phrase hit.
- An agent scores as its **single best claim**, not the sum — summing rewards an
  agent for listing many claims, and "chosen because four of its nine claims
  happened to appear" is not a sentence anyone can audit.
- **A tie is an ambiguity, not a winner.** The run ends naming both agents.
- **Zero is "nobody claims this", never a default agent.**

Every agent's score lands in the transcript, so "why did this agent answer?" has a
numeric answer.

## Architecture

```
src/
  verificacao/   the three-state verdict and the registry   — pure
  agente/        agent files, validation, routing            — pure
  modelo/        the model boundary: one interface, one fake
  execucao/      request → agent → model → verifiers → disposition
  transcricao/   what happened, as a value that renders
  texto/         escape a string for literal use in a RegExp
  cli/           conferente perguntar · conferente agentes
agentes/         the example agents, as files
```

Four boundaries carry the design:

**An agent is a file, not code.** Adding one must not require touching the
harness. If it does, the harness is doing too much.

**The model sits behind one interface.** The default everywhere that is not
production is a deterministic fake, so the suite and the demo need no key and no
network.

**Verifiers are pure functions in a registry.** Every way one can go wrong —
missing, throwing, returning a shape nobody expected — becomes
`nao_deu_para_conferir`. Never a pass. A verifier is other people's code, and
trusting the shape of what it returns would be the same mistake as trusting the
model's.

**The transcript is a value, not a log line.** Tests assert on it and the CLI
renders it: one record with two consumers is the only way what a person reads and
what a test checks cannot drift apart. The label always leads, above any output —
text printed above its own label gets read first and qualified second, which is
how unchecked output ends up quoted as checked.

## On the language

Comments and documentation are in English. Identifiers are in Portuguese —
`conferente`, `veredito`, `conferir`, `nao_deu_para_conferir` — because the
metaphor *is* the vocabulary here, and splitting it across two languages would
cost more than it buys. It is a declared decision, not an accident.

## What this does not claim

It does not make model output correct. It makes the *absence* of checking visible,
which is a much smaller claim and the only honest one available.

## Licence

[FSL-1.1-ALv2](LICENSE.md) — the Functional Source License. Use it, read it,
build on it; you may not use it to compete with it. It converts to Apache 2.0 two
years after each release.
