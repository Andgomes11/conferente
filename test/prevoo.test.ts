/**
 * O pré-voo: descobrir antes da chamada de modelo que nada poderá ser conferido.
 *
 * Toda linha da tabela de disposição é decidida DEPOIS que o modelo respondeu, e
 * isso é uma linha tarde demais para quem preferia não receber resposta não
 * conferida nenhuma. Um verificador que lê o critério do pedido já sabe antes: se
 * o pedido não lista termo proibido, nenhuma saída vai mudar isso.
 *
 * O pré-voo nunca aprova. A única resposta útil dele é `nao_deu_para_conferir`, e
 * ele é conselho por padrão — quem transforma conselho em contrato é
 * `--exigir-conferencia`, e é a única vez em que o harness retém por ausência em
 * vez de por falha, legítima exatamente porque foi pedida.
 *
 * Verificador sem pré-voo é tratado como capaz. Silêncio não é recusa, e o
 * harness não inventa uma recusa que o verificador não fez.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarRegistro } from '../src/verificacao/registro.ts';
import { naoDeuParaConferir, passou } from '../src/verificacao/veredito.ts';
import { rodar } from '../src/execucao/rodar.ts';
import { criarModeloFalso } from '../src/modelo/falso.ts';
import type { Agente } from '../src/agente/definicao.ts';

const ag = (verificadores: string[]): Agente => ({
  nome: 'voz',
  proposito: 'p',
  reivindica: ['brand voice'],
  verificadores,
  instrucao: 'i',
  arquivo: 'agentes/voz.md',
});

/**
 * Um verificador que só consegue conferir quando o pedido traz o critério.
 *
 * As duas metades dizem a mesma coisa de propósito. Um `preVoo` que anuncia "não
 * vou conseguir" ao lado de um `conferir` que devolve `passou` é um verificador
 * mentindo para si mesmo — e o harness acredita no `conferir`, porque é ele que
 * viu a saída. A primeira versão desta fixture tinha exatamente esse defeito, e
 * dois testes falharam por causa dela e não do código.
 */
const precisaDeCriterio = (nome: string) => {
  const semCriterio = (pedido: string) => !pedido.includes('forbidden:');
  const recusa = () => naoDeuParaConferir(nome, 'the request lists no forbidden terms');
  return {
    conferir: (_saida: string, pedido: string) => (semCriterio(pedido) ? recusa() : passou(nome)),
    preVoo: (pedido: string) => (semCriterio(pedido) ? recusa() : passou(nome)),
  };
};

describe('registro com pré-voo', () => {
  it('aceita função simples e objeto com preVoo lado a lado', async () => {
    const r = criarRegistro({ simples: () => passou('simples'), rico: precisaDeCriterio('rico') });
    const comCriterio = 'rewrite. forbidden: synergy';
    assert.equal((await r.conferir('simples', 'o', comCriterio)).estado, 'passou');
    assert.equal((await r.conferir('rico', 'o', comCriterio)).estado, 'passou');
    assert.deepEqual(r.nomes(), ['simples', 'rico']);
  });

  it('verificador sem preVoo é tratado como capaz — silêncio não é recusa', async () => {
    const r = criarRegistro({ simples: () => passou('simples') });
    assert.equal(await r.podeConferir('simples', 'qualquer pedido'), undefined);
  });

  it('preVoo que recusa devolve o veredito com o motivo', async () => {
    const r = criarRegistro({ rico: precisaDeCriterio('rico') });
    const v = await r.podeConferir('rico', 'rewrite this');
    assert.equal(v?.estado, 'nao_deu_para_conferir');
    assert.match(String(v?.motivo), /no forbidden terms/);
  });

  it('preVoo que aprova não é veredito — não aprova nada, só não impede', async () => {
    const r = criarRegistro({ rico: precisaDeCriterio('rico') });
    assert.equal(await r.podeConferir('rico', 'rewrite. forbidden: synergy'), undefined);
  });

  it('preVoo que lança vira nao_deu_para_conferir, nunca capaz', async () => {
    const r = criarRegistro({
      quebra: {
        conferir: () => passou('quebra'),
        preVoo: () => {
          throw new Error('style guide unreachable');
        },
      },
    });
    const v = await r.podeConferir('quebra', 'x');
    assert.equal(v?.estado, 'nao_deu_para_conferir');
    assert.match(String(v?.motivo), /style guide unreachable/);
  });

  it('nome não registrado é impedimento, não silêncio', async () => {
    const r = criarRegistro({});
    assert.equal((await r.podeConferir('inexistente', 'x'))?.estado, 'nao_deu_para_conferir');
  });
});

