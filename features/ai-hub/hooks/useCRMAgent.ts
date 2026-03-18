'use client';

import { useState, useCallback, useRef } from 'react';
import { useCRM } from '@/context/CRMContext';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: Array<{
    toolName: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
}

interface UseCRMAgentOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
}

/**
 * Hook que encapsula o agente CRM via API route server-side.
 * Toda chamada à IA passa pelo /api/ai/chat — nunca direto do browser.
 */
export function useCRMAgent(_options: UseCRMAgentOptions = {}) {
  const { activeBoard } = useCRM();

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);

    abortControllerRef.current = new AbortController();

    try {
      const coreMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: coreMessages,
          context: {
            boardId: activeBoard?.id,
            boardName: activeBoard?.name,
            stages: activeBoard?.stages?.map((s) => ({
              id: s.id,
              name: s.label,
            })),
          },
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Erro ao conectar com o assistente.');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          // AI SDK v6 data stream: text parts prefixed with "0:"
          if (line.startsWith('0:')) {
            try {
              const textPart = JSON.parse(line.slice(2));
              fullText += textPart;
              setMessages(prev => {
                const existing = prev.find(m => m.id === 'streaming');
                if (existing) {
                  return prev.map(m =>
                    m.id === 'streaming' ? { ...m, content: fullText } : m
                  );
                }
                return [
                  ...prev,
                  { id: 'streaming', role: 'assistant' as const, content: fullText },
                ];
              });
            } catch {
              // skip malformed lines
            }
          }
        }
      }

      // Finaliza a mensagem substituindo o id temporário
      setMessages(prev =>
        prev.map(m => (m.id === 'streaming' ? { ...m, id: crypto.randomUUID() } : m))
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err : new Error('Erro desconhecido'));
      console.error('CRM Agent Error:', err);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, activeBoard]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
