import { Injectable } from '@nestjs/common';
import { EmailService } from '../../../integrations/email/email.service';
import { LlmService } from '../../../llm/llm.service';
import type { ToolReplyInput } from '../../action-receipt.types';
import { PendingRequestService } from '../../pending-request.service';
import { SessionPreferencesService } from '../../session-preferences.service';
import type { IntentEnvelope } from '../../intent/intent.types';
import type { PendingEmailSendPayload } from '../tool-orchestrator.types';
import {
  continuePendingEmailDraft,
  startEmailDraft,
  type EmailDraftFlowDeps,
} from './email-draft-flow';
import type { PendingEmailDraftPayload } from './email-draft.types';
import {
  handleEmailDraftFollowUp,
  handlePendingEmailSendTurn,
  type EmailSendFlowDeps,
} from './email-send-flow';
import { isEmailDraftDeleteRequest } from './email-utils';

export { isEmailDraftDeleteRequest } from './email-utils';

@Injectable()
export class EmailToolHandler {
  constructor(
    private readonly llmService: LlmService,
    private readonly emailService: EmailService,
    private readonly pendingRequestService: PendingRequestService,
    private readonly sessionPreferences: SessionPreferencesService,
  ) {}

  private draftDeps(): EmailDraftFlowDeps {
    return {
      llmService: this.llmService,
      emailService: this.emailService,
      pendingRequestService: this.pendingRequestService,
      sessionPreferences: this.sessionPreferences,
    };
  }

  private sendDeps(): EmailSendFlowDeps {
    return {
      emailService: this.emailService,
      pendingRequestService: this.pendingRequestService,
      sessionPreferences: this.sessionPreferences,
    };
  }

  async handleEmailDraftIntent(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
    conversationId?: string,
  ): Promise<ToolReplyInput> {
    const pendingDraft =
      await this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return continuePendingEmailDraft(
        this.draftDeps(),
        sessionId,
        message,
        pendingDraft,
        envelope,
        conversationId,
      );
    }

    return startEmailDraft(
      this.draftDeps(),
      sessionId,
      message,
      envelope,
      conversationId,
    );
  }

  handlePendingEmailSendTurn(
    sessionId: string,
    message: string,
    envelope?: IntentEnvelope,
  ): Promise<ToolReplyInput | null> {
    return handlePendingEmailSendTurn(
      this.sendDeps(),
      sessionId,
      message,
      envelope,
    );
  }

  handleEmailDraftFollowUp(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
    _conversationId?: string,
  ): Promise<ToolReplyInput> {
    return handleEmailDraftFollowUp(
      this.sendDeps(),
      sessionId,
      message,
      envelope,
    );
  }

  async tryLlmRoutedEmail(
    sessionId: string,
    message: string,
    envelope: IntentEnvelope,
    conversationId?: string,
  ): Promise<ToolReplyInput | null> {
    const pendingDraft =
      await this.pendingRequestService.getPending<PendingEmailDraftPayload>(
        sessionId,
        'email_draft',
      );

    if (pendingDraft) {
      return continuePendingEmailDraft(
        this.draftDeps(),
        sessionId,
        message,
        pendingDraft,
        envelope,
        conversationId,
      );
    }

    const pendingSend =
      await this.pendingRequestService.getPending<PendingEmailSendPayload>(
        sessionId,
        'email_send',
      );

    if (pendingSend) {
      if (
        envelope.intent === 'pending_cancel' ||
        isEmailDraftDeleteRequest(message, envelope)
      ) {
        return handlePendingEmailSendTurn(
          this.sendDeps(),
          sessionId,
          message,
          envelope,
        );
      }

      if (
        envelope.intent === 'email_send_confirm' ||
        envelope.intent === 'email_draft_revise'
      ) {
        return handlePendingEmailSendTurn(
          this.sendDeps(),
          sessionId,
          message,
          envelope,
        );
      }

      if (envelope.intent === 'email_draft') {
        await this.pendingRequestService.clearPending(sessionId, 'email_send');
        return this.handleEmailDraftIntent(
          sessionId,
          message,
          envelope,
          conversationId,
        );
      }

      return null;
    }

    if (
      envelope.intent === 'email_draft_delete' ||
      envelope.intent === 'email_draft_revise' ||
      isEmailDraftDeleteRequest(message, envelope)
    ) {
      return this.handleEmailDraftFollowUp(
        sessionId,
        message,
        envelope,
        conversationId,
      );
    }

    if (envelope.intent === 'email_draft') {
      return this.handleEmailDraftIntent(
        sessionId,
        message,
        envelope,
        conversationId,
      );
    }

    return null;
  }
}
