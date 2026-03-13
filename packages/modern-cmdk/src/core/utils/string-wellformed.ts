// packages/command/src/core/utils/string-wellformed.ts
// Cross-browser replacement for String.isWellFormed() / String.toWellFormed() (ES2024+)
// Explicit return types required by isolatedDeclarations

/**
 * Regex matching lone surrogates (unpaired high or low surrogates).
 * A lone high surrogate (U+D800–U+DBFF) not followed by a low surrogate,
 * or a lone low surrogate (U+DC00–U+DFFF) not preceded by a high surrogate.
 */
const LONE_SURROGATE_RE: RegExp = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Unicode replacement character used to replace lone surrogates. */
const REPLACEMENT_CHAR = '\uFFFD';

/**
 * Ensures a string is well-formed Unicode by replacing lone surrogates
 * with the Unicode replacement character (U+FFFD).
 * Cross-browser replacement for `str.isWellFormed() ? str : str.toWellFormed()`.
 */
export function ensureWellFormed(str: string): string {
  return str.replace(LONE_SURROGATE_RE, REPLACEMENT_CHAR);
}
