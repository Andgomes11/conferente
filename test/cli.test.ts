/**
 * The CLI, run as a process.
 *
 * The end-to-end test next door exercises the wiring of every module and would
 * still pass with no CLI at all — it imports the pieces, not the command. This is
 * the only test that would catch a broken argument parse, a wrong exit code, or a
 * startup that runs anyway with a broken agent file.
 *
 * Exit codes are part of the contract: 0 when an answer was produced, 1 when none
 * was. A script that pipes `perguntar` must not read a withheld answer as a
 * successful one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rodarCli = (...args: string[]) =>
  spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', 'src/cli/conferente.ts', ...args],
    { encoding: 'utf8' },
  );

describe('conferente agentes', () => {
  it('lists the shipped agents and exits 0', () => {
    const r = rodarCli('agentes');
    assert.equal(r.status, 0, r.stderr);
    for (const nome of ['voz-de-marca', 'brief-de-imagem', 'experimento-de-growth']) {
      assert.match(r.stdout, new RegExp(nome));
    }
  });

  it('shows the checks each agent declares', () => {
    const r = rodarCli('agentes');
    assert.match(r.stdout, /termos-proibidos/);
    assert.match(r.stdout, /metrica-unica/);
  });
});

describe('conferente perguntar', () => {
  it('an answer that satisfies every check leads with CHECKED and exits 0', () => {
    const r = rodarCli(
      'perguntar',
      'rewrite this in our brand voice. forbidden: synergy',
      '--resposta',
      'clause 4 applied: we write plainly.',
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[CHECKED\]/);
  });

  it('a failing check withholds the answer and exits 1', () => {
    const r = rodarCli(
      'perguntar',
      'rewrite this in our brand voice. forbidden: synergy',
      '--resposta',
      'clause 4 applied: great synergy ahead.',
    );
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[WITHHELD\]/);
    assert.ok(!r.stdout.includes('synergy ahead'), 'a withheld answer must not be printed');
  });

  it('a check that could not run says so and still returns the answer, exit 0', () => {
    const r = rodarCli(
      'perguntar',
      'rewrite this in our brand voice',
      '--resposta',
      'clause 4 applied: plain words.',
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[PARTIALLY CHECKED\]/);
    assert.match(r.stdout, /no forbidden terms/i);
    assert.match(r.stdout, /plain words/);
  });

  it('a request nobody claims exits 1 — no answer was produced', () => {
    const r = rodarCli('perguntar', 'restart the database');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /NO AGENT CLAIMS THIS/);
  });

  it('with no answer supplied it still runs, using the fake model', () => {
    const r = rodarCli('perguntar', 'design a growth experiment');
    assert.match(r.stdout, /\[(WITHHELD|CHECKED|PARTIALLY CHECKED)\]/);
    assert.match(r.stdout, /agent: experimento-de-growth/);
  });

  it('--exigir-conferencia refuses before the model runs, and exits 1', () => {
    // `brief-de-imagem` declares one check and that check has a pre-flight, so a
    // request with no `required:` cannot be checked at all. Without the flag the
    // same request is answered and labelled; with it, refused.
    const r = rodarCli('perguntar', 'write an image brief for a cat', '--exigir-conferencia');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /\[REFUSED — NOTHING CAN BE CHECKED\]/);
    assert.match(r.stdout, /no required fields/);
    assert.ok(!r.stdout.includes('subject:'), 'nothing may be answered when the run was refused');
  });

  it('the same request without the flag is answered and labelled', () => {
    const r = rodarCli(
      'perguntar',
      'write an image brief for a cat',
      '--resposta',
      'subject: a cat',
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[NOTHING COULD BE CHECKED\]/);
    assert.match(r.stdout, /subject: a cat/);
  });

  it('--exigir-conferencia does not refuse when one of several checks can run', () => {
    // The contract is "do not answer what you cannot check", not "check
    // everything". `voz-de-marca` declares two checks and only one objects.
    const r = rodarCli(
      'perguntar',
      'rewrite this in our brand voice',
      '--resposta',
      'clause 4 applied: plain words.',
      '--exigir-conferencia',
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[PARTIALLY CHECKED\]/);
  });

  it('perguntar with no request prints usage and exits 1', () => {
    const r = rodarCli('perguntar');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage/i);
  });

  it('an unknown command prints usage and exits 1', () => {
    const r = rodarCli('voar');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage/i);
  });
});

describe('startup refuses to run broken', () => {
  const pastaQuebrada = (): string => {
    const d = mkdtempSync(join(tmpdir(), 'conferente-cli-'));
    writeFileSync(
      join(d, 'voz.md'),
      '---\nnome: voz\nproposito: p\nreivindica: [brand voice]\nverificadores: [nao-existe]\n---\nrewrite it\n',
    );
    return d;
  };

  it('a verifier nobody implemented stops the process, naming agent and verifier', () => {
    const r = rodarCli('agentes', '--agentes', pastaQuebrada());
    assert.equal(r.status, 1);
    assert.match(r.stderr, /nao-existe/);
    assert.match(r.stderr, /voz/);
    assert.ok(!r.stdout.includes('voz-de-marca'), 'it must not fall back to the real directory');
  });

  it('a malformed agent file stops the process before any request runs', () => {
    const d = mkdtempSync(join(tmpdir(), 'conferente-cli-'));
    writeFileSync(join(d, 'ruim.md'), 'not an agent at all\n');
    const r = rodarCli('perguntar', 'rewrite this in our brand voice', '--agentes', d);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ruim\.md/);
    assert.ok(!r.stdout.includes('['), 'no disposition may be printed when startup failed');
  });
});
