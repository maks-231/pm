import type { BoardData } from "@/lib/kanban";

export type Session = { username: string };

class ApiError extends Error {}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(`Request to ${path} failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

export const getSession = (): Promise<Session> => request("/api/session");

export const login = (username: string, password: string): Promise<Session> =>
  request("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = (): Promise<void> =>
  request("/api/logout", { method: "POST" });

export const getBoard = (): Promise<BoardData> => request("/api/board");

export const renameColumn = (
  columnId: string,
  title: string
): Promise<BoardData> =>
  request(`/api/board/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const addCard = (
  columnId: string,
  title: string,
  details: string
): Promise<BoardData> =>
  request(`/api/board/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (cardId: string): Promise<BoardData> =>
  request(`/api/board/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (
  cardId: string,
  columnId: string,
  index: number
): Promise<BoardData> =>
  request(`/api/board/cards/${cardId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ column_id: columnId, index }),
  });

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResult = { reply: string; board: BoardData };

export const chat = (
  message: string,
  history: ChatMessage[]
): Promise<ChatResult> =>
  request("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
