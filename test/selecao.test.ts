/**
 * Choosing an agent is pure code, never a model call: "the model decided" is not
 * an explanation, and this choice has to be explainable in the transcript.
 *
 * Two rules are load-bearing. A tie is an ambiguity rather than a winner —
 * picking one of two equally-claimed agents silently is a wrong answer with no
 * symptom. And a total of zero is "nobody claims this", never a default agent,
 * because a default agent answers questions it was never built for.
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
    const r = escolher(
      [ag('voz', ['brand voice']), ag('imagem', ['image brief'])],
      'rewrite this in our brand voice',
    );
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
    const r = escolher(
      [ag('a', ['growth experiment']), ag('b', ['growth experiment'])],
      'design a growth experiment',
    );
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

  it('a claim phrase with regex metacharacters does not crash the router', () => {
    // A claim is other people's text, from an agent file, and `c++ refactor` is a
    // perfectly ordinary thing to claim. Built into a pattern unescaped it is
    // `/(^| )c++( |$)/` — a SyntaxError, so one legal agent file takes down
    // selection for every agent.
    const r = escolher([ag('dev', ['c++ refactor'])], 'plan a cxx refactor');
    assert.ok(r.ok);
    assert.equal(r.agente.nome, 'dev');
  });

  it('a metacharacter in a claim does not match text it should not', () => {
    // The quieter half of the same bug, and the worse one: unescaped, the dot in
    // `node.js` matches any character, so `nodexjs` scores as a hit and an agent
    // that does not claim this request answers it anyway. No crash, no symptom.
    const r = escolher([ag('node', ['node.js version upgrade'])], 'nodexjs stuff');
    assert.ok(!r.ok);
    assert.equal(r.motivo, 'nenhum');
  });

  it('an empty agent list is "nobody claims this", not a crash', () => {
    const r = escolher([], 'anything');
    assert.ok(!r.ok);
    assert.equal(r.motivo, 'nenhum');
  });
});
