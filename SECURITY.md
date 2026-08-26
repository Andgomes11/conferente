# Security

## Reporting

Report a vulnerability privately through GitHub's **Report a vulnerability**
button on the Security tab. Please do not open a public issue first.

Expect an acknowledgement within a week.

## Scope

`conferente` runs locally, reads agent files from a directory you control, and
calls whatever model adapter you supply. It has no server, no authentication and
no multi-tenancy — see the non-goals in `docs/design.md`.

Two things are worth knowing before you wire it to anything real.

**A verifier is code you are trusting.** Verifiers are plain functions in a
registry, and the harness runs them against model output. It contains their
failures — a verifier that throws or returns nonsense becomes
`nao_deu_para_conferir` rather than a pass — but it does not sandbox them. A
verifier can do anything the process can. Review them the way you review the rest
of your code.

**Text from a request reaches a `RegExp`.** The built-in verifiers read their
criteria from the request (`forbidden: …`, `required: …`), and agent files supply
claim phrases the router matches. Every one of those goes through
`escaparRegex` before entering a pattern, so a metacharacter cannot change what a
pattern means. If you write your own verifier that builds a pattern from
untrusted text, use the same helper: the bug it prevents is quiet, not loud — an
unescaped `cost (usd)` reports a field that is present as missing.

## What this project does not claim

It does not make model output correct. It makes the *absence* of checking visible.
An answer marked `NOT CHECKED` or `NOTHING COULD BE CHECKED` has not been
verified by anything, and the label is the only guarantee offered.
