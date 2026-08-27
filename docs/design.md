# conferente — design

**Date:** 2026-08-26
**Status:** design, awaiting review before implementation

## The name

A *conferente* is a real occupation: the person on a dock or in a warehouse who
checks cargo against the manifest before signing for it. They do not move the
cargo and they do not decide what ships. Their whole job is to refuse to sign for
what they could not check.

That is what this harness does to model output.

## The problem

A team wants specialised internal agents — one that writes in the brand's voice,
one that turns a request into an image brief, one that designs a growth
experiment. Each is easy to build badly: prompt in, text out, ship it.

What goes wrong is not the model. It is that **nothing between the model and the
person distinguishes output that was checked from output that merely looks
checked.** A brief that silently dropped a brand constraint reads exactly like one
that honoured it. The failure is invisible at the point of use, which is the worst
place for a failure to be invisible.

Every harness on GitHub solves the first half: route a request to an agent, call a
model, return text. This one exists for the second half.

## The thesis

**Verification is code, never a model call.**

If the check on an agent's output is itself a prompt, nothing was verified — a
second unverified output was produced and labelled a guarantee. So in this harness
a verifier is a **registered function**: it takes the output and the request and
returns pass, fail, or *could not check*, with a reason.

That third state is the point. A verifier that cannot reach the data it needs must
say so, and the harness must carry that statement all the way to the caller. An
answer that could not be checked is not an answer that passed.

## Non-goals

- Not a framework. No plugin system, no DSL, no orchestration graph.
- Not a model gateway. One adapter interface; bring your own provider.
- Not multi-tenant, not hosted, no authentication.
- Not a prompt library. The example agents exist to exercise the harness.

## Shape

```
src/
  agente/        agent definition: parse, validate, select — pure
  verificacao/   the verifier registry and the three-state result — pure
  modelo/        the model boundary: one interface, a fake, and a real adapter
  execucao/      the run loop: request → agent → model → verifiers → transcript
  transcricao/   what happened, in a form that can be replayed and asserted on
  cli/           `conferente perguntar "..."` and `conferente agentes`
agentes/         example agents, as files
```

Four boundaries carry the design.

**An agent is a file, not code.** Name, purpose, allowed tools, and the verifiers
its output must satisfy. Adding an agent must not require touching the harness —
if it does, the harness is doing too much.

**The model sits behind one interface.** `ModeloAdapter` has a single method. The
default in tests and in the demo is a deterministic fake, so `npm test` and
`conferente perguntar` both run with no API key and no network. This is the same
boundary that makes the sibling project's rule engine testable, and it is the
reason a stranger can clone this and see it work.

**Verifiers are pure functions in a registry.** An agent file names verifiers; the
registry resolves them. A name with no registered function is a startup error, not
a silent skip — an agent that declares a check nobody implemented is worse than an
agent that declares none.

**The transcript is the product's memory.** Request, chosen agent and why, model
call, each verifier and its verdict, and the final disposition. It is a value, not
a log line: tests assert on it, and the CLI renders it.

## The three-state result

```ts
type Veredito =
  | { estado: 'passou'; verificador: string }
  | { estado: 'falhou'; verificador: string; motivo: string }
  | { estado: 'nao_deu_para_conferir'; verificador: string; motivo: string };
```

Disposition rules, and each is a decision rather than a default:

| verifiers | what the caller gets |
|---|---|
| all passed | the output, marked verified, naming which checks ran |
| any failed | the output **withheld**, with the failing check and its reason |
| none failed, some could not check, at least one passed | the output, marked **partially checked**, naming what could not be checked |
| checks were declared and not one could run | the output, marked **nothing could be checked**, naming each one |
| no verifiers declared | the output, marked **unchecked** — never "verified" |
| the caller required checking and none was possible | **refused** before the model is called, naming what could not be checked and why |

The last two rows are the ones that matter, and the second-to-last was added on
2026-08-26 during Task 5, after the implementation demonstrated the hole. With
four rows, an agent declaring two verifiers that were both unregistered rendered
`[PARTIALLY CHECKED]` directly above its output — zero of two checks had run.
"Partially" asserts that some checking happened; the row said "some could not
check" and quietly assumed at least one had passed.

`nada_conferido` stays distinct from `nao_conferida` because the two call for
different actions. Declaring no checks is a legitimate choice. Declaring checks
nobody implemented is a broken setup someone has to fix. The amount of
verification is the same — zero — and conflating them hides the second.

Both return the output. Withholding is reserved for an actual failure, never for
an absence of information: this harness makes missing verification visible, it
does not punish the caller for it.

An agent with no checks is legitimate; presenting its output as checked is not.

## The pre-flight

Every row above is decided *after* the model has answered. That is one row too
late for a caller who would rather not have an unchecked answer at all.

A verifier that reads its criteria from the request — forbidden terms, required
fields — already knows before the model runs whether it will be able to check
anything: if the request lists no forbidden terms, no output will change that. So
a verifier may declare an optional `preVoo`, which sees only the request and
answers one question: *can this check run at all?*

