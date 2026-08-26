/**
 * An agent is a file so that adding one never touches the harness. The parser is
 * a deliberately small subset of frontmatter — `chave: valor` and
 * `chave: [a, b]` — and anything outside it is an error rather than a guess.
 *
 * Guessing is the failure mode here. A silently ignored field is an agent that
 * declares a check nobody runs, which is worse than an agent with no checks at
 * all: the first looks verified and is not.
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
