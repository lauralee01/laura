import { Injectable, Logger } from '@nestjs/common';
import {
  formatCurrentDateTime,
  resolveSessionTimeZone,
} from '../../datetime-context';
import { ChatHistoryService } from '../../chat-history.service';
import { MemoryService } from '../../../memory/memory.service';
import { searchOpenLoopMemories } from '../../open-loop-memories';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CHAT_LINES = 8;
const MAX_MEMORY_LINES = 6;

@Injectable()
export class WeeklyReviewHandler {
  private readonly logger = new Logger(WeeklyReviewHandler.name);

  constructor(
    private readonly chatHistory: ChatHistoryService,
    private readonly memoryService: MemoryService,
  ) {}

  async handleWeeklyReview(
    sessionId: string,
    sessionTz: string | null,
  ): Promise<string> {
    const timeZone = resolveSessionTimeZone(sessionTz);
    const now = new Date();
    const formattedNow = formatCurrentDateTime(timeZone, now);
    const weekStart = new Date(now.getTime() - WEEK_MS);

    const [chatSection, memorySection] = await Promise.all([
      this.buildChatSection(sessionId, weekStart),
      this.buildMemorySection(sessionId, now),
    ]);

    const sections: string[] = [
      `Here's your weekly review.`,
      ``,
      `**This week**`,
      `${formattedNow} (${timeZone})`,
      `Looking back over the last 7 days.`,
      ``,
      `**Chats**`,
      chatSection,
      ``,
      `**What I've been holding onto**`,
      memorySection,
      ``,
      `**Goals**`,
      `Structured weekly goals aren't set up yet — tell me 1–3 focuses for next week and I'll remember them.`,
      ``,
      `**Close the loop**`,
      `1. What actually mattered this week?`,
      `2. What's still open?`,
      `3. What's the one focus for next week?`,
      ``,
      `Reply with any of those — I'll help you capture it, break it down, or set the next step.`,
    ];

    return sections.join('\n');
  }

  private async buildChatSection(
    sessionId: string,
    weekStart: Date,
  ): Promise<string> {
    try {
      const conversations = await this.chatHistory.listConversations(sessionId);
      const recent = conversations
        .filter((c) => new Date(c.updatedAt).getTime() >= weekStart.getTime())
        .slice(0, MAX_CHAT_LINES);

      if (recent.length === 0) {
        return `No chats in the last 7 days yet — we can still review what I remember.`;
      }

      return recent
        .map((c) => {
          const when = formatShortDay(c.updatedAt);
          const preview = truncate(c.preview.replace(/\s+/g, ' '), 64);
          return `- ${preview} _(updated ${when})_`;
        })
        .join('\n');
    } catch (err) {
      this.logger.warn(
        `weekly review chats failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `I couldn't load this week's chats right now.`;
    }
  }

  private async buildMemorySection(
    sessionId: string,
    now: Date,
  ): Promise<string> {
    try {
      const [listed, searched] = await Promise.all([
        this.memoryService.listMemories(sessionId),
        searchOpenLoopMemories(
          this.memoryService,
          sessionId,
          MAX_MEMORY_LINES,
        ),
      ]);

      const cutoff = now.getTime() - MEMORY_LOOKBACK_MS;
      const recent = listed.filter(
        (m) => new Date(m.createdAt).getTime() >= cutoff,
      );

      const byId = new Map<number, string>();
      for (const m of searched) {
        byId.set(m.id, m.content);
      }
      for (const m of recent) {
        byId.set(m.id, m.content);
      }

      const lines = [...byId.values()]
        .map((content) => truncate(content.replace(/\s+/g, ' '), 120))
        .slice(0, MAX_MEMORY_LINES);

      if (lines.length === 0) {
        return `Nothing stored yet — share what's on your mind and I'll keep the useful bits.`;
      }

      return lines.map((line) => `- ${line}`).join('\n');
    } catch (err) {
      this.logger.warn(
        `weekly review memories failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return `I couldn't load memories right now.`;
    }
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatShortDay(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return 'recently';
  }
}
