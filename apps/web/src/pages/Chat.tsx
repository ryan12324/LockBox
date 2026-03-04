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
    <div
      className="flex flex-col h-full"
      style={{
        background: 'linear-gradient(180deg, var(--color-bg) 0%, var(--color-surface) 100%)',
      }}
    >
      <Card
        variant="surface"
        padding="md"
        style={{
          borderRadius: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div className="flex items-center" style={{ gap: 12 }}>
          <h1
            style={{
              fontSize: 'var(--font-size-xl)',
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            Assistant
          </h1>
          <Aura state={chatAuraState} position="inline" />
        </div>
        <Button variant="ghost" size="sm" onClick={clearMessages}>
          Clear Chat
        </Button>
      </Card>

      <div className="flex-1 overflow-y-auto" style={{ padding: 24, position: 'relative' }}>
        {messages.length === 0 && (
          <div
            className="h-full flex flex-col items-center justify-center"
            style={{ position: 'relative' }}
          >
            <Aura
              state={chatAuraState}
              position="center"
              style={{ width: 280, height: 280, opacity: 0.2 }}
            />
            <p
              style={{
                position: 'relative',
                zIndex: 1,
                color: 'var(--color-text-tertiary)',
                fontSize: 'var(--font-size-lg)',
                fontWeight: 500,
              }}
            >
              Start a conversation...
            </p>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map((msg) => (
            <div key={msg.id} className="flex flex-col w-full">
              {msg.role === 'user' ? (
                <div style={{ marginLeft: 'auto', maxWidth: '80%' }}>
                  <Card
                    variant="raised"
                    padding="md"
                    style={{
                      background: 'var(--color-primary)',
                      color: 'white',
                      borderRadius: 'var(--radius-organic-lg)',
                      borderBottomRightRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  >
                    <span style={{ lineHeight: 'var(--line-height-relaxed)' }}>{msg.content}</span>
                  </Card>
                </div>
              ) : (
                <div style={{ marginRight: 'auto', maxWidth: '80%' }}>
                  <Card
                    variant="surface"
                    padding="md"
                    style={{
                      borderRadius: 'var(--radius-organic-lg)',
                      borderBottomLeftRadius: 'var(--radius-sm)',
                      boxShadow: 'var(--shadow-lg)',
                    }}
                  >
                    <span
                      style={{
                        color: 'var(--color-text)',
                        lineHeight: 'var(--line-height-relaxed)',
                      }}
                    >
                      {msg.content}
                    </span>
                    {msg.toolCalls?.map((tool, idx) => (
                      <div
                        key={idx}
                        style={{
                          marginTop: 8,
                          padding: '6px 12px',
                          background: 'var(--color-bg-subtle)',
                          borderRadius: 'var(--radius-md)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
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
            <div style={{ marginRight: 'auto', maxWidth: '80%', position: 'relative' }}>
              <Aura
                state="thinking"
                position="center"
                style={{ width: 80, height: 80, opacity: 0.3 }}
              />
              <Card
                variant="surface"
                padding="md"
                style={{
                  borderRadius: 'var(--radius-organic-lg)',
                  borderBottomLeftRadius: 'var(--radius-sm)',
                  position: 'relative',
                  zIndex: 1,
                  boxShadow: 'var(--shadow-lg)',
                }}
              >
                <div className="flex" style={{ gap: 4 }}>
                  <span
                    className="animate-bounce"
                    style={{
                      color: 'var(--color-primary)',
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 700,
                    }}
                  >
                    .
                  </span>
                  <span
                    className="animate-bounce"
                    style={{
                      animationDelay: '0.2s',
                      color: 'var(--color-primary)',
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 700,
                    }}
                  >
                    .
                  </span>
                  <span
                    className="animate-bounce"
                    style={{
                      animationDelay: '0.4s',
                      color: 'var(--color-primary)',
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 700,
                    }}
                  >
                    .
                  </span>
                </div>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <Card
        variant="surface"
        padding="md"
        style={{
          borderRadius: 0,
          boxShadow: 'var(--shadow-xl)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <form onSubmit={handleSend} className="flex" style={{ gap: 12 }}>
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant..."
            style={{
              flex: 1,
              borderRadius: 'var(--radius-organic-lg)',
              fontSize: 'var(--font-size-base)',
              padding: '12px 18px',
            }}
          />
          <Button type="submit" variant="primary" disabled={!input.trim() || loading}>
            Send
          </Button>
        </form>
      </Card>

      {confirmationRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Card
            variant="frost"
            padding="lg"
            style={{
              maxWidth: '28rem',
              width: '100%',
              margin: '0 1rem',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h3
              style={{
                fontSize: 'var(--font-size-lg)',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: 8,
              }}
            >
              Permission Required
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              The assistant wants to{' '}
              <strong style={{ color: 'var(--color-text)' }}>{confirmationRequest.callName}</strong>
              . Allow?
            </p>
            <div className="flex justify-end" style={{ gap: 12 }}>
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
