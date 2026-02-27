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
      <div className="flex items-center justify-between p-4 border-b border-white/[0.08]">
        <h1 className="text-xl font-medium text-white">Assistant</h1>
        <button
          onClick={clearMessages}
          className="px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors"
        >
          Clear Chat
        </button>
      </div>
      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-white/40">
            Start a conversation...
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col w-full">
            {msg.role === 'user' ? (
              <div className="ml-auto max-w-[80%] px-4 py-3 bg-indigo-600/80 text-white rounded-2xl rounded-br-md">
                {msg.content}
              </div>
            ) : (
              <div className="mr-auto max-w-[80%] px-4 py-3 backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] text-white rounded-2xl rounded-bl-md">
                {msg.content}
                {msg.toolCalls?.map((tool, idx) => (
                  <div
                    key={idx}
                    className="mt-2 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-white/60 flex items-center gap-2"
                  >
                    🔧 {tool.name} {tool.status === 'pending' ? '...' : `(${tool.status})`}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="mr-auto max-w-[80%] px-4 py-3 backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] text-white rounded-2xl rounded-bl-md">
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
      <div className="p-4 border-t border-white/[0.08]">
        <form onSubmit={handleSend} className="flex gap-2">
          {/* Text input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant..."
            className="flex-1 px-4 py-3 bg-white/[0.06] border border-white/[0.12] rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
          {/* Send button */}
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="ml-3 px-5 py-3 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-xl font-medium transition-colors disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>

      {/* Confirmation modal overlay */}
      {confirmationRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          {/* Confirmation card */}
          <div className="backdrop-blur-xl bg-white/[0.12] border border-white/[0.15] rounded-2xl p-6 max-w-md w-full mx-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <h3 className="text-lg font-medium text-white mb-2">Permission Required</h3>
            <p className="text-white/70 mb-6">
              The assistant wants to{' '}
              <strong className="text-white">{confirmationRequest.callName}</strong>. Allow?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeny}
                className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] text-white rounded-xl transition-colors"
              >
                Deny
              </button>
              <button
                onClick={handleApprove}
                className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-xl transition-colors"
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
