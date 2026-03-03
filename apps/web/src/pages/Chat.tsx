import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../store/chat.js';

export default function Chat() {
  const {
    messages,
    loading,
    confirmationRequest,
    addMessage,
    setLoading,
    setConfirmationRequest,
    clearMessages,
  } = useChatStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMsg });
    setLoading(true);

    // Placeholder logic
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content:
          "I'm the Lockbox Assistant. Chat functionality requires an AI provider to be configured in Settings → AI. Once configured, I can help you search your vault, generate passwords, check for breaches, and more.",
      });
      setLoading(false);
    }, 1000);
  };

  const handleApprove = () => {
    if (confirmationRequest) {
      confirmationRequest.resolve(true);
      setConfirmationRequest(null);
    }
  };

  const handleDeny = () => {
    if (confirmationRequest) {
      confirmationRequest.resolve(false);
      setConfirmationRequest(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <h1 className="text-xl font-medium text-[var(--color-text)]">Assistant</h1>
        <button
          onClick={clearMessages}
          className="px-3 py-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] rounded-[var(--radius-md)] transition-colors"
        >
          Clear Chat
        </button>
      </div>
      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-[var(--color-text-tertiary)]">
            Start a conversation...
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col w-full">
            {msg.role === 'user' ? (
              <div className="ml-auto max-w-[80%] px-4 py-3 bg-[var(--color-primary)] text-[var(--color-text)] rounded-[var(--radius-xl)] rounded-br-[var(--radius-sm)]">
                {msg.content}
              </div>
            ) : (
              <div className="mr-auto max-w-[80%] px-4 py-3 bg-[var(--color-aura-dim)] border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)]">
                {msg.content}
                {msg.toolCalls?.map((tool, idx) => (
                  <div
                    key={idx}
                    className="mt-2 px-3 py-1.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2"
                  >
                    🔧 {tool.name} {tool.status === 'pending' ? '...' : `(${tool.status})`}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-auto max-w-[80%] px-4 py-3 bg-[var(--color-aura-dim)] border border-[var(--color-border)] text-[var(--color-text)] rounded-[var(--radius-xl)] rounded-bl-[var(--radius-sm)]">
            <div className="flex gap-1">
              <span className="animate-bounce">.</span>
              <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>
                .
              </span>
              <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>
                .
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar container */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <form onSubmit={handleSend} className="flex gap-2">
          {/* Text input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant..."
            className="flex-1 px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-aura)]"
          />
          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="ml-3 px-5 py-3 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-lg)] font-medium transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>

      {/* Confirmation modal overlay */}
      {confirmationRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* Confirmation card */}
          <div className="bg-[var(--color-surface-raised)] border border-[var(--color-border-strong)] rounded-[var(--radius-xl)] p-6 max-w-md w-full mx-4 shadow-[var(--shadow-lg)]">
            <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">
              Permission Required
            </h3>
            <p className="text-[var(--color-text-secondary)] mb-6">
              The assistant wants to{' '}
              <strong className="text-[var(--color-text)]">{confirmationRequest.callName}</strong>.
              Allow?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeny}
                className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] rounded-[var(--radius-lg)] transition-colors"
              >
                Deny
              </button>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-lg)] transition-colors"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
