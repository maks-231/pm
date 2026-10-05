import type { BoardData } from "@/lib/kanban";

export type Session = { username: string };

export type BoardSummary = { id: string; name: string };

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

export const signup = (
  username: string,
  password: string
): Promise<Session> =>
  request("/api/signup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

export const logout = (): Promise<void> =>
  request("/api/logout", { method: "POST" });

export const listBoards = (): Promise<BoardSummary[]> => request("/api/boards");

export const createBoard = (name: string): Promise<BoardSummary> =>
  request("/api/boards", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const renameBoard = (
  boardId: string,
  name: string
): Promise<BoardSummary> =>
  request(`/api/boards/${boardId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });

export const deleteBoard = (boardId: string): Promise<void> =>
  request(`/api/boards/${boardId}`, { method: "DELETE" });

export const getBoard = (boardId: string): Promise<BoardData> =>
  request(`/api/boards/${boardId}`);

export const renameColumn = (
  boardId: string,
  columnId: string,
  title: string
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/columns/${columnId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });

export const addCard = (
  boardId: string,
  columnId: string,
  title: string,
  details: string
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/columns/${columnId}/cards`, {
    method: "POST",
    body: JSON.stringify({ title, details }),
  });

export const deleteCard = (
  boardId: string,
  cardId: string
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/cards/${cardId}`, { method: "DELETE" });

export const moveCard = (
  boardId: string,
  cardId: string,
  columnId: string,
  index: number
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/cards/${cardId}/move`, {
    method: "PATCH",
    body: JSON.stringify({ column_id: columnId, index }),
  });

export type UpdateCardFields = Partial<{
  title: string;
  details: string;
  due_date: string;
  assignee_text: string;
}>;

export const updateCard = (
  boardId: string,
  cardId: string,
  fields: UpdateCardFields
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/cards/${cardId}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });

export const setCardLabels = (
  boardId: string,
  cardId: string,
  labelNames: string[]
): Promise<BoardData> =>
  request(`/api/boards/${boardId}/cards/${cardId}/labels`, {
    method: "PUT",
    body: JSON.stringify({ label_names: labelNames }),
  });

export type LabelSummary = { id: string; name: string; color: string };

export const listLabels = (boardId: string): Promise<LabelSummary[]> =>
  request(`/api/boards/${boardId}/labels`);

export type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
};

export const listComments = (
  boardId: string,
  cardId: string
): Promise<Comment[]> => request(`/api/boards/${boardId}/cards/${cardId}/comments`);

export const addComment = (
  boardId: string,
  cardId: string,
  body: string
): Promise<Comment> =>
  request(`/api/boards/${boardId}/cards/${cardId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ChatResult = { reply: string; board: BoardData };

export const chat = (
  boardId: string,
  message: string,
  history: ChatMessage[]
): Promise<ChatResult> =>
  request(`/api/boards/${boardId}/ai/chat`, {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
