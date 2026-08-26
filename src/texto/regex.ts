/**
 * Escape a string for literal use inside a `RegExp`.
 *
 * One line, its own file, because it is needed in two places that are far apart —
 * the router builds a pattern from an agent's claim phrase, and a built-in
 * verifier builds one from a field name in the request — and both places had the
 * same bug for the same reason. Text that came from outside the code went into a
 * pattern as if it were a pattern.
 *
 * It fails in two ways, and the quieter one is worse. A metacharacter that
 * happens to be invalid regex throws, which at least announces itself. A
 * metacharacter that is valid regex silently matches the wrong thing: `cost (usd)`
 * as a pattern does not match the literal text `cost (usd)`, so a field that was
 * present read as missing and a correct answer got withheld.
 */
export const escaparRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
