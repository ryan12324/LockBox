import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    name: string;
    status: 'pending' | 'confirmed' | 'denied' | 'done';
    result?: string;
  }>;
  isStreaming?: boolean;
}

export interface ConfirmationRequest {
  callName: string;
  arguments: Record<string, unknown>;
  resolve: (approved: boolean) => void;
}

interface ChatState {
  messages: ChatMessage[];
  loading: boolean;
  confirmationRequest: ConfirmationRequest | null;

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  updateLastAssistant: (content: string) => void;
  addToolCall: (messageId: string, toolCall: NonNullable<ChatMessage['toolCalls']>[0]) => void;
  setLoading: (loading: boolean) => void;
  setConfirmationRequest: (req: ConfirmationRequest | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  loading: false,
  confirmationRequest: null,

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  updateLastAssistant: (content) =>
    set((state) => {
      const messages = [...state.messages];
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], content };
          break;
        }
      }
      return { messages };
    }),

  addToolCall: (messageId, toolCall) =>
    set((state) => {
      const messages = state.messages.map((msg) => {
        if (msg.id === messageId) {
          return {
            ...msg,
            toolCalls: [...(msg.toolCalls || []), toolCall],
          };
        }
        return msg;
      });
      return { messages };
    }),

  setLoading: (loading) => set({ loading }),

  setConfirmationRequest: (req) => set({ confirmationRequest: req }),

  clearMessages: () => set({ messages: [] }),
}));
