import { Injectable } from '@nestjs/common';
import { GoogleOAuthService } from '../integrations/google/google-oauth.service';
import {
  coerceToolReply,
  type ActionReceipt,
  type ConfirmPrompt,
  type ToolReplyInput,
  type ToolReplyPayload,
} from './action-receipt.types';
import {
  formatCurrentDateTime,
  resolveSessionTimeZone,
} from './datetime-context';
import type { IntentEnvelope } from './intent/intent.types';
import { hasCalendarPending } from './pending-policy';
import { PendingRequestService } from './pending-request.service';
import { SessionPreferencesService } from './session-preferences.service';
import type { ToolPendingMap } from './session-pending.types';
import { ToolOrchestratorService } from './tool-orchestrator';

export type ToolRoutingInput = {
  sessionId: string;
  message: string;
  envelope?: IntentEnvelope;
  toolPending: ToolPendingMap;
  sessionTz: string | null;
  /** Prefetched session location (skips Redis in web search). */
  storedLocation: string | null;
  /**
   * Prefetched Google OAuth check (overlaps classify). When omitted,
   * isConnected is awaited only for Google intents.
   */
  googleConnected?: boolean;
  isGatedToolBlocked: boolean;
  isChatLikeIntent: boolean;
  /** When set, web-search synthesis streams tokens to the chat SSE. */
  onChunk?: (chunk: string) => void;
};

export type ToolRoutingResult = {
  text: string;
  /** True when tokens were already sent via onChunk (do not re-dump). */
  alreadyStreamed: boolean;
  /** Structured UI receipt for a completed tool action. */
  receipt?: ActionReceipt;
  /** Inline Confirm/Cancel chips for a pending yes/no tool turn. */
  confirmPrompt?: ConfirmPrompt;
};

/**
 * OAuth gate + pending priority + Stage-1 intent switch.
 * Keeps ChatService focused on classify / memory / LLM chat path.
 */
@Injectable()
export class ToolRoutingService {
  constructor(
    private readonly toolOrchestrator: ToolOrchestratorService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly sessionPreferences: SessionPreferencesService,
    private readonly googleOAuthService: GoogleOAuthService,
  ) { }

