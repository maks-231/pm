import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AuthGate } from "@/components/AuthGate";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const emptyBoard: BoardData = { columns: [], cards: {} };
const oneBoardSummary = [{ id: "board-1", name: "Board 1" }];

describe("AuthGate", () => {
  it("shows the login screen when there is no session", async () => {
    vi.spyOn(api, "getSession").mockRejectedValue(new Error("unauthorized"));

    render(<AuthGate />);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the kanban board when a session already exists", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue({ username: "user" });
    vi.spyOn(api, "listBoards").mockResolvedValue(oneBoardSummary);
    vi.spyOn(api, "getBoard").mockResolvedValue(emptyBoard);

    render(<AuthGate />);

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });

  it("returns to the login screen after logging out", async () => {
    vi.spyOn(api, "getSession").mockResolvedValue({ username: "user" });
    vi.spyOn(api, "listBoards").mockResolvedValue(oneBoardSummary);
    vi.spyOn(api, "getBoard").mockResolvedValue(emptyBoard);
    vi.spyOn(api, "logout").mockResolvedValue(undefined);

    render(<AuthGate />);

    const logoutButton = await screen.findByRole("button", {
      name: /log out/i,
    });
    await userEvent.click(logoutButton);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
