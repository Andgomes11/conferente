/**
 * conferente — an agent harness that never presents unchecked output as checked.
 *
 *   npm run conferente -- agentes
 *   npm run conferente -- perguntar "<request>" [--resposta "<answer>"]
 *
 * The only model that ships is the deterministic fake, so the command works with
 * no API key and no network: a demo that needs a secret is a demo nobody runs. A
 * real provider is a file implementing `ModeloAdapter`, which has one method.
 *
 * `--resposta` supplies the answer directly and runs the checks on it. It exists
 * because the checking machinery is the product, and without it the demo cannot
 * show the machinery working: the unscripted fake never cites a clause, never
 * emits a `metric:` line and never fills a required field, so every single run
 * ends WITHHELD. The alternative was to script the fake so the demo looks good,
 * which is the kind of thing this project exists to refuse.
 */
import { carregarAgentes, validarVerificadores } from '../agente/carregar.ts';
import { criarRegistro } from '../verificacao/registro.ts';
import { VERIFICADORES_EMBUTIDOS } from '../verificacao/embutidos.ts';
import { criarModeloFalso } from '../modelo/falso.ts';
import type { ModeloAdapter } from '../modelo/adaptador.ts';
import { rodar } from '../execucao/rodar.ts';
import { renderizar } from '../transcricao/transcricao.ts';

const USO = 'usage: conferente [agentes | perguntar "<request>" [--resposta "<answer>"]] [--agentes <dir>]';

/** Flags that take a value, so the walk below knows to skip the value too. */
const COM_VALOR = new Set(['--agentes', '--resposta']);

/**
 * Split argv into flags and positionals in one pass.
 *
 * Written as a walk rather than `indexOf`, which finds the first occurrence of a
 * word and therefore mis-handles a request that repeats one.
 */
function lerArgs(argv: readonly string[]): { flags: Map<string, string>; livres: string[] } {
  const flags = new Map<string, string>();
  const livres: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (COM_VALOR.has(a)) {
      const v = argv[i + 1];
      if (v !== undefined) flags.set(a, v);
      i++;
    } else if (a.startsWith('--')) {
      flags.set(a, '');
    } else {
      livres.push(a);
    }
  }
  return { flags, livres };
}

const { flags, livres } = lerArgs(process.argv.slice(2));
const comando = livres[0];
const DIR = flags.get('--agentes') ?? 'agentes';

const { agentes, erros } = carregarAgentes(DIR);
const registro = criarRegistro(VERIFICADORES_EMBUTIDOS);
const errosDeVerificador = validarVerificadores(agentes, registro);

// Startup failures stop the process. A harness that runs with a broken agent file
// is a harness that silently skipped a declared check — which is the one thing it
// must never do.
if (erros.length > 0 || errosDeVerificador.length > 0) {
  console.error('\n  conferente cannot start:\n');
  for (const e of [...erros, ...errosDeVerificador]) console.error(`   · ${e}`);
  console.error('');
  process.exit(1);
}

if (comando === 'agentes') {
  console.log(`\n  ${agentes.length} agent(s) in ${DIR}\n`);
  for (const a of agentes) {
    console.log(`  ${a.nome}`);
    console.log(`    ${a.proposito}`);
    console.log(`    claims:  ${a.reivindica.join(', ')}`);
    console.log(
      `    checks:  ${
        a.verificadores.length > 0
          ? a.verificadores.join(', ')
          : 'none — its output is reported as NOT CHECKED'
      }`,
    );
    console.log('');
  }
  process.exit(0);
}

if (comando === 'perguntar') {
  const pedido = livres.slice(1).join(' ').trim();
  if (pedido === '') {
    console.error(USO);
    process.exit(1);
  }

  const fornecida = flags.get('--resposta');
  const modelo: ModeloAdapter =
    fornecida === undefined
      ? criarModeloFalso()
      : { async responder() { return fornecida; } };

  const t = await rodar({ agentes, registro, modelo, pedido });
  console.log(`\n${renderizar(t)}\n`);

  // 0 when an answer was produced, 1 when none was. Anything else would let a
  // script read a withheld answer, an ambiguous route or a model error as
  // success — the disposition is carried in the exit code, not only on screen.
  process.exit(t.saida === undefined ? 1 : 0);
}

console.error(USO);
process.exit(1);
