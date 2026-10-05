"use client";

import { useState } from "react";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  currentBoardId: string;
  onSwitch: (boardId: string) => void;
  onCreate: (name: string) => void;
  onRename: (boardId: string, name: string) => void;
  onDelete: (boardId: string) => void;
};

export const BoardSwitcher = ({
  boards,
  currentBoardId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");

  const currentBoard = boards.find((board) => board.id === currentBoardId);

  const startEditing = (board: BoardSummary) => {
    setEditingBoardId(board.id);
    setDraftName(board.name);
  };

  const commitRename = (boardId: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onRename(boardId, trimmed);
    }
    setEditingBoardId(null);
  };

  const submitNewBoard = () => {
    const trimmed = newBoardName.trim();
    if (trimmed) {
      onCreate(trimmed);
      setNewBoardName("");
      setIsAdding(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="board-switcher-toggle"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2 rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)]"
      >
        {currentBoard?.name ?? "Select board"}
        <span className="text-[var(--gray-text)]">▾</span>
      </button>

      {isOpen && (
        <div
          data-testid="board-switcher-panel"
          className="absolute left-0 top-full z-10 mt-2 w-64 rounded-2xl border border-[var(--stroke)] bg-white p-2 shadow-[var(--shadow)]"
        >
          <ul className="flex flex-col gap-1">
            {boards.map((board) => (
              <li
                key={board.id}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--surface)]"
              >
                {editingBoardId === board.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onBlur={() => commitRename(board.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className="flex-1 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--primary-blue)]"
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`board-option-${board.id}`}
                    onClick={() => {
                      onSwitch(board.id);
                      setIsOpen(false);
                    }}
                    className={`flex-1 truncate text-left text-sm font-medium ${
                      board.id === currentBoardId
                        ? "text-[var(--primary-blue)]"
                        : "text-[var(--navy-dark)]"
                    }`}
                  >
                    {board.name}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Rename ${board.name}`}
                  onClick={() => startEditing(board)}
                  className="text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  ✎
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${board.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete board "${board.name}"?`)) {
                      onDelete(board.id);
                    }
                  }}
                  className="text-xs text-[var(--gray-text)] transition hover:text-red-600"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-[var(--stroke)] pt-2">
            {isAdding ? (
              <div className="flex items-center gap-2 px-2">
                <input
                  autoFocus
                  value={newBoardName}
                  onChange={(event) => setNewBoardName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      submitNewBoard();
                    }
                  }}
                  placeholder="Board name"
                  className="flex-1 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-sm outline-none focus:border-[var(--primary-blue)]"
                />
                <button
                  type="button"
                  onClick={submitNewBoard}
                  className="text-xs font-semibold text-[var(--primary-blue)]"
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="w-full rounded-xl px-2 py-1.5 text-left text-sm font-semibold text-[var(--primary-blue)] hover:bg-[var(--surface)]"
              >
                + New board
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
