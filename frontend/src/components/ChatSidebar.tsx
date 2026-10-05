"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import * as api from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  boardId: string;
  onBoardUpdate: (board: BoardData) => void;
};

// The AI is scoped to whichever board is open. The parent remounts this
// component with a fresh `key` per board id (see AuthGate/KanbanBoard), so
// switching boards always starts a fresh conversation rather than carrying
// over context about a different board.
export const ChatSidebar = ({ boardId, onBoardUpdate }: ChatSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    const history = messages;
    setMessages([...history, { role: "user", content: text }]);
    setInput("");
    setError(false);
    setIsSending(true);

    try {
      const result = await api.chat(boardId, text, history);
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply }]);
      onBoardUpdate(result.board);
    } catch {
      setError(true);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={clsx(
          "fixed bottom-8 right-8 z-20 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-[var(--shadow)] transition hover:brightness-110",
          isOpen && "pointer-events-none opacity-0"
        )}
      >
        AI Chat
      </button>

      <div
        className={clsx(
          "fixed inset-0 z-30 bg-[var(--navy-dark)]/20 transition-opacity",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={clsx(
          "fixed right-0 top-0 z-40 flex h-full w-full max-w-sm flex-col border-l border-[var(--stroke)] bg-[var(--surface-strong)] shadow-[var(--shadow)] transition-transform duration-200",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
              Kanban Studio
            </p>
            <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
              AI Chat
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close chat"
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {messages.length === 0 && (
            <p className="text-sm leading-6 text-[var(--gray-text)]">
              Ask about your board, or ask me to add, move, rename, or
              remove cards.
            </p>
          )}
          {messages.map((entry, index) => (
            <div
              key={index}
              data-testid={`chat-message-${entry.role}`}
              className={clsx(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                entry.role === "user"
                  ? "ml-auto bg-[var(--secondary-purple)] text-white"
                  : "bg-[var(--surface)] text-[var(--navy-dark)]"
              )}
            >
              {entry.content}
            </div>
          ))}
          {isSending && (
            <div className="max-w-[85%] rounded-2xl bg-[var(--surface)] px-4 py-3 text-sm text-[var(--gray-text)]">
              Thinking…
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-600">
              Something went wrong. Please try again.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-[var(--stroke)] px-6 py-4"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask the AI…"
            aria-label="Chat message"
            disabled={isSending}
            className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
};
