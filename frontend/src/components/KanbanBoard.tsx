"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { ChatSidebar } from "@/components/ChatSidebar";
import { resolveDropTarget, type BoardData } from "@/lib/kanban";
import * as api from "@/lib/api";

type KanbanBoardProps = {
  onLogout: () => void;
};

// closestCorners compares rect corners, not pointer position: an empty
// column's container rect is much larger than a card's, so its corners can
// lose to a same-sized card in a neighboring column even when the pointer
// is squarely inside the empty column. Checking pointer containment first
// (falling back to rectIntersection for edge cases, e.g. the pointer
// briefly over a gap) matches what the user actually sees.
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

const MUTATION_ERROR_MESSAGE = "That didn't save. Please try again.";

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);

  const loadBoard = () => {
    setLoadError(false);
    setBoard(null);
    api.getBoard().then(setBoard).catch(() => setLoadError(true));
  };

  // Not loadBoard() directly: that resets state synchronously before the
  // fetch, which is only needed for the "Try again" button's retry case,
  // not the initial mount (state already starts at these defaults).
  useEffect(() => {
    api.getBoard().then(setBoard).catch(() => setLoadError(true));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const cardsById = useMemo(() => board?.cards ?? {}, [board]);
  const totalCardCount = board ? Object.keys(board.cards).length : 0;

  const runMutation = (mutation: Promise<BoardData>): Promise<boolean> => {
    setMutationError(false);
    return mutation
      .then((updated) => {
        setBoard(updated);
        return true;
      })
      .catch(() => {
        setMutationError(true);
        return false;
      });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const target = resolveDropTarget(
      board.columns,
      active.id as string,
      over.id as string
    );
    if (!target) {
      return;
    }

    runMutation(api.moveCard(active.id as string, target.columnId, target.index));
  };

  const handleRenameColumn = (columnId: string, title: string) =>
    runMutation(api.renameColumn(columnId, title));

  const handleAddCard = (columnId: string, title: string, details: string) =>
    runMutation(api.addCard(columnId, title, details || "No details yet."));

  const handleDeleteCard = (_columnId: string, cardId: string) => {
    runMutation(api.deleteCard(cardId));
  };

  const activeCard = activeCardId ? cardsById[activeCardId] : null;

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--surface)] px-6 text-center">
        <p className="text-sm font-medium text-[var(--gray-text)]">
          Couldn&apos;t load your board.
        </p>
        <button
          type="button"
          onClick={loadBoard}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface)]">
        <p className="text-sm font-medium text-[var(--gray-text)]">
          Loading your board…
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1800px] flex-col gap-8 px-6 pb-16 pt-10">
        <header className="flex flex-wrap items-center justify-between gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 px-8 py-6 shadow-[var(--shadow)] backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
              Single Board Kanban
            </p>
            <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--primary-blue)]">
                {board.columns.length} columns · {totalCardCount} cards
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Log out
            </button>
          </div>
          {mutationError && (
            <p role="alert" className="w-full text-sm font-medium text-red-600">
              {MUTATION_ERROR_MESSAGE}
            </p>
          )}
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid flex-1 gap-6 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <ChatSidebar onBoardUpdate={setBoard} />
    </div>
  );
};
