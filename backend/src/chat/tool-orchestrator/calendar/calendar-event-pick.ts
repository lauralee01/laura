/**
 * Fuzzy title matching for pending calendar pick phases.
 * Prefer unique high-scoring matches; return null when ambiguous or weak
 * so the caller can ask the user to clarify (number / cancel).
 */

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Minimum score to accept a title pick from free text. */
const MIN_ACCEPT_SCORE = 45;

/** If the runner-up is within this margin, treat as ambiguous. */
const AMBIGUITY_MARGIN = 8;

export function scoreTitleMatch(query: string, title: string): number {
  const q = normalizeTitle(query);
  const t = normalizeTitle(title);

  if (!q || !t) {
    return 0;
  }

  if (q === t) {
    return 100;
  }

  /*
   * Exact containment: "dentist" in "Dentist Appointment", or the reverse for
   * short titles when the user types most of the title.
   */
  if (t.includes(q) || q.includes(t)) {
    const ratio =
      Math.min(q.length, t.length) / Math.max(q.length, t.length);
    return 70 + ratio * 25;
  }

  const queryWords = q.split(/\s+/).filter((w) => w.length >= 2);
  const titleWords = t.split(/\s+/).filter(Boolean);

  if (queryWords.length === 0) {
    return 0;
  }

  let hits = 0;
  for (const word of queryWords) {
    const matched = titleWords.some(
      (titleWord) =>
        titleWord === word ||
        titleWord.includes(word) ||
        word.includes(titleWord),
    );
    if (matched) {
      hits += 1;
    }
  }

  if (hits === 0) {
    return 0;
  }

  return (hits / queryWords.length) * 60;
}

/**
 * Returns the single best option when the user's message clearly names it.
 * Returns null for weak or ambiguous matches (caller should re-prompt).
 */
export function pickUniqueTitleMatch<T extends { title: string }>(
  message: string,
  options: T[],
): T | null {
  const cleaned = message.trim();
  if (!cleaned || /^\d+$/.test(cleaned)) {
    return null;
  }

  if (options.length === 0) {
    return null;
  }

  const scored = options
    .map((option) => ({
      option,
      score: scoreTitleMatch(cleaned, option.title),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < MIN_ACCEPT_SCORE) {
    return null;
  }

  const runnerUp = scored[1];
  if (
    runnerUp &&
    runnerUp.score >= MIN_ACCEPT_SCORE &&
    best.score - runnerUp.score <= AMBIGUITY_MARGIN
  ) {
    return null;
  }

  return best.option;
}
