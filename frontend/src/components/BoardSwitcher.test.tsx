import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { BoardSwitcher } from "@/components/BoardSwitcher";

const boards = [
  { id: "board-1", name: "Board 1" },
  { id: "board-2", name: "Side project" },
];

describe("BoardSwitcher", () => {
  it("shows the current board's name on the toggle button", () => {
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /board 1/i })).toBeInTheDocument();
  });

  it("switches to another board when selected from the dropdown", async () => {
    const onSwitch = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={onSwitch}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /board 1/i }));
    await userEvent.click(screen.getByRole("button", { name: "Side project" }));

    expect(onSwitch).toHaveBeenCalledWith("board-2");
  });

  it("creates a new board with the typed name", async () => {
    const onCreate = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={() => {}}
        onCreate={onCreate}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /board 1/i }));
    await userEvent.click(screen.getByRole("button", { name: /new board/i }));
    await userEvent.type(screen.getByPlaceholderText("Board name"), "Marketing");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onCreate).toHaveBeenCalledWith("Marketing");
  });

  it("deletes a board after confirming", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDelete = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /board 1/i }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Side project" })
    );

    expect(onDelete).toHaveBeenCalledWith("board-2");
  });

  it("does not delete a board when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onDelete = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={() => {}}
        onCreate={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /board 1/i }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Side project" })
    );

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renames a board on blur", async () => {
    const onRename = vi.fn();
    render(
      <BoardSwitcher
        boards={boards}
        currentBoardId="board-1"
        onSwitch={() => {}}
        onCreate={() => {}}
        onRename={onRename}
        onDelete={() => {}}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /board 1/i }));
    await userEvent.click(screen.getByRole("button", { name: "Rename Board 1" }));
    const input = screen.getByDisplayValue("Board 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    await userEvent.tab();

    expect(onRename).toHaveBeenCalledWith("board-1", "Renamed");
  });
});
