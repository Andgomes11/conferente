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
    assert.equal(
      await m.responder({ instrucao: 'i', pedido: 'use our brand voice' }),
      'clause 3 applied: we write plainly.',
    );
  });

  it('the most specific trigger wins, whatever order the keys were written in', async () => {
    // The defect this replaces: the first matching key won, so the answer depended
    // on object insertion order. `{a, brand voice}` and `{brand voice, a}` gave
    // different answers for the same request. Task 5 drives the disposition table
    // from these scripts, and this module's own rule is that a fake which varies
    // makes flaky tests — which teach people to ignore red.
    const pedido = 'use our brand voice';
    const curtoPrimeiro = criarModeloFalso({ a: 'GENERIC', 'brand voice': 'SPECIFIC' });
    const curtoDepois = criarModeloFalso({ 'brand voice': 'SPECIFIC', a: 'GENERIC' });
    assert.equal(await curtoPrimeiro.responder({ instrucao: 'i', pedido }), 'SPECIFIC');
    assert.equal(await curtoDepois.responder({ instrucao: 'i', pedido }), 'SPECIFIC');
  });

  it('an empty scripted answer comes back empty, so the run loop can reject it', async () => {
    const m = criarModeloFalso({ vazio: '' });
    assert.equal(await m.responder({ instrucao: 'i', pedido: 'vazio' }), '');
  });
});
