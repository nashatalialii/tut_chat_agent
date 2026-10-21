import { create } from 'zustand';

export type LegalCitationView = {
  documentId: string;
  documentTitle: string;
  documentType: 'law' | 'regulation' | 'amendment' | 'decision' | 'other';
  lawNumber?: string;
  lawYear?: string;
  articleNumber?: string;
  pageNumber?: number;
  pageEnd?: number;
  sourceName: string;
  sourceUrl?: string;
  version?: string;
  sourceStatus: 'official' | 'verified' | 'unverified' | 'sample';
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pending?: boolean;
  citations?: LegalCitationView[];
};

type ChatState = {
  messages: ChatMessage[];
  addMessage: (message: Omit<ChatMessage, 'id'> & { id?: string }) => string;
  appendToMessage: (id: string, token: string) => void;
  setMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clear: () => void;
};

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (message) => {
    const id = message.id ?? crypto.randomUUID();
    set((state) => ({ messages: [...state.messages, { ...message, id }] }));
    return id;
  },
  appendToMessage: (id, token) =>
    set((state) => ({
      messages: state.messages.map((message) => (message.id === id ? { ...message, content: message.content + token } : message))
    })),
  setMessage: (id, patch) =>
    set((state) => ({ messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) })),
  clear: () => set({ messages: [] })
}));
