# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Three-state verdict: passed, failed, and **could not check**. A verifier that
  cannot reach what it needs has approved nothing, and the difference survives to
  the caller.
- Verifier registry that turns every failure mode — unregistered, throwing,
  returning a shape nobody expected — into `nao_deu_para_conferir`, never a pass.
- Agents as files, with a frontmatter subset small enough to refuse rather than
  guess. A line outside it is an error naming the line number.
- Pure scoring router. A tie is an ambiguity naming both agents; zero is "nobody
  claims this", never a default agent. Every score reaches the transcript.
- One-method model boundary and a deterministic fake, so the suite and the demo
  run with no API key and no network.
- The disposition table: CHECKED, WITHHELD, PARTIALLY CHECKED, NOTHING COULD BE
  CHECKED, NOT CHECKED — plus NO AGENT CLAIMS THIS, AMBIGUOUS and MODEL ERROR.
- Startup that refuses to run: a malformed agent file, or a verifier named by an
  agent and implemented by nobody, stops the process naming both.
- `conferente perguntar` and `conferente agentes`, with `--resposta` to supply an
  answer and watch the checks run on it.
- Four example agents, one of which declares no verifiers on purpose.
- **Pre-flight.** A verifier may declare `preVoo`, which sees only the request and
  answers whether the check can run at all. A verifier that reads its criteria
  from the request already knows: if the request lists no forbidden terms, no
  output will change that. Advisory by default — it lands in the transcript and
  the caller can fix the request instead of paying for an answer nobody can check.
- **`--exigir-conferencia`**, which turns that advice into a contract: do not
  answer what you cannot check. When every declared check reports it cannot run,
  the request is refused before the model is called. The one place this harness
  withholds for an absence rather than a failure, legitimate exactly because the
  caller asked for it. New disposition `recusada_sem_conferencia`.
- The OpenTelemetry GenAI mapping, in the README. No exporter ships — that would
  mean a dependency — but the mapping is written down so the omission reads as a
  decision.

### Fixed
- `PARTIALLY CHECKED` was printed above output when *every* declared check had
  failed to run — zero of two, described as partial. `NOTHING COULD BE CHECKED`
  now covers it and stays distinct from `NOT CHECKED`, because declaring no
  checks is a choice while declaring checks nobody implemented is a broken setup.
- A full-phrase match did not always beat scattered words, contradicting the
  stated rule: a one-word claim collected the whole phrase bonus, and summing
  across claims rewarded an agent for listing many. A phrase is now worth twice
  its word count and an agent scores as its single best claim.
- Text from outside the code reached a `RegExp` unescaped in two places. A claim
  phrase like `c++ refactor` threw; a required field named `cost (usd)` was
  reported missing while present, and the run loop withheld a correct answer for
  it.
- The fake model answered by object insertion order, so the same script could
  give different answers depending on how its keys were written.
- The exit code treated `NO AGENT CLAIMS THIS` and `AMBIGUOUS` as success. It is
  now 0 when an answer was produced and 1 when none was.
