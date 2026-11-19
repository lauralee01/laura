import { Injectable, Logger } from '@nestjs/common';
import { MemoryService } from '../memory/memory.service';
import { searchOpenLoopMemories } from './open-loop-memories';
import { SessionPreferencesService } from './session-preferences.service';

/** Cosine distance above this is too weak for a nudge. */
const MAX_DISTANCE = 0.45;

/** Don't re-show any nudge within this window (anti-nag). */
const COOLDOWN_MS = 18 * 60 * 60 * 1000;

/** Skip pure preference / identity facts that aren't actionable. */
const PREF_ONLY =
  /^(prefers|likes|dislikes|lives in|timezone|located in|name is|is named)\b/i;

export type AccountabilityNudgeSuggestion = {
  memoryId: number;
  label: string;
  prompt: string;
};

@Injectable()
export class AccountabilityNudgeService {
  private readonly logger = new Logger(AccountabilityNudgeService.name);

  constructor(
    private readonly memoryService: MemoryService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) {}

  /**
   * At most one soft empty-state nudge per cooldown window.
   * Marks the suggestion as shown when returned.
   */
  async getSuggestion(
    sessionId: string,
  ): Promise<AccountabilityNudgeSuggestion | null> {
    const sid = sessionId.trim();
    if (!sid) {
      return null;
    }

    const prior = await this.sessionPreferences.getAccountabilityNudge(sid);
    if (prior && Date.now() - prior.shownAt < COOLDOWN_MS) {
      return null;
    }

    const hits = await searchOpenLoopMemories(this.memoryService, sid, 5);
    const candidate = hits.find((h) => isActionableHit(h));
    if (!candidate) {
      return null;
    }

    const suggestion = buildSuggestion(candidate.id, candidate.content);

    try {
      await this.sessionPreferences.setAccountabilityNudge(sid, {
        memoryId: suggestion.memoryId,
        shownAt: Date.now(),
      });
    } catch (err) {
      this.logger.warn(
        `accountability nudge cooldown write failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return suggestion;
  }
}

function isActionableHit(hit: {
  content: string;
  distance: number;
}): boolean {
  const content = hit.content.trim();
  if (content.length < 12) {
    return false;
  }
  if (!Number.isFinite(hit.distance) || hit.distance > MAX_DISTANCE) {
    return false;
  }
  if (PREF_ONLY.test(content)) {
    return false;
  }
  return true;
}

function buildSuggestion(
  memoryId: number,
  content: string,
): AccountabilityNudgeSuggestion {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  const snippet = truncate(cleaned, 72);
  const labelSeed = truncate(cleaned, 36);
  return {
    memoryId,
    label: labelSeed.endsWith('?') ? labelSeed : `${labelSeed}?`,
    prompt: `You mentioned "${snippet}" — want help taking the next step?`,
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
