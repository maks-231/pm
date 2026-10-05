"use client";

import { useState } from "react";
import type { Card, Label } from "@/lib/kanban";
import type { UpdateCardFields } from "@/lib/api";

type CardDetailPanelProps = {
  card: Card;
  availableLabels: Label[];
  onClose: () => void;
  onUpdateCard: (fields: UpdateCardFields) => Promise<boolean>;
  onSetLabels: (labelNames: string[]) => Promise<boolean>;
};

export const CardDetailPanel = ({
  card,
  availableLabels,
  onClose,
  onUpdateCard,
  onSetLabels,
}: CardDetailPanelProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [assignee, setAssignee] = useState(card.assigneeText ?? "");
  const [newLabel, setNewLabel] = useState("");

  const labelNames = card.labels.map((label) => label.name);
  const selectedNames = new Set(labelNames);
  const suggestions = availableLabels.filter(
    (label) => !selectedNames.has(label.name)
  );

  const commitTitle = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== card.title) {
      onUpdateCard({ title: trimmed }).then((succeeded) => {
        if (!succeeded) {
          setTitle(card.title);
        }
      });
    } else {
      setTitle(card.title);
    }
  };

  const commitDetails = () => {
    if (details !== card.details) {
      onUpdateCard({ details }).then((succeeded) => {
        if (!succeeded) {
          setDetails(card.details);
        }
      });
    }
  };

  const commitAssignee = () => {
    if (assignee !== (card.assigneeText ?? "")) {
      onUpdateCard({ assignee_text: assignee });
    }
  };

  const toggleLabel = (name: string) => {
    const next = selectedNames.has(name)
      ? labelNames.filter((existing) => existing !== name)
      : [...labelNames, name];
    onSetLabels(next);
  };

  const addNewLabel = () => {
    const trimmed = newLabel.trim();
    if (trimmed && !selectedNames.has(trimmed)) {
      onSetLabels([...labelNames, trimmed]);
      setNewLabel("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/30 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
            aria-label="Card title"
            className="w-full bg-transparent font-display text-xl font-semibold text-[var(--navy-dark)] outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card details"
            className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
          >
            Close
          </button>
        </div>

        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          onBlur={commitDetails}
          rows={3}
          aria-label="Card details"
          className="mt-4 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
        />

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Due date
            </label>
            <input
              type="date"
              value={card.dueDate ?? ""}
              onChange={(event) => onUpdateCard({ due_date: event.target.value })}
              aria-label="Due date"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
              Assignee
            </label>
            <input
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              onBlur={commitAssignee}
              aria-label="Assignee"
              className="mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Labels
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {card.labels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => toggleLabel(label.name)}
                style={{ backgroundColor: label.color }}
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
              >
                {label.name} ×
              </button>
            ))}
            {suggestions.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => toggleLabel(label.name)}
                className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs font-semibold text-[var(--gray-text)] transition hover:border-[var(--primary-blue)]"
              >
                + {label.name}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addNewLabel();
                }
              }}
              placeholder="New label"
              aria-label="New label"
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            />
            <button
              type="button"
              onClick={addNewLabel}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add label
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