  async resolveToolReply(
    input: ToolRoutingInput,
  ): Promise<ToolRoutingResult | null> {
    const {
      sessionId,
      message,
      envelope,
      toolPending,
      sessionTz,
      storedLocation,
      googleConnected,
      isGatedToolBlocked,
      isChatLikeIntent,
      onChunk,
    } = input;

    /*
     * Box avoids TS control-flow treating nested assigns as unreachable
     * (toolReply would otherwise stay typed as never after null checks).
     */
    const replyBox: { value: ToolReplyPayload | null } = { value: null };
    let alreadyStreamed = false;
    const isEmailSendPending = Boolean(toolPending.email_send);
    const isEmailDraftPending = Boolean(toolPending.email_draft);

    const take = (value: ToolReplyInput | null | undefined) => {
      const next = coerceToolReply(value);
      if (next) {
        replyBox.value = next;
      }
    };

    const isGoogleIntent =
      envelope?.intent === 'calendar_list' ||
      envelope?.intent === 'calendar_create' ||
      envelope?.intent === 'calendar_update' ||
      envelope?.intent === 'calendar_delete' ||
      envelope?.intent === 'morning_briefing' ||
      envelope?.intent === 'email_draft' ||
      envelope?.intent === 'email_draft_revise' ||
      envelope?.intent === 'email_draft_delete';

    if (isGoogleIntent && sessionId && replyBox.value === null) {
      const isConnected =
        googleConnected !== undefined
          ? googleConnected
          : await this.googleOAuthService.isConnected(sessionId);
      if (!isConnected) {
        const action =
          envelope?.intent === 'email_draft' ||
          envelope?.intent === 'email_draft_revise' ||
          envelope?.intent === 'email_draft_delete'
            ? 'use Gmail'
            : 'access Google Calendar';
        take(
          `I couldn't ${action}. Google is not connected for this session. ` +
            `Use 'Connect Google' in the app, then try again.`,
        );

        if (envelope?.intent === 'email_draft') {
          await this.pendingRequestService.clearPending(
            sessionId,
            'email_draft',
          );
        }
      }
    }

    if (isEmailSendPending && replyBox.value === null) {
      if (envelope) {
        const routed = await this.toolOrchestrator.tryLlmRoutedEmail(
          sessionId,
          message,
          envelope,
        );
        if (routed !== null) {
          take(routed);
        }
      }
      if (replyBox.value === null) {
        const pendingSend =
          await this.toolOrchestrator.handlePendingEmailSendTurn(
            sessionId,
            message,
            envelope,
          );
        if (pendingSend !== null) {
          take(pendingSend);
        }
      }
    }

    /*
     * Resume email_draft without requiring the classifier to emit email_draft
     * again (e.g. user just replies with "jane@x.com").
     */
    if (
      isEmailDraftPending &&
      replyBox.value === null &&
      !isEmailSendPending
    ) {
      take(
        await this.toolOrchestrator.handleEmailDraftIntent(
          sessionId,
          message,
          envelope,
        ),
      );
    }

    if (hasCalendarPending(toolPending) && replyBox.value === null) {
      const pending = await this.toolOrchestrator.tryHandle(
        sessionId,
        message,
        envelope,
      );
      if (pending !== null) {
        take(pending);
      }
    }

    if (replyBox.value === null && !isGatedToolBlocked) {
      switch (envelope?.intent) {
        case 'current_datetime': {
          const timeZone = resolveSessionTimeZone(sessionTz);
          const formatted = formatCurrentDateTime(timeZone);
          take(
            `The current date and time in ${timeZone} is ${formatted}.`,
          );
          break;
        }
        case 'web_search': {
          const searchResult =
            await this.toolOrchestrator.handleWebSearchIntent(
              sessionId,
              message,
              envelope,
              onChunk,
              { location: storedLocation, timeZone: sessionTz },
            );
          if (searchResult.kind === 'needs_location') {
            await this.sessionPreferences.setPendingAction(sessionId, {
              type: 'web_search_missing_location',
              message,
              envelope,
            });
            take('Which town or city should I use for this search?');
          } else {
            take(searchResult.text);
            alreadyStreamed = Boolean(searchResult.streamed);
          }
          break;
        }
        case 'calendar_list': {
          take(
            await this.toolOrchestrator.handleCalendarListIntent(
              sessionId,
              envelope,
            ),
          );
          break;
        }
        case 'morning_briefing': {
          take(
            await this.toolOrchestrator.handleMorningBriefingIntent(
              sessionId,
              sessionTz,
              storedLocation,
            ),
          );
          break;
        }
        case 'calendar_create': {
          take(
            await this.toolOrchestrator.handleCalendarCreateIntent(
              sessionId,
              message,
              envelope,
            ),
          );
          break;
        }
        case 'calendar_update':
        case 'calendar_delete': {
          take(
            await this.toolOrchestrator.handleCalendarMutationIntent(
              sessionId,
              message,
              envelope,
            ),
          );
          break;
        }
        case 'email_draft': {
          if (!isEmailSendPending) {
            take(
              await this.toolOrchestrator.handleEmailDraftIntent(
                sessionId,
                message,
                envelope,
              ),
            );
          }
          break;
        }
        case 'email_draft_revise':
        case 'email_draft_delete': {
          if (envelope) {
            take(
              await this.toolOrchestrator.handleEmailDraftFollowUp(
                sessionId,
                message,
                envelope,
              ),
            );
          }
          break;
        }
      }
    }

    /*
     * Canned rephrase only for destructive tools with known-low confidence.
     * `clarify` falls through to the chat LLM so Laura can ask one precise question.
     */
    if (replyBox.value === null && isGatedToolBlocked) {
      take(
        'I did not fully catch that. Could you rephrase what you want me to do? ',
      );
    }

    if (replyBox.value === null && !isChatLikeIntent) {
      const fallback = await this.toolOrchestrator.tryHandle(
        sessionId,
        message,
        envelope,
      );
      if (fallback !== null) {
        take(fallback);
      }
    }

    if (replyBox.value === null) {
      return null;
    }

    return {
      text: replyBox.value.text,
      alreadyStreamed,
      receipt: replyBox.value.receipt,
      confirmPrompt: replyBox.value.confirmPrompt,
    };
  }
}
