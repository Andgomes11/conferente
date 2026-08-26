/**
 * The verifiers the example agents use.
 *
 * Each reads its criteria from the request — forbidden terms, required fields —
 * rather than from a list baked into the code. That keeps any organisation's
 * vocabulary out of this repository, and it is why the two that do so have a real
 * `nao_deu_para_conferir` path: no criteria in the request means nothing to check
 * against, and that is not a pass.
 *
 * The other two check the output's own shape — is there exactly one metric, is a
 * clause cited — and can therefore always reach a verdict. Absence of a `metric:`
 * line is a genuine failure to comply, not an inability to check.
 */
import { escaparRegex } from '../texto/regex.ts';
import { falhou, naoDeuParaConferir, passou, type Veredito } from './veredito.ts';
import type { Verificador } from './registro.ts';

/** Reads `chave: a, b, c` out of the request. */
function listaDoPedido(pedido: string, chave: string): string[] | undefined {
  const m = new RegExp(`${chave}\\s*:\\s*([^\\n]+)`, 'i').exec(pedido);
  if (!m?.[1]) return undefined;
  const itens = m[1]
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s !== '');
  return itens.length > 0 ? itens : undefined;
}

const termosProibidos: Verificador = (saida, pedido): Veredito => {
  const termos = listaDoPedido(pedido, 'forbidden');
  if (!termos) {
    return naoDeuParaConferir('termos-proibidos', 'the request lists no forbidden terms');
  }
  const achados = termos.filter((t) => saida.toLowerCase().includes(t));
  return achados.length === 0
    ? passou('termos-proibidos')
    : falhou('termos-proibidos', `output contains forbidden term(s): ${achados.join(', ')}`);
};

const camposObrigatorios: Verificador = (saida, pedido): Veredito => {
  const campos = listaDoPedido(pedido, 'required');
  if (!campos) {
    return naoDeuParaConferir('campos-obrigatorios', 'the request lists no required fields');
  }
  // The field name comes from the request, so it goes into the pattern escaped:
  // `cost (usd)` unescaped is a group that never matches its own literal text.
  const faltando = campos.filter(
    (c) => !new RegExp(`^\\s*${escaparRegex(c)}\\s*:`, 'im').test(saida),
  );
  return faltando.length === 0
    ? passou('campos-obrigatorios')
    : falhou('campos-obrigatorios', `missing field(s): ${faltando.join(', ')}`);
};

const metricaUnica: Verificador = (saida): Veredito => {
  const n = (saida.match(/^\s*metric\s*:/gim) ?? []).length;
  if (n === 0) return falhou('metrica-unica', 'no `metric:` line found');
  return n === 1
    ? passou('metrica-unica')
    : falhou('metrica-unica', `${n} metrics proposed; an experiment needs one`);
};

const citaClausula: Verificador = (saida): Veredito =>
  /clause\s+\S+/i.test(saida)
    ? passou('cita-clausula')
    : falhou('cita-clausula', 'output does not cite the guide clause it applied');

export const VERIFICADORES_EMBUTIDOS: Record<string, Verificador> = {
  'termos-proibidos': termosProibidos,
  'campos-obrigatorios': camposObrigatorios,
  'metrica-unica': metricaUnica,
  'cita-clausula': citaClausula,
};
