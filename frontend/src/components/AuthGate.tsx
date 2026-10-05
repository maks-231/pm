"use client";

import { useEffect, useState } from "react";
import {
  createBoard,
  deleteBoard,
  getSession,
  listBoards,
  logout as apiLogout,
  renameBoard,
  type BoardSummary,
} from "@/lib/api";
import { LoginScreen } from "@/components/LoginScreen";
import { KanbanBoard } from "@/components/KanbanBoard";

type AuthState =
  | { status: "checking" }
  | { status: "loggedOut" }
  | { status: "loggedIn"; username: string };

const lastBoardKey = (username: string) => `lastBoardId:${username}`;

export const AuthGate = () => {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((session) => {
        if (!cancelled) {
          setAuth({ status: "loggedIn", username: session.username });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuth({ status: "loggedOut" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.status !== "loggedIn") {
      return;
    }
    const username = auth.username;
    let cancelled = false;
    listBoards().then((fetched) => {
      if (cancelled) {
        return;
      }
      setBoards(fetched);
      const remembered = window.localStorage.getItem(lastBoardKey(username));
      const stillExists = fetched.some((board) => board.id === remembered);
      setCurrentBoardId(stillExists ? remembered : fetched[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const handleLogout = async () => {
    await apiLogout();
    setAuth({ status: "loggedOut" });
    setBoards(null);
    setCurrentBoardId(null);
  };

  const handleSwitchBoard = (boardId: string) => {
    setCurrentBoardId(boardId);
    if (auth.status === "loggedIn") {
      window.localStorage.setItem(lastBoardKey(auth.username), boardId);
    }
  };

  const handleCreateBoard = async (name: string) => {
    const created = await createBoard(name);
    setBoards([created, ...(boards ?? [])]);
    handleSwitchBoard(created.id);
  };

  const handleRenameBoard = async (boardId: string, name: string) => {
    const updated = await renameBoard(boardId, name);
    setBoards((boards ?? []).map((board) => (board.id === boardId ? updated : board)));
  };

  const handleDeleteBoard = async (boardId: string) => {
    await deleteBoard(boardId);
    const remaining = (boards ?? []).filter((board) => board.id !== boardId);
    setBoards(remaining);
    if (boardId === currentBoardId) {
      const next = remaining[0]?.id ?? null;
      setCurrentBoardId(next);
      if (auth.status === "loggedIn") {
        if (next) {
          window.localStorage.setItem(lastBoardKey(auth.username), next);
        } else {
          window.localStorage.removeItem(lastBoardKey(auth.username));
        }
      }
    }
  };

  if (auth.status === "checking") {
    return null;
  }

  if (auth.status === "loggedOut") {
    return (
      <LoginScreen
        onSuccess={(username) => setAuth({ status: "loggedIn", username })}
      />
    );
  }

  if (boards === null) {
    return null;
  }

  if (boards.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface)] px-6 text-center">
        <p className="text-sm font-medium text-[var(--gray-text)]">
          You don&apos;t have any boards yet.
        </p>
        <button
          type="button"
          onClick={() => handleCreateBoard("Board 1")}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Create your first board
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Log out
        </button>
      </div>
    );
  }

  if (!currentBoardId) {
    return null;
  }

  return (
    <KanbanBoard
      key={currentBoardId}
      boardId={currentBoardId}
      boards={boards}
      onSwitchBoard={handleSwitchBoard}
      onCreateBoard={handleCreateBoard}
      onRenameBoard={handleRenameBoard}
      onDeleteBoard={handleDeleteBoard}
      onLogout={handleLogout}
    />
  );
};
