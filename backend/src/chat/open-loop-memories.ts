import type { MemoryService } from '../memory/memory.service';

/** Semantic query used by weekly review + accountability nudges. */
export const OPEN_LOOP_MEMORY_QUERY =
  'goals commitments plans unfinished follow-up open loops priorities';

export type OpenLoopMemoryHit = {
  id: number;
  content: string;
  createdAt: string;
  distance: number;
};

/**
 * Ranked open-loop-ish memories for rituals and soft nudges.
 * Failures resolve to [] so callers can degrade quietly.
 */
export async function searchOpenLoopMemories(
  memoryService: Pick<MemoryService, 'searchMemories'>,
  sessionId: string,
  topK = 6,
): Promise<OpenLoopMemoryHit[]> {
  try {
    const hits = await memoryService.searchMemories({
      userId: sessionId,
      query: OPEN_LOOP_MEMORY_QUERY,
      topK,
    });
    return hits.map((h) => ({
      id: h.id,
      content: h.content,
      createdAt: h.createdAt,
      distance: h.distance,
    }));
  } catch {
    return [];
  }
}
