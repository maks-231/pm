"use client";

import { useEffect, useState } from "react";
import type { Card, Label } from "@/lib/kanban";
import type { Comment, UpdateCardFields } from "@/lib/api";

type CardDetailPanelProps = {
  card: Card;
  availableLabels: Label[];
  onClose: () => void;
  onUpdateCard: (fields: UpdateCardFields) => Promise<boolean>;
  onSetLabels: (labelNames: string[]) => Promise<boolean>;
  onListComments: () => Promise<Comment[]>;
  onAddComment: (body: string) => Promise<Comment>;
};

export const CardDetailPanel = ({
  card,
  availableLabels,
  onClose,
  onUpdateCard,
  onSetLabels,
  onListComments,
  onAddComment,
}: CardDetailPanelProps) => {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [assignee, setAssignee] = useState(card.assigneeText ?? "");
  const [newLabel, setNewLabel] = useState("");
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState(false);

  useEffect(() => {
    onListComments()
      .then(setComments)
      .catch(() => setCommentError(true));
    // Only re-fetch if the open card itself changes, not on every parent
    // re-render (onListComments is a fresh closure each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

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

  const submitComment = async () => {
    const trimmed = newComment.trim();
    if (!trimmed || isSubmittingComment) {
      return;
    }
    setIsSubmittingComment(true);
    setCommentError(false);
    try {
      const comment = await onAddComment(trimmed);
      setComments((prev) => [...(prev ?? []), comment]);
      setNewComment("");
    } catch {
      setCommentError(true);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--navy-dark)]/30 px-6"
      onClick={onClose}
    >
      <div
        data-testid="card-detail-panel"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
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

        <div className="mt-6 border-t border-[var(--stroke)] pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]">
            Comments
          </p>
          <div className="mt-2 space-y-2">
            {(comments ?? []).map((comment) => (
              <div
                key={comment.id}
                data-testid={`comment-${comment.id}`}
                className="rounded-xl bg-[var(--surface)] px-3 py-2 text-sm"
              >
                <p className="text-xs font-semibold text-[var(--navy-dark)]">
                  {comment.author}
                </p>
                <p className="mt-1 text-[var(--navy-dark)]">{comment.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitComment();
                }
              }}
              placeholder="Add a comment…"
              aria-label="New comment"
              disabled={isSubmittingComment}
              className="flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={submitComment}
              disabled={isSubmittingComment || !newComment.trim()}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
            >
              Comment
            </button>
          </div>
          {commentError && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-600">
              Something went wrong. Please try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
