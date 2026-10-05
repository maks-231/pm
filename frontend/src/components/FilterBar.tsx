"use client";

import type { FilterState, Label } from "@/lib/kanban";

type FilterBarProps = {
  filters: FilterState;
  availableLabels: Label[];
  onChange: (filters: FilterState) => void;
};

export const FilterBar = ({ filters, availableLabels, onChange }: FilterBarProps) => {
  const toggleLabel = (labelId: string) => {
    const labelIds = filters.labelIds.includes(labelId)
      ? filters.labelIds.filter((id) => id !== labelId)
      : [...filters.labelIds, labelId];
    onChange({ ...filters, labelIds });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={filters.text}
        onChange={(event) => onChange({ ...filters, text: event.target.value })}
        placeholder="Search cards…"
        aria-label="Search cards"
        className="w-40 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      <input
        value={filters.assigneeText}
        onChange={(event) =>
          onChange({ ...filters, assigneeText: event.target.value })
        }
        placeholder="Assignee"
        aria-label="Filter by assignee"
        className="w-28 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      <input
        type="date"
        value={filters.dueAfter ?? ""}
        onChange={(event) =>
          onChange({ ...filters, dueAfter: event.target.value || null })
        }
        aria-label="Due after"
        className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      <input
        type="date"
        value={filters.dueBefore ?? ""}
        onChange={(event) =>
          onChange({ ...filters, dueBefore: event.target.value || null })
        }
        aria-label="Due before"
        className="rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      {availableLabels.map((label) => {
        const isActive = filters.labelIds.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => toggleLabel(label.id)}
            aria-pressed={isActive}
            style={isActive ? { backgroundColor: label.color } : undefined}
            className={
              isActive
                ? "rounded-full px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)]"
            }
          >
            {label.name}
          </button>
        );
      })}
    </div>
  );
};