The pre-flight never approves anything. Its only useful answer is
`nao_deu_para_conferir`, and it is advisory by default — the run continues, the
transcript records it, and the CLI prints it before spending a model call so the
caller can fix the request instead of paying for an answer nobody can check.

`--exigir-conferencia` turns advice into a contract: *do not answer what you
cannot check*. When every declared verifier reports it cannot run, the request is
refused before the model is called. This is the one place where the harness
withholds for an absence rather than a failure, and it is legitimate precisely
because the caller asked for it. Without the flag, the same run answers and
labels the answer `NOTHING COULD BE CHECKED`.

A verifier with no `preVoo` is assumed able to check. Silence is not a refusal,
and the harness will not invent a refusal the verifier did not make.

The two halves of a verifier are expected to agree. A `preVoo` that announces "I
will not be able to check" beside a `conferir` that returns `passou` is a verifier
lying to itself, and the harness believes `conferir` — it is the half that saw the
output. Nothing enforces the agreement, because a verifier is other people's code
and the harness cannot know which half is wrong.

## Tools, and why they are not here

The obvious next feature is validating tool calls — checking a tool's arguments
before it runs and its result after. It is missing on purpose, and the reason is
worth stating rather than leaving as an oversight.

A tool call requires the model to be able to *ask* for one, which means
`ModeloAdapter.responder` can no longer return a string. It would return either
text or a tool request, and the single-method boundary above — the thing that
makes a real provider a thin file and keeps the harness from growing into a
gateway — stops being single-method.

That may well be the right trade later. It is a change to a load-bearing
decision, not an addition, and it belongs in its own design rather than bolted
onto this one.

## Failure states

Every one of these exists because the alternative is silence that reads as success.

| state | behaviour |
|---|---|
| agent file malformed | startup fails, naming the file and the field |
| verifier named but not registered | startup fails, naming both |
| no agent matches the request | explicit “no agent claims this”, never a default agent |
| model adapter throws | run ends with the error in the transcript, output withheld |
| model returns empty | treated as failure, not as an empty success |
| verifier throws | recorded as `nao_deu_para_conferir`, never as passed |

That last line is the most important in the document. A crashing verifier must
never be indistinguishable from a passing one.

## Selection

Routing is pure and testable, and no model call is involved: the choice must be
explainable in the transcript, and “the model decided” is not an explanation.

An agent declares `reivindica` — a list of claim phrases. Scoring is deliberately
dull, because a clever router is an unexplainable one:

1. A claim phrase present in the request as a whole phrase scores 2.
2. Each of its words present separately scores 1, capped at the phrase's word
   count minus one — so a full-phrase match always beats a scattered-word match.
3. The highest total wins. **A tie is an ambiguity, not a winner:** the run ends
   with “two agents claim this”, naming both, and the caller decides.
4. A score of zero for every agent is “no agent claims this”, never a fallback.

The transcript records every agent's score, so “why did this agent answer?” has a
numeric answer.

## Example agents

Four, deliberately generic, in `agentes/`:

- **voz-de-marca** — rewrites text against a supplied style guide. Verifiers:
  forbidden-terms check, reading-level bound, and “cites the guide clause it
  applied”.
- **brief-de-imagem** — turns a request into a structured image brief. Verifiers:
  required-fields present, aspect ratio within an allowed set, no named real
  person in the subject.
- **experimento-de-growth** — proposes one experiment. Verifiers: has a single
  measurable metric, has a stated sample size, and declares what would falsify it.

- **rascunho-livre** — writes a first draft. Verifiers: **none**, on purpose.

The fourth exists for two reasons. There is genuinely no mechanical check for
whether a draft is any good, and inventing one would be worse than having none:
the harness would report a check that measures nothing. And without it the
`NOT CHECKED` row of the disposition table was a claim no reader could reproduce —
every shipped agent declared checks, so the README printed a transcript nobody
could produce themselves. In this project in particular, that is the wrong kind of
gap.

They contain no organisation's content. The style guide and brand constraints are
inputs, supplied per request.

## Testing

- `agente/` — parsing, validation, and selection including the ambiguous case
- `verificacao/` — the registry, the three states, and a verifier that throws
- `execucao/` — the disposition table above, driven by a fake model
- `transcricao/` — the transcript records selection reasoning and every verdict
- `modelo/` — the fake is deterministic for a given request, and the adapter
  interface has exactly one method, so a real provider is a thin file
- One end-to-end run through the CLI against the fake model, asserting the
  rendered output says *unchecked* when no verifier is declared, and *partially
  checked* when one verifier could not check

Node ≥ 22.6, `--experimental-strip-types`, no build step, `node:test`.

## What this is not going to do

It will not claim to make model output correct. It makes the *absence* of checking
visible, which is a much smaller claim and the only honest one available.
