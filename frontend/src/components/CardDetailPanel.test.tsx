import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CardDetailPanel } from "@/components/CardDetailPanel";
import type { Card } from "@/lib/kanban";
import type { Comment } from "@/lib/api";

const baseCard: Card = {
  id: "card-1",
  title: "First card",
  details: "Some notes",
  dueDate: null,
  assigneeText: null,
  labels: [],
  commentCount: 0,
};

const defaultProps = {
  availableLabels: [],
  onClose: () => {},
  onUpdateCard: () => Promise.resolve(true),
  onSetLabels: () => Promise.resolve(true),
  onListComments: (): Promise<Comment[]> => Promise.resolve([]),
  onAddComment: (): Promise<Comment> =>
    Promise.resolve({
      id: "comment-1",
      author: "user",
      body: "x",
      createdAt: "now",
    }),
};

describe("CardDetailPanel", () => {
  it("commits a title change on blur", async () => {
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onUpdateCard={onUpdateCard} />
    );

    const input = screen.getByLabelText("Card title");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed card");
    await userEvent.tab();

    expect(onUpdateCard).toHaveBeenCalledWith({ title: "Renamed card" });
  });

  it("sets the due date immediately on change", async () => {
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onUpdateCard={onUpdateCard} />
    );

    const dueDateInput = screen.getByLabelText("Due date");
    await userEvent.type(dueDateInput, "2026-11-01");

    expect(onUpdateCard).toHaveBeenCalledWith({ due_date: "2026-11-01" });
  });

  it("commits an assignee change on blur", async () => {
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onUpdateCard={onUpdateCard} />
    );

    const assigneeInput = screen.getByLabelText("Assignee");
    await userEvent.type(assigneeInput, "Alex");
    await userEvent.tab();

    expect(onUpdateCard).toHaveBeenCalledWith({ assignee_text: "Alex" });
  });

  it("adds a new label", async () => {
    const onSetLabels = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onSetLabels={onSetLabels} />
    );

    await userEvent.type(screen.getByLabelText("New label"), "Urgent{enter}");

    expect(onSetLabels).toHaveBeenCalledWith(["Urgent"]);
  });

  it("toggles off an existing label", async () => {
    const onSetLabels = vi.fn().mockResolvedValue(true);
    const cardWithLabel: Card = {
      ...baseCard,
      labels: [{ id: "label-1", name: "Urgent", color: "#ecad0a" }],
    };
    render(
      <CardDetailPanel
        {...defaultProps}
        card={cardWithLabel}
        onSetLabels={onSetLabels}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /urgent/i }));

    expect(onSetLabels).toHaveBeenCalledWith([]);
  });

  it("toggles on a suggested label", async () => {
    const onSetLabels = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel
        {...defaultProps}
        card={baseCard}
        availableLabels={[{ id: "label-1", name: "Bug", color: "#209dd7" }]}
        onSetLabels={onSetLabels}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /\+ bug/i }));

    expect(onSetLabels).toHaveBeenCalledWith(["Bug"]);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(<CardDetailPanel {...defaultProps} card={baseCard} onClose={onClose} />);

    await userEvent.click(
      screen.getByRole("button", { name: /close card details/i })
    );

    expect(onClose).toHaveBeenCalled();
  });

  it("loads and renders existing comments", async () => {
    const onListComments = vi.fn().mockResolvedValue([
      { id: "comment-1", author: "user", body: "Looks good", createdAt: "now" },
    ]);
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onListComments={onListComments} />
    );

    expect(await screen.findByText("Looks good")).toBeInTheDocument();
    expect(screen.getByText("user")).toBeInTheDocument();
  });

  it("submits a new comment and appends it to the list", async () => {
    const onAddComment = vi.fn().mockResolvedValue({
      id: "comment-2",
      author: "user",
      body: "Nice work",
      createdAt: "now",
    });
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onAddComment={onAddComment} />
    );

    await userEvent.type(screen.getByLabelText("New comment"), "Nice work");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(onAddComment).toHaveBeenCalledWith("Nice work");
    expect(await screen.findByText("Nice work")).toBeInTheDocument();
  });

  it("shows an error when adding a comment fails", async () => {
    const onAddComment = vi.fn().mockRejectedValue(new Error("network error"));
    render(
      <CardDetailPanel {...defaultProps} card={baseCard} onAddComment={onAddComment} />
    );

    await userEvent.type(screen.getByLabelText("New comment"), "Nice work");
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong/i);
  });
});
