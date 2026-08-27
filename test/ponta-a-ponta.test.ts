/**
 * One run through the real pieces, with the fake model — the only test here that
 * would catch a wiring mistake between modules that are each individually
 * correct.
 *
 * It asserts the rendered text, not just the disposition, because the label is
 * the product: a person reading the output has to see "NOT CHECKED" before they
 * see the answer.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarAgentes, validarVerificadores } from '../src/agente/carregar.ts';
import { criarRegistro } from '../src/verificacao/registro.ts';
import { VERIFICADORES_EMBUTIDOS } from '../src/verificacao/embutidos.ts';
import { criarModeloFalso } from '../src/modelo/falso.ts';
import { rodar } from '../src/execucao/rodar.ts';
import { renderizar } from '../src/transcricao/transcricao.ts';

const montar = () => {
  const { agentes, erros } = carregarAgentes('agentes');
  assert.deepEqual(erros, [], 'the shipped agent files must load cleanly');
  const registro = criarRegistro(VERIFICADORES_EMBUTIDOS);
  assert.deepEqual(
    validarVerificadores(agentes, registro),
    [],
    'every declared verifier must resolve',
  );
  return { agentes, registro };
};

describe('ponta a ponta', () => {
  it('the shipped agents load and every verifier they name resolves', () => {
    montar();
  });

  it('a checked answer leads with CHECKED', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4 applied: we write plainly.' }),
      pedido: 'rewrite this in our brand voice. forbidden: synergy, leverage',
    });
    assert.equal(t.disposicao, 'conferida');
    assert.match(renderizar(t), /^\[CHECKED\]/);
  });

  it('a forbidden term withholds the output', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4: great synergy ahead.' }),
      pedido: 'rewrite this in our brand voice. forbidden: synergy',
    });
    assert.equal(t.disposicao, 'retida');
    const texto = renderizar(t);
    assert.match(texto, /^\[WITHHELD\]/);
    assert.ok(!texto.includes('synergy ahead'), 'withheld output must not be printed');
  });

  it('no criteria in the request yields PARTIALLY CHECKED, not CHECKED', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'brand voice': 'clause 4 applied: plain words.' }),
      pedido: 'rewrite this in our brand voice',
    });
    assert.equal(t.disposicao, 'parcialmente_conferida');
    assert.match(renderizar(t), /PARTIALLY CHECKED/);
    assert.match(renderizar(t), /no forbidden terms/i);
  });

  it('a shipped agent declares no checks, so NOT CHECKED is reproducible', async () => {
    // The README prints a `[NOT CHECKED]` transcript, and for a while no shipped
    // agent could produce one — every example declared checks. A README showing
    // output a reader cannot reproduce is the wrong kind of gap for this project
    // in particular.
    //
    // It also demonstrates the claim the disposition table rests on: an agent
    // with no checks is legitimate. What is not legitimate is presenting its
    // output as checked.
    const { agentes, registro } = montar();
    const semChecagem = agentes.filter((a) => a.verificadores.length === 0);
    assert.ok(semChecagem.length > 0, 'at least one shipped agent must declare no checks');

    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso({ 'first draft': 'here is an answer nobody checked.' }),
      pedido: 'give me a first draft',
    });
    assert.equal(t.disposicao, 'nao_conferida');
    assert.equal(t.saida, 'here is an answer nobody checked.');
    assert.match(renderizar(t), /^\[NOT CHECKED\]/);
    assert.match(renderizar(t), /no checks were declared/);
  });

  it('an unclaimed request never reaches the model', async () => {
    const { agentes, registro } = montar();
    const t = await rodar({
      agentes,
      registro,
      modelo: criarModeloFalso(),
      pedido: 'restart the database',
    });
    assert.equal(t.disposicao, 'sem_agente');
    assert.match(renderizar(t), /NO AGENT CLAIMS THIS/);
  });
});
