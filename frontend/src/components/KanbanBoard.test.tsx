import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

const baseBoard: BoardData = {
  columns: [
    { id: "col-a", title: "Backlog", cardIds: ["card-1"] },
    { id: "col-b", title: "Discovery", cardIds: [] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "First card",
      details: "Some notes",
      dueDate: null,
      assigneeText: null,
      labels: [],
      commentCount: 0,
    },
  },
};

const defaultProps = {
  boardId: "board-1",
  boards: [{ id: "board-1", name: "Board 1" }],
  onSwitchBoard: () => {},
  onCreateBoard: () => {},
  onRenameBoard: () => {},
  onDeleteBoard: () => {},
  onLogout: () => {},
};

describe("KanbanBoard", () => {
  it("shows a loading state, then the board", async () => {
    let resolveBoard: (board: BoardData) => void = () => {};
    vi.spyOn(api, "getBoard").mockReturnValue(
      new Promise((resolve) => {
        resolveBoard = resolve;
      })
    );

    render(<KanbanBoard {...defaultProps} />);
    expect(screen.getByText(/loading your board/i)).toBeInTheDocument();

    resolveBoard(baseBoard);
    expect(await screen.findByDisplayValue("Backlog")).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(2);
  });

  it("shows an error with a retry option when the board fails to load", async () => {
    vi.spyOn(api, "getBoard")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(baseBoard);

    render(<KanbanBoard {...defaultProps} />);

    expect(
      await screen.findByText(/couldn't load your board/i)
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByDisplayValue("Backlog")).toBeInTheDocument();
  });

  it("renames a column on blur", async () => {
    vi.spyOn(api, "getBoard").mockResolvedValue(baseBoard);
    const renamed = { ...baseBoard, columns: [{ ...baseBoard.columns[0], title: "Triage" }, baseBoard.columns[1]] };
    vi.spyOn(api, "renameColumn").mockResolvedValue(renamed);

    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-a");
    const input = within(column).getByLabelText("Column title");

    await userEvent.clear(input);
    await userEvent.type(input, "Triage");
    await userEvent.tab();

    expect(api.renameColumn).toHaveBeenCalledWith("board-1", "col-a", "Triage");
    expect(await screen.findByDisplayValue("Triage")).toBeInTheDocument();
  });

  it("adds and removes a card via the API", async () => {
    vi.spyOn(api, "getBoard").mockResolvedValue(baseBoard);
    const withNewCard: BoardData = {
      columns: [
        { ...baseBoard.columns[0], cardIds: ["card-1", "card-2"] },
        baseBoard.columns[1],
      ],
      cards: {
        ...baseBoard.cards,
        "card-2": {
          id: "card-2",
          title: "New card",
          details: "Notes",
          dueDate: null,
          assigneeText: null,
          labels: [],
          commentCount: 0,
        },
      },
    };
    vi.spyOn(api, "addCard").mockResolvedValue(withNewCard);
    vi.spyOn(api, "deleteCard").mockResolvedValue(baseBoard);

    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-a");

    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/details/i),
      "Notes"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(api.addCard).toHaveBeenCalledWith("board-1", "col-a", "New card", "Notes");
    expect(await within(column).findByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(api.deleteCard).toHaveBeenCalledWith("board-1", "card-2");
    await waitFor(() =>
      expect(within(column).queryByText("New card")).not.toBeInTheDocument()
    );
  });

  it("shows a mutation error banner when a request fails", async () => {
    vi.spyOn(api, "getBoard").mockResolvedValue(baseBoard);
    vi.spyOn(api, "renameColumn").mockRejectedValue(new Error("boom"));

    render(<KanbanBoard {...defaultProps} />);
    const column = await screen.findByTestId("column-col-a");
    const input = within(column).getByLabelText("Column title");

    await userEvent.clear(input);
    await userEvent.type(input, "Triage");
    await userEvent.tab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /didn't save/i
    );
  });
});
