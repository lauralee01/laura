'use client';

import {
  useCallback,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { sendChatMessageStream } from '@/lib/chat-api';
import type { StoredChatMessage } from '@/lib/session';
import { isAbortError, shouldRefreshGoogleStatus } from './utils';

type Options = {
  sessionReady: boolean;
  conversationId: string | undefined;
  conversationIdRef: React.MutableRefObject<string | undefined>;
  messages: StoredChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<StoredChatMessage[]>>;
  setConversationId: (value: string | undefined) => void;
  setError: (value: string | null) => void;
  reloadSidebar: () => Promise<void>;
  pinToBottom: () => void;
};

/**
 * In-flight send/stream lifecycle: abort, optimistic user turn, token chunks.
 */
export function useChatStream({
  sessionReady,
  conversationId,
  conversationIdRef,
  messages,
  setMessages,
  setConversationId,
  setError,
  reloadSidebar,
  pinToBottom,
}: Options) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const streamGenerationRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);

  const abortActiveStream = useCallback(() => {
    streamGenerationRef.current += 1;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setLoading(false);
    setStreaming(false);
    setStatusLabel(null);
  }, []);

  const abortOnUnmount = useCallback(() => {
    streamAbortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (rawText: string) => {
      const submittedText = rawText.trim();

      if (!submittedText || loading || streaming || !sessionReady) {
        return;
      }

      const generationId = ++streamGenerationRef.current;
      const abortController = new AbortController();
      streamAbortRef.current?.abort();
      streamAbortRef.current = abortController;

      const submitConversationId = conversationId;
      const priorHistory = messages.slice(-40);

      setError(null);
      setInput('');
      setLoading(true);
      setStreaming(false);
      setStatusLabel(null);
      pinToBottom();

      /*
       * Optimistic user turn only. Clear prior confirm chips so they
       * don't linger after the user answers (chip or typed).
       * Append assistant on first chunk (not beside "thinking…").
       */
      setMessages((previousMessages) => [
        ...previousMessages.map((m) =>
          m.confirmPrompt ? { ...m, confirmPrompt: undefined } : m,
        ),
        {
          role: 'user',
          content: submittedText,
        },
      ]);

      let accumulatedReply = '';
      let assistantStarted = false;

      try {
        const {
          conversationId: returnedConversationId,
          receipt,
          confirmPrompt,
        } = await sendChatMessageStream(
          {
            conversationId: submitConversationId,
            message: submittedText,
            history: priorHistory,
          },
          (chunk: string) => {
            if (generationId !== streamGenerationRef.current) {
              return;
            }

            if (!assistantStarted) {
              assistantStarted = true;
              setStatusLabel(null);
              setLoading(false);
              setStreaming(true);
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: chunk,
                },
              ]);
              accumulatedReply = chunk;
              return;
            }

            accumulatedReply += chunk;

            setMessages((prev) => {
              if (prev.length === 0) {
                return prev;
              }

              const next = [...prev];
              const lastIndex = next.length - 1;
              const lastMessage = next[lastIndex];

              if (lastMessage?.role === 'assistant') {
                next[lastIndex] = {
                  ...lastMessage,
                  content: accumulatedReply,
                };
              }

              return next;
            });
          },
          abortController.signal,
          (label: string) => {
            if (generationId !== streamGenerationRef.current) {
              return;
            }
            setStatusLabel(label);
          },
        );

        if (generationId !== streamGenerationRef.current) {
          return;
        }

        setStreaming(false);
        setStatusLabel(null);

        if (receipt || confirmPrompt) {
          setMessages((prev) => {
            if (prev.length === 0) {
              return prev;
            }
            const next = [...prev];
            const lastIndex = next.length - 1;
            const lastMessage = next[lastIndex];
            if (lastMessage?.role === 'assistant') {
              next[lastIndex] = {
                ...lastMessage,
                ...(receipt ? { receipt } : {}),
                ...(confirmPrompt ? { confirmPrompt } : {}),
              };
            }
            return next;
          });
        }

        const activeConversationId =
          returnedConversationId ?? submitConversationId;

        if (activeConversationId) {
          setConversationId(activeConversationId);
        }

        if (shouldRefreshGoogleStatus(accumulatedReply)) {
          window.dispatchEvent(new Event('google-connection-changed'));
        }

        void reloadSidebar();
      } catch (sendError: unknown) {
        if (
          generationId !== streamGenerationRef.current ||
          isAbortError(sendError)
        ) {
          return;
        }

        const errorMessage =
          sendError instanceof Error
            ? sendError.message
            : 'Something went wrong.';

        setError(errorMessage);
        setStatusLabel(null);

        /*
         * Only roll back if we are still on the conversation that sent
         * this message — otherwise a mid-stream switch would delete turns
         * from the newly opened thread.
         */
        if (conversationIdRef.current === submitConversationId) {
          setMessages((previousMessages) => {
            if (assistantStarted) {
              return previousMessages.slice(0, -2);
            }
            return previousMessages.slice(0, -1);
          });
          setInput(submittedText);
        }
      } finally {
        if (generationId === streamGenerationRef.current) {
          setLoading(false);
          setStreaming(false);
          setStatusLabel(null);
          if (streamAbortRef.current === abortController) {
            streamAbortRef.current = null;
          }
        }
      }
    },
    [
      conversationId,
      conversationIdRef,
      loading,
      messages,
      pinToBottom,
      reloadSidebar,
      sessionReady,
      setConversationId,
      setError,
      setMessages,
      streaming,
    ],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await sendMessage(input);
    },
    [input, sendMessage],
  );

  return {
    input,
    setInput,
    loading,
    streaming,
    statusLabel,
    abortActiveStream,
    abortOnUnmount,
    sendMessage,
    handleSubmit,
    stopStreaming: abortActiveStream,
  };
}
