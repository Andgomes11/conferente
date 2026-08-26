/**
 * The verdict is the whole thesis: a verifier that cannot do its job must say so,
 * and "could not check" must be a value the caller receives rather than a detail
 * the harness swallows.
 *
 * The test that matters most is the one about a verifier that throws. A broken
 * check must never be indistinguishable from a satisfied one — that single
 * confusion is what turns a checking harness into a harness that only looks like
 * one.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { falhou, naoDeuParaConferir, passou } from '../src/verificacao/veredito.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';

describe('veredito', () => {
  it('carries the verifier name in all three states', () => {
    assert.equal(passou('termos-proibidos').verificador, 'termos-proibidos');
    assert.equal(falhou('termos-proibidos', 'x').verificador, 'termos-proibidos');
    assert.equal(naoDeuParaConferir('termos-proibidos', 'x').verificador, 'termos-proibidos');
  });

  it('failure and could-not-check both carry a reason', () => {
    assert.equal(falhou('v', 'found a forbidden term').motivo, 'found a forbidden term');
    assert.equal(naoDeuParaConferir('v', 'no style guide supplied').motivo, 'no style guide supplied');
  });
});

describe('criarRegistro', () => {
  it('resolves a registered verifier and runs it', async () => {
    const r = criarRegistro({ sempre: () => passou('sempre') });
    const v = await r.conferir('sempre', 'output', 'request');
    assert.equal(v.estado, 'passou');
  });

  it('an unregistered name is could-not-check, never passed', async () => {
    const r = criarRegistro({});
    const v = await r.conferir('inexistente', 'output', 'request');
    assert.equal(v.estado, 'nao_deu_para_conferir');
    assert.match(v.motivo, /not registered/i);
  });

  it('awaits an async verifier', async () => {
    const r = criarRegistro({ lento: async () => falhou('lento', 'nope') });
    assert.equal((await r.conferir('lento', 'o', 'p')).estado, 'falhou');
  });

  it('a verifier that throws becomes could-not-check, never passed', async () => {
    const r = criarRegistro({
      quebra: () => {
        throw new Error('style guide unreachable');
      },
    });
    const v = await r.conferir('quebra', 'o', 'p');
    assert.equal(v.estado, 'nao_deu_para_conferir');
    assert.match(v.motivo, /style guide unreachable/);
  });

  it('a verifier that returns garbage becomes could-not-check', async () => {
    // A verifier is other people's code. Trusting its return shape is the same
    // mistake as trusting the model's.
    const r = criarRegistro({ torto: () => ({ tudo: 'bem' }) as never });
    assert.equal((await r.conferir('torto', 'o', 'p')).estado, 'nao_deu_para_conferir');
  });

  it('lists registered names, for startup validation', () => {
    assert.deepEqual(criarRegistro({ a: () => passou('a'), b: () => passou('b') }).nomes(), ['a', 'b']);
  });
});
