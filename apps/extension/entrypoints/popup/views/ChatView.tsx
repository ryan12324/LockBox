import React, { useState } from 'react';
import { Button, Input } from '@lockbox/design';

export function ChatView({ onBack }: { onBack: () => void }) {
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: 'user' | 'assistant'; content: string; id: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const handleChatSend = () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim(), id: crypto.randomUUID() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Chat requires an AI provider. Configure one in AI Settings to enable the assistant.',
          id: crypto.randomUUID(),
        },
      ]);
      setChatLoading(false);
    }, 500);
  };

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex items-center space-x-2 p-3 border-b border-[var(--color-border)]">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ←
        </Button>
        <span className="text-sm font-medium text-[var(--color-text)]">✨ Assistant</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {chatMessages.length === 0 && (
          <div className="text-center text-[var(--color-text-tertiary)] text-xs mt-8">
            <p className="text-2xl mb-2">✨</p>
            <p>Ask me anything about your vault.</p>
            <p className="mt-1">Try "find my GitHub password" or "generate a strong password"</p>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.role === 'user'
                ? 'ml-auto max-w-[85%] px-3 py-2 bg-[var(--color-primary)] text-[var(--color-text)] text-xs rounded-[var(--radius-lg)] rounded-br-sm'
                : 'mr-auto max-w-[85%] px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs rounded-[var(--radius-lg)] rounded-bl-sm'
            }
          >
            {msg.content}
          </div>
        ))}
        {chatLoading && (
          <div className="mr-auto px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] rounded-bl-sm">
            <div className="flex space-x-1">
              <div
                className="w-1.5 h-1.5 rounded-[var(--radius-full)] bg-[var(--color-border)] animate-bounce"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="w-1.5 h-1.5 rounded-[var(--radius-full)] bg-[var(--color-border)] animate-bounce"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="w-1.5 h-1.5 rounded-[var(--radius-full)] bg-[var(--color-border)] animate-bounce"
                style={{ animationDelay: '300ms' }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-[var(--color-border)] flex space-x-2">
        <Input
          className="flex-1"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChatSend()}
          placeholder="Ask anything..."
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleChatSend}
          disabled={!chatInput.trim() || chatLoading}
        >
          Send
        </Button>
      </div>
    </div>
  );
}
