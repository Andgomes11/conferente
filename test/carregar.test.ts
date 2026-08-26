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
    assert.deepEqual(
      validarVerificadores(agentes, criarRegistro({ 'termos-proibidos': () => passou('x') })),
      [],
    );
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

  it('campos-obrigatorios finds a field whose name contains metacharacters', async () => {
    // The worse half of an unescaped RegExp: `cost (usd)` became the pattern
    // `/^\s*cost (usd)\s*:/im`, which does not match the literal text, so a
    // present field read as missing. The run loop withholds output on a failure —
    // so a correct answer was withheld, and the reason named a field that was
    // right there.
    const v = VERIFICADORES_EMBUTIDOS['campos-obrigatorios']!;
    const r = await v('subject: a cat\ncost (usd): 40\n', 'brief. required: cost (usd), subject');
    assert.equal(r.estado, 'passou');
  });

  it('campos-obrigatorios does not throw on a field name that is invalid regex', async () => {
    // `c++ notes` is `/^\s*c++ notes\s*:/im` — a SyntaxError. The registry would
    // turn the throw into `nao_deu_para_conferir`, which is honest, but the check
    // still never runs. Escaping lets it actually run.
    const v = VERIFICADORES_EMBUTIDOS['campos-obrigatorios']!;
    const r = await v('c++ notes: yes\n', 'brief. required: c++ notes');
    assert.equal(r.estado, 'passou');
  });

  it('metrica-unica fails when two metrics are proposed', async () => {
    const v = VERIFICADORES_EMBUTIDOS['metrica-unica']!;
    const r = await v('metric: signups\nmetric: revenue\n', 'design an experiment');
    assert.equal(r.estado, 'falhou');
  });
});
