import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChatSidebar } from "@/components/ChatSidebar";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const emptyBoard: BoardData = { columns: [], cards: {} };

const openChat = async () => {
  await userEvent.click(screen.getByRole("button", { name: /ai chat/i }));
};

describe("ChatSidebar", () => {
  it("sends a message and shows the reply, updating the board", async () => {
    const onBoardUpdate = vi.fn();
    vi.spyOn(api, "chat").mockResolvedValue({
      reply: "Backlog has 2 cards.",
      board: emptyBoard,
    });

    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);
    await openChat();

    await userEvent.type(
      screen.getByLabelText("Chat message"),
      "What's in Backlog?"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("Backlog has 2 cards.")).toBeInTheDocument();
    expect(screen.getByText("What's in Backlog?")).toBeInTheDocument();
    expect(api.chat).toHaveBeenCalledWith("What's in Backlog?", []);
    expect(onBoardUpdate).toHaveBeenCalledWith(emptyBoard);
  });

  it("shows a loading state while waiting for the reply", async () => {
    let resolveChat: (result: { reply: string; board: BoardData }) => void = () => {};
    vi.spyOn(api, "chat").mockReturnValue(
      new Promise((resolve) => {
        resolveChat = resolve;
      })
    );

    render(<ChatSidebar onBoardUpdate={() => {}} />);
    await openChat();

    await userEvent.type(screen.getByLabelText("Chat message"), "hi");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText(/thinking/i)).toBeInTheDocument();

    resolveChat({ reply: "Hello!", board: emptyBoard });
    expect(await screen.findByText("Hello!")).toBeInTheDocument();
  });

  it("shows an error when the request fails", async () => {
    vi.spyOn(api, "chat").mockRejectedValue(new Error("network error"));

    render(<ChatSidebar onBoardUpdate={() => {}} />);
    await openChat();

    await userEvent.type(screen.getByLabelText("Chat message"), "hi");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
  });

  it("sends prior turns as history on a follow-up message", async () => {
    vi.spyOn(api, "chat")
      .mockResolvedValueOnce({ reply: "First reply", board: emptyBoard })
      .mockResolvedValueOnce({ reply: "Second reply", board: emptyBoard });

    render(<ChatSidebar onBoardUpdate={() => {}} />);
    await openChat();

    const input = screen.getByLabelText("Chat message");
    const send = screen.getByRole("button", { name: /send/i });

    await userEvent.type(input, "first message");
    await userEvent.click(send);
    await screen.findByText("First reply");

    await userEvent.type(input, "second message");
    await userEvent.click(send);
    await screen.findByText("Second reply");

    expect(api.chat).toHaveBeenLastCalledWith("second message", [
      { role: "user", content: "first message" },
      { role: "assistant", content: "First reply" },
    ]);
  });
});
