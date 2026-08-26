/**
 * request → agent → model → verifiers → disposition.
 *
 * The disposition table is the product. Two rules in it are not defaults but
 * decisions: a single failure withholds the output entirely, and an agent with no
 * verifiers produces `nao_conferida` — never `conferida`. An agent without checks
 * is legitimate; presenting its output as checked is not.
 */
import type { Agente } from '../agente/definicao.ts';
import { escolher } from '../agente/selecao.ts';
import type { ModeloAdapter } from '../modelo/adaptador.ts';
import type { Registro } from '../verificacao/registro.ts';
import type { Veredito } from '../verificacao/veredito.ts';
import type { Transcricao } from '../transcricao/transcricao.ts';

export interface OpcoesDeRodada {
  agentes: readonly Agente[];
  registro: Registro;
  modelo: ModeloAdapter;
  pedido: string;
}

/** `verificador: motivo · verificador: motivo` — every reason, never just the first. */
const juntar = (vs: readonly Veredito[]): string =>
  vs.map((v) => `${v.verificador}: ${'motivo' in v ? v.motivo : ''}`).join(' · ');

export async function rodar({
  agentes,
  registro,
  modelo,
  pedido,
}: OpcoesDeRodada): Promise<Transcricao> {
  const escolha = escolher(agentes, pedido);

  if (!escolha.ok) {
    // A request nobody claims must not reach a model: a default agent answers
    // questions it was never built for, and the answer looks like any other.
    return escolha.motivo === 'nenhum'
      ? {
          pedido,
          pontuacoes: escolha.pontuacoes,
          vereditos: [],
          disposicao: 'sem_agente',
          motivo: 'no agent claims this request',
        }
      : {
          pedido,
          pontuacoes: escolha.pontuacoes,
          vereditos: [],
          disposicao: 'ambigua',
          motivo: `more than one agent claims this request: ${escolha.empatados.join(', ')}`,
        };
  }

  const agente = escolha.agente;
  const base = { pedido, agente: agente.nome, pontuacoes: escolha.pontuacoes };

  let saida: string;
  try {
    saida = await modelo.responder({ instrucao: agente.instrucao, pedido });
  } catch (e) {
    return {
      ...base,
      vereditos: [],
      disposicao: 'erro_de_modelo',
      motivo: e instanceof Error ? e.message : String(e),
    };
  }
  if (saida.trim() === '') {
    // An empty answer is a failure. Returning it as a success would be the
    // harness's own version of the defect it exists to prevent.
    return {
      ...base,
      vereditos: [],
      disposicao: 'erro_de_modelo',
      motivo: 'the model returned an empty answer',
    };
  }

  const vereditos: Veredito[] = [];
  for (const nome of agente.verificadores) {
    vereditos.push(await registro.conferir(nome, saida, pedido));
  }

  const falhas = vereditos.filter((v) => v.estado === 'falhou');
  if (falhas.length > 0) {
    // A failure outranks a could-not-check, and withholds the output entirely.
    return { ...base, vereditos, disposicao: 'retida', motivo: juntar(falhas) };
  }

  const naoDeu = vereditos.filter((v) => v.estado === 'nao_deu_para_conferir');
  if (naoDeu.length > 0) {
    // "Partially checked" asserts that some checking happened. When *every*
    // declared check failed to run, none did, and saying "partially" would be the
    // harness telling the caller a comforting thing that is not true — the exact
    // failure it exists to prevent. The design document's table said "some could
    // not check", which quietly assumed at least one had passed.
    //
    // The output still comes back, as it does for an agent that declares no
    // checks. Withholding is reserved for an actual failure, never for an absence
    // of information: this harness makes missing verification visible, it does not
    // punish the caller for it.
    const nenhuma = naoDeu.length === vereditos.length;
    return {
      ...base,
      vereditos,
      saida,
      disposicao: nenhuma ? 'nada_conferido' : 'parcialmente_conferida',
      motivo: juntar(naoDeu),
    };
  }

  if (vereditos.length === 0) {
    return {
      ...base,
      vereditos,
      saida,
      disposicao: 'nao_conferida',
      motivo: 'this agent declares no checks',
    };
  }

  return { ...base, vereditos, saida, disposicao: 'conferida' };
}
