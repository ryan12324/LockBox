import React, { useRef, useEffect, useState } from 'react';
import { useChatStore } from '../store/chat.js';
import { useAura } from '../providers/AuraProvider.js';
import { Aura, Card, Button, Input } from '@lockbox/design';

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
  const aura = useAura();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatAuraState = loading ? ('thinking' as const) : ('idle' as const);

  useEffect(() => {
    if (loading) {
      aura.startThinking();
    } else {
      aura.stopThinking();
    }
  }, [loading]);

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
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-medium text-[var(--color-text)]">Assistant</h1>
          <Aura state={chatAuraState} position="inline" />
        </div>
        <Button variant="ghost" size="sm" onClick={clearMessages}>
          Clear Chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-[var(--color-text-tertiary)]">
            Start a conversation...
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col w-full">
            {msg.role === 'user' ? (
              <div className="ml-auto max-w-[80%]">
                <Card
                  variant="raised"
                  padding="md"
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-text)',
                    borderRadius: 'var(--radius-xl)',
                    borderBottomRightRadius: 'var(--radius-sm)',
                  }}
                >
                  {msg.content}
                </Card>
              </div>
            ) : (
              <div className="mr-auto max-w-[80%]">
                <Card
                  variant="surface"
                  padding="md"
                  style={{
                    background: 'var(--color-aura-dim)',
                    borderRadius: 'var(--radius-xl)',
                    borderBottomLeftRadius: 'var(--radius-sm)',
                  }}
                >
                  {msg.content}
                  {msg.toolCalls?.map((tool, idx) => (
                    <div
                      key={idx}
                      className="mt-2 px-3 py-1.5 bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-md)] text-xs text-[var(--color-text-secondary)] flex items-center gap-2"
                    >
                      🔧 {tool.name} {tool.status === 'pending' ? '...' : `(${tool.status})`}
                    </div>
                  ))}
                </Card>
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-auto max-w-[80%]">
            <Card
              variant="surface"
              padding="md"
              style={{
                background: 'var(--color-aura-dim)',
                borderRadius: 'var(--radius-xl)',
                borderBottomLeftRadius: 'var(--radius-sm)',
              }}
            >
              <div className="flex gap-1">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>
                  .
                </span>
                <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>
                  .
                </span>
              </div>
            </Card>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[var(--color-border)]">
        <form onSubmit={handleSend} className="flex gap-2">
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant..."
            style={{ flex: 1 }}
          />
          <Button type="submit" variant="primary" disabled={!input.trim() || loading}>
            Send
          </Button>
        </form>
      </div>

      {confirmationRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card
            variant="raised"
            padding="lg"
            style={{ maxWidth: '28rem', width: '100%', margin: '0 1rem' }}
          >
            <h3 className="text-lg font-medium text-[var(--color-text)] mb-2">
              Permission Required
            </h3>
            <p className="text-[var(--color-text-secondary)] mb-6">
              The assistant wants to{' '}
              <strong className="text-[var(--color-text)]">{confirmationRequest.callName}</strong>.
              Allow?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="danger" onClick={handleDeny}>
                Deny
              </Button>
              <Button variant="primary" onClick={handleApprove}>
                Approve
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
