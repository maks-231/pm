import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { CardDetailPanel } from "@/components/CardDetailPanel";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: "card-1",
  title: "First card",
  details: "Some notes",
  dueDate: null,
  assigneeText: null,
  labels: [],
};

describe("CardDetailPanel", () => {
  it("commits a title change on blur", async () => {
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel
        card={baseCard}
        availableLabels={[]}
        onClose={() => {}}
        onUpdateCard={onUpdateCard}
        onSetLabels={() => Promise.resolve(true)}
      />
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
      <CardDetailPanel
        card={baseCard}
        availableLabels={[]}
        onClose={() => {}}
        onUpdateCard={onUpdateCard}
        onSetLabels={() => Promise.resolve(true)}
      />
    );

    const dueDateInput = screen.getByLabelText("Due date");
    await userEvent.type(dueDateInput, "2026-11-01");

    expect(onUpdateCard).toHaveBeenCalledWith({ due_date: "2026-11-01" });
  });

  it("commits an assignee change on blur", async () => {
    const onUpdateCard = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel
        card={baseCard}
        availableLabels={[]}
        onClose={() => {}}
        onUpdateCard={onUpdateCard}
        onSetLabels={() => Promise.resolve(true)}
      />
    );

    const assigneeInput = screen.getByLabelText("Assignee");
    await userEvent.type(assigneeInput, "Alex");
    await userEvent.tab();

    expect(onUpdateCard).toHaveBeenCalledWith({ assignee_text: "Alex" });
  });

  it("adds a new label", async () => {
    const onSetLabels = vi.fn().mockResolvedValue(true);
    render(
      <CardDetailPanel
        card={baseCard}
        availableLabels={[]}
        onClose={() => {}}
        onUpdateCard={() => Promise.resolve(true)}
        onSetLabels={onSetLabels}
      />
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
        card={cardWithLabel}
        availableLabels={[]}
        onClose={() => {}}
        onUpdateCard={() => Promise.resolve(true)}
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
        card={baseCard}
        availableLabels={[{ id: "label-1", name: "Bug", color: "#209dd7" }]}
        onClose={() => {}}
        onUpdateCard={() => Promise.resolve(true)}
        onSetLabels={onSetLabels}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /\+ bug/i }));

    expect(onSetLabels).toHaveBeenCalledWith(["Bug"]);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <CardDetailPanel
        card={baseCard}
        availableLabels={[]}
        onClose={onClose}
        onUpdateCard={() => Promise.resolve(true)}
        onSetLabels={() => Promise.resolve(true)}
      />
    );

    await userEvent.click(
      screen.getByRole("button", { name: /close card details/i })
    );

    expect(onClose).toHaveBeenCalled();
  });
});
