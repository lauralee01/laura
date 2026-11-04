import { Injectable } from '@nestjs/common';
import { GoogleOAuthService } from '../integrations/google/google-oauth.service';
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
  isGatedToolBlocked: boolean;
  isChatLikeIntent: boolean;
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
  ): Promise<string | null> {
    const {
      sessionId,
      message,
      envelope,
      toolPending,
      sessionTz,
      isGatedToolBlocked,
      isChatLikeIntent,
    } = input;

    let toolReply: string | null = null;
    const isEmailSendPending = Boolean(toolPending.email_send);
    const isEmailDraftPending = Boolean(toolPending.email_draft);

    const isGoogleIntent =
      envelope?.intent === 'calendar_list' ||
      envelope?.intent === 'calendar_create' ||
      envelope?.intent === 'calendar_update' ||
      envelope?.intent === 'calendar_delete' ||
      envelope?.intent === 'email_draft';

    if (isGoogleIntent && sessionId && toolReply === null) {
      const isConnected =
        await this.googleOAuthService.isConnected(sessionId);
      if (!isConnected) {
        const action =
          envelope?.intent === 'email_draft'
            ? 'create the Gmail draft'
            : 'access Google Calendar';
        toolReply =
          `I couldn't ${action}. Google is not connected for this session. ` +
          `Use 'Connect Google' in the app, then try again.`;

        if (envelope?.intent === 'email_draft') {
          await this.pendingRequestService.clearPending(
            sessionId,
            'email_draft',
          );
        }
      }
    }

    if (isEmailSendPending && toolReply === null) {
      if (envelope) {
        toolReply = await this.toolOrchestrator.tryLlmRoutedEmail(
          sessionId,
          message,
          envelope,
        );
      }
      if (toolReply === null) {
        toolReply =
          await this.toolOrchestrator.handlePendingEmailSendTurn(
            sessionId,
            message,
            envelope,
          );
      }
    }

    /*
     * Resume email_draft without requiring the classifier to emit email_draft
     * again (e.g. user just replies with "jane@x.com").
     */
    if (
      isEmailDraftPending &&
      toolReply === null &&
      !isEmailSendPending
    ) {
      toolReply = await this.toolOrchestrator.handleEmailDraftIntent(
        sessionId,
        message,
        envelope,
      );
    }

    if (hasCalendarPending(toolPending) && toolReply === null) {
      toolReply = await this.toolOrchestrator.tryHandle(
        sessionId,
        message,
        envelope,
      );
    }

    if (toolReply === null && !isGatedToolBlocked) {
      switch (envelope?.intent) {
        case 'current_datetime': {
          const timeZone = resolveSessionTimeZone(sessionTz);
          const formatted = formatCurrentDateTime(timeZone);
          toolReply =
            `The current date and time in ${timeZone} is ${formatted}.`;
          break;
        }
        case 'web_search': {
          const searchResult =
            await this.toolOrchestrator.handleWebSearchIntent(
              sessionId,
              message,
              envelope,
            );
          if (searchResult.kind === 'needs_location') {
            await this.sessionPreferences.setPendingAction(sessionId, {
              type: 'web_search_missing_location',
              message,
              envelope,
            });
            toolReply =
              'Which town or city should I use for this search?';
          } else {
            toolReply = searchResult.text;
          }
          break;
        }
        case 'calendar_list': {
          toolReply =
            await this.toolOrchestrator.handleCalendarListIntent(
              sessionId,
              envelope,
            );
          break;
        }
        case 'calendar_create': {
          toolReply =
            await this.toolOrchestrator.handleCalendarCreateIntent(
              sessionId,
              message,
              envelope,
            );
          break;
        }
        case 'calendar_update':
        case 'calendar_delete': {
          toolReply =
            await this.toolOrchestrator.handleCalendarMutationIntent(
              sessionId,
              message,
              envelope,
            );
          break;
        }
        case 'email_draft': {
          if (!isEmailSendPending) {
            toolReply =
              await this.toolOrchestrator.handleEmailDraftIntent(
                sessionId,
                message,
                envelope,
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
    if (toolReply === null && isGatedToolBlocked) {
      toolReply =
        'I did not fully catch that. Could you rephrase what you want me to do? ';
    }

    if (toolReply === null && !isChatLikeIntent) {
      toolReply = await this.toolOrchestrator.tryHandle(
        sessionId,
        message,
        envelope,
      );
    }

    return toolReply;
  }
}
