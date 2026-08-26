/**
 * A deliberately small frontmatter subset: `chave: valor` and `chave: [a, b]`.
 *
 * Small because the alternative is a YAML dependency for four fields, and
 * because a parser that guesses is worse than one that refuses: a silently
 * ignored line is an agent declaring a check nobody runs. Anything outside the
 * subset is an error naming the line number, so the person who wrote the file
 * learns where to look.
 */
export interface Frontmatter {
  campos: Record<string, string | string[]>;
  corpo: string;
}

const LINHA = /^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i;

export function lerFrontmatter(texto: string): Frontmatter | { erro: string } {
  const linhas = texto.split(/\r?\n/);
  if (linhas[0]?.trim() !== '---') {
    return { erro: 'missing opening `---` delimiter on the first line' };
  }
  const fim = linhas.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (fim === -1) return { erro: 'missing closing `---` delimiter' };

  const campos: Record<string, string | string[]> = {};
  for (let i = 1; i < fim; i++) {
    const linha = linhas[i]!;
    if (linha.trim() === '') continue;
    const m = LINHA.exec(linha);
    if (!m) {
      return {
        erro: `line ${i + 1} is outside the supported subset (\`chave: valor\` or \`chave: [a, b]\`): ${linha.trim()}`,
      };
    }
    const chave = m[1]!;
    const valor = m[2]!.trim();
    if (valor === '') {
      return {
        erro: `line ${i + 1}: field "${chave}" has no value; nested blocks are not supported`,
      };
    }
    if (valor.startsWith('[') && valor.endsWith(']')) {
      const dentro = valor.slice(1, -1).trim();
      campos[chave] =
        dentro === '' ? [] : dentro.split(',').map((s) => s.trim()).filter((s) => s !== '');
    } else {
      campos[chave] = valor;
    }
  }

  return { campos, corpo: linhas.slice(fim + 1).join('\n').trim() };
}
