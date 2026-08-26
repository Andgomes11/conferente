/**
 * The disposition table from the design document, in code.
 *
 * The row that matters is the fourth: an agent with no verifiers is legitimate,
 * and its output must arrive marked `nao_conferida`. Anything that lets that
 * output read as checked defeats the entire project, so it is asserted twice — on
 * the disposition and on the absence of verdicts.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rodar } from '../src/execucao/rodar.ts';
import { criarRegistro, type Verificador } from '../src/verificacao/registro.ts';
import { falhou, naoDeuParaConferir, passou } from '../src/verificacao/veredito.ts';
import { criarModeloFalso } from '../src/modelo/falso.ts';
import type { Agente } from '../src/agente/definicao.ts';

const ag = (verificadores: string[]): Agente => ({
  nome: 'voz',
  proposito: 'p',
  reivindica: ['brand voice'],
  verificadores,
  instrucao: 'rewrite it',
  arquivo: 'agentes/voz.md',
});

const rodarCom = (
  verificadores: string[],
  mapa: Record<string, Verificador> = {},
  pedido = 'use our brand voice',
) =>
  rodar({
    agentes: [ag(verificadores)],
    registro: criarRegistro(mapa),
    modelo: criarModeloFalso({ 'brand voice': 'rewritten text' }),
    pedido,
  });

describe('rodar', () => {
  it('all verifiers passed → conferida, naming the checks that ran', async () => {
    const t = await rodarCom(['a', 'b'], { a: () => passou('a'), b: () => passou('b') });
    assert.equal(t.disposicao, 'conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.deepEqual(t.vereditos.map((v) => v.verificador), ['a', 'b']);
  });

  it('any verifier failed → retida, and the output is NOT returned', async () => {
    const t = await rodarCom(['a'], { a: () => falhou('a', 'forbidden term "synergy"') });
    assert.equal(t.disposicao, 'retida');
    assert.equal(t.saida, undefined);
    assert.match(String(t.motivo), /synergy/);
  });

  it('one could not check, none failed → parcialmente_conferida, output returned', async () => {
    const t = await rodarCom(['a', 'b'], {
      a: () => passou('a'),
      b: () => naoDeuParaConferir('b', 'no style guide supplied'),
    });
    assert.equal(t.disposicao, 'parcialmente_conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.match(String(t.motivo), /no style guide supplied/);
  });

  it('no verifiers declared → nao_conferida, never conferida', async () => {
    const t = await rodarCom([]);
    assert.equal(t.disposicao, 'nao_conferida');
    assert.equal(t.saida, 'rewritten text');
    assert.deepEqual(t.vereditos, []);
  });

  it('EVERY verifier could not check → nada_conferido, never parcialmente_conferida', async () => {
    // The gap this closes. "Partially checked" asserts that some checking
    // happened. With two declared verifiers and neither registered, zero checks
    // ran — and the harness rendered `[PARTIALLY CHECKED]` above the output. That
    // is the same false assurance this project exists to prevent, sitting in the
    // middle of the project.
    //
    // The output still comes back, as it does for an agent that declares no
    // checks: withholding is reserved for an actual failure, never for an absence
    // of information. What changes is the label.
    const t = await rodarCom(['termos-proibidos', 'cita-clausula']);
    assert.equal(t.disposicao, 'nada_conferido');
    assert.equal(t.saida, 'rewritten text');
    assert.equal(t.vereditos.length, 2);
    assert.ok(t.vereditos.every((v) => v.estado === 'nao_deu_para_conferir'));
  });

  it('nada_conferido stays distinct from nao_conferida', async () => {
    // Two different situations that must not be conflated: one agent declared no
    // checks (legitimate), the other declared checks nobody implemented (a broken
    // setup someone has to fix). Same amount of verification — zero — and very
    // different things to do about it.
    const semChecagem = await rodarCom([]);
    const checagemQuebrada = await rodarCom(['inexistente']);
    assert.equal(semChecagem.disposicao, 'nao_conferida');
    assert.equal(checagemQuebrada.disposicao, 'nada_conferido');
  });

  it('a failure outranks a could-not-check', async () => {
    const t = await rodarCom(['a', 'b'], {
      a: () => naoDeuParaConferir('a', 'unreachable'),
      b: () => falhou('b', 'wrong'),
    });
    assert.equal(t.disposicao, 'retida');
  });

  it('no agent claims it → sem_agente, and no model call happens', async () => {
    let chamou = false;
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: {
        async responder() {
          chamou = true;
          return 'x';
        },
      },
      pedido: 'deploy the cluster',
    });
    assert.equal(t.disposicao, 'sem_agente');
    assert.equal(chamou, false, 'a request nobody claims must not reach a model');
  });

  it('two agents claim it → ambigua, naming both', async () => {
    const t = await rodar({
      agentes: [ag([]), { ...ag([]), nome: 'outro', arquivo: 'agentes/outro.md' }],
      registro: criarRegistro({}),
      modelo: criarModeloFalso(),
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'ambigua');
    assert.match(String(t.motivo), /voz/);
    assert.match(String(t.motivo), /outro/);
  });

  it('the model throwing is erro_de_modelo with the output withheld', async () => {
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: {
        async responder() {
          throw new Error('429 from provider');
        },
      },
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'erro_de_modelo');
    assert.equal(t.saida, undefined);
    assert.match(String(t.motivo), /429/);
  });

  it('an empty model answer is a failure, not an empty success', async () => {
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: {
        async responder() {
          return '   ';
        },
      },
      pedido: 'use our brand voice',
    });
    assert.equal(t.disposicao, 'erro_de_modelo');
    assert.match(String(t.motivo), /empty/i);
  });

  it('the transcript carries every score, so the choice is explainable', async () => {
    const t = await rodarCom([]);
    assert.equal(t.pontuacoes.length, 1);
    assert.equal(t.agente, 'voz');
  });
});
