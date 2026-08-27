# Contributing

## Running it

```bash
npm install
npm test          # no network, no API key
npm run typecheck
```

Node ≥ 22.6. No build step: types are stripped at run time, so what you read is
what runs. **Zero runtime dependencies** — if a change seems to need one, the
design is probably wrong for this project.

## The one rule that is not negotiable

**Nothing may report as checked what was not checked.** Every other rule here is
downstream of that one. When you are unsure how a new state should behave, ask
which answer a reader would be misled by, and pick the other one.

Practically:

- A verifier that cannot do its job returns `nao_deu_para_conferir` with a reason.
  Never a pass, never a silent skip.
- Anything that goes wrong while running a verifier — throwing, returning a shape
  nobody expected — is also `nao_deu_para_conferir`. A verifier is other people's
  code and the harness does not trust the shape of what it returns.
- A new disposition needs a row in the table in `docs/design.md` before it has a
  branch in `src/execucao/rodar.ts`. The table is the spec.

## Tests

Written first, and watched failing before the code exists. Both gates must be
green: `npm test` **and** `npm run typecheck` — a passing suite is not a finished
change, and at least one defect in this repository's history was visible only to
the typechecker.

One more thing, learned the hard way here: **make sure the test can actually
fail.** Two tests written for the `RegExp` escaping passed without the fix,
because the input they used never reached the escaped path. A test that cannot
fail proves nothing, which is the same defect this project exists to make
visible. Break the code on purpose and watch your new test go red before you
trust it.

## Style

Comments and documentation in English; identifiers in Portuguese. The metaphor is
the vocabulary — `conferente`, `veredito`, `conferir` — and splitting it across
two languages would cost more than it buys.

A comment says **why**, not what. If a decision has a reason that is not obvious
from the code, that reason belongs next to it — most of the comments here exist
because something was measured and the measurement contradicted the obvious move.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). The body says what
the change decides and why, not what the diff already shows.

## Licence

Contributions are accepted under [FSL-1.1-ALv2](LICENSE.md).
