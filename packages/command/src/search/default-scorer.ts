// packages/command/src/search/default-scorer.ts
// Uses: Math.sumPrecise (ES2026), Iterator Helpers, toLocaleLowerCase

import type { CommandItem } from '../types.js';
import type { SearchResult } from './types.js';

/**
 * Scores a command item against a search query using multi-strategy matching:
 * exact, prefix, substring, word-boundary, and fuzzy. Returns null if no match.
 * Uses Math.sumPrecise (ES2026) for floating-point-safe score aggregation.
 */
export function scoreItem(query: string, item: CommandItem): SearchResult | null {
  if (query === '') {
    return { id: item.id, score: 1, matches: [] };
  }

  const lowerQuery = query.toLocaleLowerCase();
  const targets = [item.value, ...(item.keywords ?? [])];

  // Score each target and pick the best match — single-pass reduction avoids
  // materializing an intermediate array and extra Math.max + find passes
  let bestResult: { score: number; matches: Array<readonly [number, number]> } | null = null;

  targets.values().forEach((target) => {
    const result = scoreTarget(lowerQuery, target.toLocaleLowerCase());
    if (result != null && (bestResult == null || result.score > bestResult.score)) {
      bestResult = result;
      // Early termination: perfect score can't be beaten
      if (result.score >= 1) return;
    }
  });

  if (!bestResult) return null;

  // bestResult is narrowed to non-null by the guard above
  const { score, matches } = bestResult as NonNullable<typeof bestResult>;
  return { id: item.id, score, matches };
}

function scoreTarget(
  query: string,
  lowerTarget: string,
): { score: number; matches: Array<readonly [number, number]> } | null {
  if (lowerTarget.length === 0) return null;
  if (query.length === 0) return { score: 1, matches: [] };

  // Early bailout: query longer than target can never fully match
  if (query.length > lowerTarget.length) {
    return scoreFuzzy(query, lowerTarget);
  }

  // Exact match — highest score
  if (lowerTarget === query) {
    return { score: 1, matches: [[0, query.length]] };
  }

  // Starts-with match — very high score
  if (lowerTarget.startsWith(query)) {
    return { score: 0.9 + 0.1 * (query.length / lowerTarget.length), matches: [[0, query.length]] };
  }

  // Substring match — medium-high score with position bonus
  const substringIdx = lowerTarget.indexOf(query);
  if (substringIdx !== -1) {
    const positionBonus = 1 - substringIdx / lowerTarget.length;
    const lengthRatio = query.length / lowerTarget.length;
    return {
      score: 0.5 + 0.3 * positionBonus + 0.2 * lengthRatio,
      matches: [[substringIdx, substringIdx + query.length]],
    };
  }

  // Word boundary match — check if query matches start of words
  const wordBoundaryResult = scoreWordBoundary(query, lowerTarget);
  if (wordBoundaryResult) return wordBoundaryResult;

  // Character-by-character fuzzy match
  return scoreFuzzy(query, lowerTarget);
}

function scoreWordBoundary(
  query: string,
  lowerTarget: string,
): { score: number; matches: Array<readonly [number, number]> } | null {
  const words = lowerTarget.split(/[\s\-_./]+/);
  let queryIdx = 0;
  const matches: Array<readonly [number, number]> = [];
  let offset = 0;

  for (const word of words) {
    if (queryIdx >= query.length) break;

    const wordStart = lowerTarget.indexOf(word, offset);
    offset = wordStart + word.length;

    if (word.startsWith(query[queryIdx]!)) {
      const matchStart = wordStart;
      let matchLen = 0;

      while (
        queryIdx < query.length &&
        matchLen < word.length &&
        word[matchLen] === query[queryIdx]
      ) {
        queryIdx++;
        matchLen++;
      }

      matches.push([matchStart, matchStart + matchLen]);
    }
  }

  if (queryIdx !== query.length) return null;

  // Score based on how many query chars matched at word boundaries
  const scores = matches.map(([, end], i) => {
    const start = matches[i]?.[0];
    return (end - start) * 2; // Word boundary matches get 2x weight
  });

  // Math.sumPrecise (ES2026) — floating-point-safe score aggregation
  const totalScore = Math.sumPrecise(scores);
  const maxPossible = query.length * 2;

  return {
    score: 0.3 + 0.4 * (totalScore / maxPossible),
    matches,
  };
}

function scoreFuzzy(
  query: string,
  lowerTarget: string,
): { score: number; matches: Array<readonly [number, number]> } | null {
  let queryIdx = 0;
  let targetIdx = 0;
  const matches: Array<readonly [number, number]> = [];
  let currentMatchStart = -1;
  const segmentScores: number[] = [];

  while (queryIdx < query.length && targetIdx < lowerTarget.length) {
    if (query[queryIdx] === lowerTarget[targetIdx]) {
      if (currentMatchStart === -1) {
        currentMatchStart = targetIdx;
      }
      queryIdx++;
      targetIdx++;
    } else {
      if (currentMatchStart !== -1) {
        const segmentLen = targetIdx - currentMatchStart;
        matches.push([currentMatchStart, targetIdx]);
        // Contiguous match bonus — adjacent characters score higher (quadratic)
        segmentScores.push(segmentLen * segmentLen);
        currentMatchStart = -1;
      }
      targetIdx++;
    }
  }

  // Close any remaining match segment
  if (currentMatchStart !== -1) {
    const segmentLen = targetIdx - currentMatchStart;
    matches.push([currentMatchStart, targetIdx]);
    segmentScores.push(segmentLen * segmentLen);
  }

  // All query chars must be matched
  if (queryIdx !== query.length) return null;

  // Math.sumPrecise (ES2026) — avoids floating-point drift in score aggregation
  const contiguityScore = Math.sumPrecise(segmentScores);
  const maxContiguity = query.length * query.length;
  const contiguityRatio = contiguityScore / maxContiguity;

  // Position bonus — matches earlier in target are better
  const firstMatchPos = matches[0]?.[0] ?? 0;
  const positionBonus = 1 - firstMatchPos / lowerTarget.length;

  // Length ratio — longer queries matching shorter targets = better
  const lengthRatio = query.length / lowerTarget.length;

  const score = 0.1 + 0.3 * contiguityRatio + 0.15 * positionBonus + 0.1 * lengthRatio;

  return { score, matches };
}
