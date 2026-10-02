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
