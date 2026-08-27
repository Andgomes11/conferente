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
import type { NaoDeuParaConferir, Veredito } from '../verificacao/veredito.ts';
import type { Transcricao } from '../transcricao/transcricao.ts';

export interface OpcoesDeRodada {
  agentes: readonly Agente[];
  registro: Registro;
  modelo: ModeloAdapter;
  pedido: string;
  /**
   * "Do not answer what you cannot check."
   *
   * Off by default, because refusing to answer is a strong thing to do on the
   * caller's behalf without being asked. On, it turns the pre-flight from advice
   * into a contract: when nothing can be checked, the request is refused before
   * the model is called. It is the one place where this harness withholds for an
   * absence rather than a failure, and it is legitimate exactly because the
   * caller asked for it.
   */
  exigirConferencia?: boolean;
}

/** `verificador: motivo · verificador: motivo` — every reason, never just the first. */
const juntar = (vs: readonly Veredito[]): string =>
  vs.map((v) => `${v.verificador}: ${'motivo' in v ? v.motivo : ''}`).join(' · ');

export async function rodar({
  agentes,
  registro,
  modelo,
  pedido,
  exigirConferencia = false,
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
          preVoo: [],
          disposicao: 'sem_agente',
          motivo: 'no agent claims this request',
        }
      : {
          pedido,
          pontuacoes: escolha.pontuacoes,
          vereditos: [],
          preVoo: [],
          disposicao: 'ambigua',
          motivo: `more than one agent claims this request: ${escolha.empatados.join(', ')}`,
        };
  }

  const agente = escolha.agente;

  // Pré-voo, antes de qualquer gasto: o que já se sabe que não vai dar para
  // conferir, sabendo-se apenas o pedido.
  const preVoo: NaoDeuParaConferir[] = [];
  for (const nome of agente.verificadores) {
    const impedimento = await registro.podeConferir(nome, pedido);
    if (impedimento) preVoo.push(impedimento);
  }

  const base = { pedido, agente: agente.nome, pontuacoes: escolha.pontuacoes, preVoo };

  // Nada declarado, ou tudo declarado impedido: nada será conferido. Sem a
  // exigência isso vira rótulo depois da resposta; com ela, vira recusa agora,
  // e a chamada de modelo não acontece.
  const nadaConferivel =
    agente.verificadores.length === 0 || preVoo.length === agente.verificadores.length;
  if (exigirConferencia && nadaConferivel) {
    return {
      ...base,
      vereditos: [],
      disposicao: 'recusada_sem_conferencia',
      motivo:
        agente.verificadores.length === 0
          ? 'this agent declares no checks, and the caller required checking'
          : juntar(preVoo),
    };
  }

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