describe('rodar com pré-voo', () => {
  const rodarCom = (opcoes: { exigirConferencia?: boolean; pedido?: string } = {}) => {
    let chamou = false;
    const p = rodar({
      agentes: [ag(['rico'])],
      registro: criarRegistro({ rico: precisaDeCriterio('rico') }),
      modelo: {
        async responder() {
          chamou = true;
          return 'uma resposta';
        },
      },
      pedido: opcoes.pedido ?? 'use our brand voice',
      ...(opcoes.exigirConferencia === undefined
        ? {}
        : { exigirConferencia: opcoes.exigirConferencia }),
    });
    return p.then((t) => ({ t, chamou: () => chamou }));
  };

  it('o pré-voo entra na transcrição mesmo quando a rodada segue', async () => {
    const { t } = await rodarCom();
    assert.equal(t.preVoo.length, 1);
    assert.match(String(t.preVoo[0]?.motivo), /no forbidden terms/);
  });

  it('sem a exigência, a rodada segue e o rótulo conta a verdade', async () => {
    const { t, chamou } = await rodarCom();
    assert.equal(chamou(), true, 'sem a exigência o modelo é chamado');
    assert.equal(t.disposicao, 'nada_conferido');
    assert.equal(t.saida, 'uma resposta');
  });

  it('com a exigência, recusa ANTES de gastar a chamada de modelo', async () => {
    const { t, chamou } = await rodarCom({ exigirConferencia: true });
    assert.equal(chamou(), false, 'o modelo não pode ser chamado');
    assert.equal(t.disposicao, 'recusada_sem_conferencia');
    assert.equal(t.saida, undefined);
    assert.match(String(t.motivo), /no forbidden terms/);
  });

  it('com a exigência satisfeita, a rodada segue normalmente', async () => {
    const { t, chamou } = await rodarCom({
      exigirConferencia: true,
      pedido: 'use our brand voice. forbidden: synergy',
    });
    assert.equal(chamou(), true);
    assert.equal(t.disposicao, 'conferida');
  });

  it('a exigência não recusa quando ao menos uma checagem pode rodar', async () => {
    // Parcial é o suficiente: o contrato é "não responda o que não dá para
    // conferir", não "confira tudo".
    const t = await rodar({
      agentes: [ag(['rico', 'simples'])],
      registro: criarRegistro({ rico: precisaDeCriterio('rico'), simples: () => passou('simples') }),
      modelo: criarModeloFalso({ 'brand voice': 'resposta' }),
      pedido: 'use our brand voice',
      exigirConferencia: true,
    });
    assert.equal(t.disposicao, 'parcialmente_conferida');
  });

  it('agente sem checagem nenhuma é recusado sob a exigência', async () => {
    // Nada declarado é nada conferível. O rótulo NOT CHECKED já dizia isso; sob
    // a exigência, o caller pediu para não receber essa resposta.
    const t = await rodar({
      agentes: [ag([])],
      registro: criarRegistro({}),
      modelo: criarModeloFalso({ 'brand voice': 'resposta' }),
      pedido: 'use our brand voice',
      exigirConferencia: true,
    });
    assert.equal(t.disposicao, 'recusada_sem_conferencia');
    assert.match(String(t.motivo), /declares no checks/i);
  });
});
