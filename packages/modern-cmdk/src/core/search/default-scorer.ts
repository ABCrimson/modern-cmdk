// packages/command/src/search/default-scorer.ts
// Hot-path optimized: toLowerCase (not locale), inline iteration, no regex split,
// plain arithmetic (no Math.sumPrecise on 2-5 values), zero unnecessary allocations.
// Items validated at itemId() creation — no isWellFormed() re-checks in scoring.

import type { CommandItem } from '../types.js';
import type { SearchResult } from './types.js';

// ── Word boundary detection via charCode — no regex, no split, no allocation ──
function isWordSeparator(code: number): boolean {
  // space(32) tab(9) hyphen(45) underscore(95) period(46) slash(47) backslash(92)
  return (
    code === 32 ||
    code === 9 ||
    code === 45 ||
    code === 95 ||
    code === 46 ||
    code === 47 ||
    code === 92
  );
}

/**
 * Public API: scores a command item against a search query.
 * Multi-strategy: exact → prefix → substring → word-boundary → fuzzy.
 * Returns null if no match. For batch use, prefer the search engine
 * which pre-caches lowercase and normalizes query once.
 */
export function scoreItem(query: string, item: CommandItem): SearchResult | null {
  if (query === '') {
    return { id: item.id, score: 1, matches: [] };
  }

  const lowerQuery = query.toLowerCase();

  // Inline target iteration — no array allocation
  // Score value first, then keywords, keep best
  let bestScore = 0;
  let bestMatches: Array<readonly [number, number]> | null = null;

  const valueResult = scoreTarget(lowerQuery, item.value.toLowerCase());
  if (valueResult !== null) {
    bestScore = valueResult.score;
    bestMatches = valueResult.matches;
    if (bestScore >= 1) return { id: item.id, score: 1, matches: bestMatches };
  }

  const kw = item.keywords;
  if (kw !== undefined) {
    for (let i = 0; i < kw.length; i++) {
      const result = scoreTarget(lowerQuery, (kw[i] as string).toLowerCase());
      if (result !== null && result.score > bestScore) {
        bestScore = result.score;
        bestMatches = result.matches;
        if (bestScore >= 1) break;
      }
    }
  }

  return bestMatches !== null ? { id: item.id, score: bestScore, matches: bestMatches } : null;
}

/**
 * Internal fast path: called by search engine with pre-lowered query and targets.
 * Eliminates all toLowerCase() calls on the hot path.
 */
export function scoreItemPreLowered(
  lowerQuery: string,
  id: import('../types.js').ItemId,
  lowerValue: string,
  lowerKeywords: readonly string[] | undefined,
): SearchResult | null {
  let bestScore = 0;
  let bestMatches: Array<readonly [number, number]> | null = null;

  const valueResult = scoreTarget(lowerQuery, lowerValue);
  if (valueResult !== null) {
    bestScore = valueResult.score;
    bestMatches = valueResult.matches;
    if (bestScore >= 1) return { id, score: 1, matches: bestMatches };
  }

  if (lowerKeywords !== undefined) {
    for (let i = 0; i < lowerKeywords.length; i++) {
      const result = scoreTarget(lowerQuery, lowerKeywords[i] as string);
      if (result !== null && result.score > bestScore) {
        bestScore = result.score;
        bestMatches = result.matches;
        if (bestScore >= 1) break;
      }
    }
  }

  return bestMatches !== null ? { id, score: bestScore, matches: bestMatches } : null;
}

