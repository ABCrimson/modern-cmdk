// packages/modern-cmdk/src/core/search/default-scorer.ts
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

  // Early bailout: query longer than target can never fully match (fuzzy included)
  if (qLen > tLen) return null;

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
  // The cover is recursive, one frame per segment: a longer query is left to the fuzzy tier
  if (qLen > 512) return null;
  const matches: Array<readonly [number, number]> = [];
  failedFrom = undefined;
  squares = 0;
  if (!coverQuery(query, 0, lowerTarget, 0, matches)) return null;

  // Contiguity (squared segment lengths over qLen²) and coverage (qLen / tLen)
  // rank hits inside (0.65, 0.7), above every fuzzy score

  return {
    score: 0.65 + 0.03 * (squares / (qLen * qLen)) + 0.02 * (qLen / tLen),
    matches,
  };
}

// Per query index, the smallest `from` found to have no cover (a later `from` has none either);
// created on the first failure below the first segment
let failedFrom: number[] | undefined;
// Sum of the squared segment lengths of the cover
let squares = 0;

/**
 * Covers query[queryIdx..] with segments that each start at a word start at or after `from`,
 * stay inside one word and match contiguously. Each word start tries its longest run first, then
 * shorter ones, so the first cover found is the one a greedy scan finds whenever that succeeds.
 * Prepends the segments of the cover to `matches`, in order; charCode scan, no regex, no split.
 */
function coverQuery(
  query: string,
  queryIdx: number,
  lowerTarget: string,
  from: number,
  matches: Array<readonly [number, number]>,
): boolean {
  const end = failedFrom?.[queryIdx] ?? lowerTarget.length;
  for (let i = from; i < end; i++) {
    // Word start: position 0 or preceded by a separator
    if (
      (i === 0 || isWordSeparator(lowerTarget.charCodeAt(i - 1))) &&
      lowerTarget.charCodeAt(i) === query.charCodeAt(queryIdx)
    ) {
      // Longest contiguous run of matching characters within this word
      let run = 0;
      // (charCodeAt past either end is NaN, which equals nothing)
      while (
        !isWordSeparator(lowerTarget.charCodeAt(i + run)) &&
        lowerTarget.charCodeAt(i + run) === query.charCodeAt(queryIdx + run)
      ) {
        run++;
      }

      for (; run > 0; run--) {
        if (
          queryIdx + run === query.length ||
          coverQuery(query, queryIdx + run, lowerTarget, i + run, matches)
        ) {
          matches.unshift([i, i + run]);
          squares += run * run;
          return true;
        }
      }
    }
  }
  // The first segment's call runs once, so only deeper failures are worth recording
  if (queryIdx > 0 && from < end) {
    failedFrom ??= [];
    failedFrom[queryIdx] = from;
  }
  return false;
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
