import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { KanbanCard } from "@/components/KanbanCard";
import type { Card } from "@/lib/kanban";

const baseCard: Card = {
  id: "card-1",
  title: "First card",
  details: "Some notes",
  dueDate: null,
  assigneeText: null,
  labels: [],
  commentCount: 0,
};

// useSortable requires a DndContext ancestor. Matches KanbanBoard's actual
// sensor setup (a plain DndContext's default sensors intercept clicks on
// nested buttons under jsdom).
const Wrapper = ({ card, onOpenDetails, onDelete }: {
  card: Card;
  onOpenDetails: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  return (
    <DndContext sensors={sensors} onDragEnd={() => {}}>
      <KanbanCard card={card} onDelete={onDelete} onOpenDetails={onOpenDetails} />
    </DndContext>
  );
};

const renderCard = (card: Card, onOpenDetails = vi.fn(), onDelete = vi.fn()) =>
  render(<Wrapper card={card} onOpenDetails={onOpenDetails} onDelete={onDelete} />);

describe("KanbanCard", () => {
  it("renders no badges when there's no metadata", () => {
    renderCard(baseCard);
    expect(screen.queryByText(/2026-/)).not.toBeInTheDocument();
  });

  it("renders a due date badge", () => {
    renderCard({ ...baseCard, dueDate: "2026-11-01" });
    expect(screen.getByText("2026-11-01")).toBeInTheDocument();
  });

  it("renders label chips", () => {
    renderCard({
      ...baseCard,
      labels: [{ id: "label-1", name: "Urgent", color: "#ecad0a" }],
    });
    expect(screen.getByText("Urgent")).toBeInTheDocument();
  });

  it("renders assignee initials", () => {
    renderCard({ ...baseCard, assigneeText: "Alex Doe" });
    expect(screen.getByText("AD")).toBeInTheDocument();
  });

  it("calls onOpenDetails when the title/details area is clicked", async () => {
    const onOpenDetails = vi.fn();
    renderCard(baseCard, onOpenDetails);

    await userEvent.click(screen.getByText("First card"));

    expect(onOpenDetails).toHaveBeenCalledWith("card-1");
  });

  it("calls onDelete when the delete button is clicked", async () => {
    const onDelete = vi.fn();
    renderCard(baseCard, vi.fn(), onDelete);

    await userEvent.click(screen.getByRole("button", { name: /delete first card/i }));

    expect(onDelete).toHaveBeenCalledWith("card-1");
  });
});