function scoreTarget(
  query: string,
  lowerTarget: string,
): { score: number; matches: Array<readonly [number, number]> } | null {
  const tLen = lowerTarget.length;
  if (tLen === 0) return null;

  const qLen = query.length;
  if (qLen === 0) return { score: 1, matches: [] };

  // Early bailout: query longer than target can never fully match
  if (qLen > tLen) {
    return scoreFuzzy(query, qLen, lowerTarget, tLen);
  }

  // Exact match — highest score
  if (lowerTarget === query) {
    return { score: 1, matches: [[0, qLen]] };
  }

  // Starts-with match — very high score
  if (lowerTarget.startsWith(query)) {
    return { score: 0.9 + 0.1 * (qLen / tLen), matches: [[0, qLen]] };
  }

  // Substring match — medium-high score with position bonus
  const substringIdx = lowerTarget.indexOf(query);
  if (substringIdx !== -1) {
    const positionBonus = 1 - substringIdx / tLen;
    const lengthRatio = qLen / tLen;
    return {
      score: 0.5 + 0.3 * positionBonus + 0.2 * lengthRatio,
      matches: [[substringIdx, substringIdx + qLen]],
    };
  }

  // Word boundary match — charCode scan, no regex, no split
  const wordBoundaryResult = scoreWordBoundary(query, qLen, lowerTarget, tLen);
  if (wordBoundaryResult) return wordBoundaryResult;

  // Character-by-character fuzzy match
  return scoreFuzzy(query, qLen, lowerTarget, tLen);
}

function scoreWordBoundary(
  query: string,
  qLen: number,
  lowerTarget: string,
  tLen: number,
): { score: number; matches: Array<readonly [number, number]> } | null {
  let queryIdx = 0;
  const matches: Array<readonly [number, number]> = [];
  let totalWeightedLen = 0;

  // Scan for word starts using charCode — zero allocation
  let i = 0;
  while (i < tLen && queryIdx < qLen) {
    // Detect word start: position 0 or preceded by separator
    const atWordStart = i === 0 || isWordSeparator(lowerTarget.charCodeAt(i - 1));

    if (atWordStart && lowerTarget.charCodeAt(i) === query.charCodeAt(queryIdx)) {
      const matchStart = i;
      let matchLen = 0;

      // Consume contiguous matching characters within this word
      while (
        queryIdx < qLen &&
        i < tLen &&
        !isWordSeparator(lowerTarget.charCodeAt(i)) &&
        lowerTarget.charCodeAt(i) === query.charCodeAt(queryIdx)
      ) {
        queryIdx++;
        i++;
        matchLen++;
      }

      matches.push([matchStart, matchStart + matchLen]);
      totalWeightedLen += matchLen * 2; // Word boundary matches get 2x weight
    } else {
      i++;
    }
  }

  if (queryIdx !== qLen) return null;

  const maxPossible = qLen * 2;

  return {
    score: 0.3 + 0.4 * (totalWeightedLen / maxPossible),
    matches,
  };
}

function scoreFuzzy(
  query: string,
  qLen: number,
  lowerTarget: string,
  tLen: number,
): { score: number; matches: Array<readonly [number, number]> } | null {
  let queryIdx = 0;
  let targetIdx = 0;
  const matches: Array<readonly [number, number]> = [];
  let currentMatchStart = -1;
  let contiguityScore = 0;

  while (queryIdx < qLen && targetIdx < tLen) {
    if (query.charCodeAt(queryIdx) === lowerTarget.charCodeAt(targetIdx)) {
      if (currentMatchStart === -1) {
        currentMatchStart = targetIdx;
      }
      queryIdx++;
      targetIdx++;
    } else {
      if (currentMatchStart !== -1) {
        const segmentLen = targetIdx - currentMatchStart;
        matches.push([currentMatchStart, targetIdx]);
        contiguityScore += segmentLen * segmentLen;
        currentMatchStart = -1;
      }
      targetIdx++;
    }
  }

  // Close any remaining match segment
  if (currentMatchStart !== -1) {
    const segmentLen = targetIdx - currentMatchStart;
    matches.push([currentMatchStart, targetIdx]);
    contiguityScore += segmentLen * segmentLen;
  }

  // All query chars must be matched
  if (queryIdx !== qLen) return null;

  const maxContiguity = qLen * qLen;
  const contiguityRatio = contiguityScore / maxContiguity;

  // Position bonus — matches earlier in target are better
  const firstMatchPos = matches[0]?.[0] ?? 0;
  const positionBonus = 1 - firstMatchPos / tLen;

  // Length ratio — longer queries matching shorter targets = better
  const lengthRatio = qLen / tLen;

  const score = 0.1 + 0.3 * contiguityRatio + 0.15 * positionBonus + 0.1 * lengthRatio;

  return { score, matches };
}
