import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { FilterBar } from "@/components/FilterBar";
import { EMPTY_FILTER, type FilterState } from "@/lib/kanban";

const labels = [
  { id: "label-1", name: "Urgent", color: "#ecad0a" },
  { id: "label-2", name: "Bug", color: "#209dd7" },
];

// FilterBar is fully controlled (no internal state), so a real usage needs
// the parent to feed each onChange back in — mirrors how KanbanBoard uses it.
const ControlledFilterBar = ({
  onChange,
  availableLabels = labels,
}: {
  onChange: (filters: FilterState) => void;
  availableLabels?: typeof labels;
}) => {
  const [filters, setFilters] = useState(EMPTY_FILTER);
  return (
    <FilterBar
      filters={filters}
      availableLabels={availableLabels}
      onChange={(next) => {
        setFilters(next);
        onChange(next);
      }}
    />
  );
};

describe("FilterBar", () => {
  it("calls onChange with updated text as the user types", async () => {
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Search cards"), "bug");

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, text: "bug" });
  });

  it("calls onChange with updated assignee text", async () => {
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Filter by assignee"), "Al");

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, assigneeText: "Al" });
  });

  it("toggles a label filter on and off", async () => {
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Urgent" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      labelIds: ["label-1"],
    });

    await userEvent.click(screen.getByRole("button", { name: "Urgent" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTER, labelIds: [] });
  });

  it("sets due-after and due-before dates", async () => {
    const onChange = vi.fn();
    render(<ControlledFilterBar onChange={onChange} />);

    await userEvent.type(screen.getByLabelText("Due after"), "2026-11-01");
    expect(onChange).toHaveBeenLastCalledWith({
      ...EMPTY_FILTER,
      dueAfter: "2026-11-01",
    });
  });
});
