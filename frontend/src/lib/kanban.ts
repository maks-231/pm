export type Label = {
  id: string;
  name: string;
  color: string;
};

export type Card = {
  id: string;
  title: string;
  details: string;
  dueDate: string | null;
  assigneeText: string | null;
  labels: Label[];
  commentCount: number;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumn = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return columns.find((column) => column.id === id);
  }
  return columns.find((column) => column.cardIds.includes(id));
};

export type DropTarget = {
  columnId: string;
  index: number;
};

// Figures out where a drag-and-drop gesture is asking a card to land, as a
// {columnId, index} pair matching the backend's PATCH /api/board/cards/:id/move
// payload (index is relative to the target column's cards with the active
// card excluded, same as the backend computes it).
export const resolveDropTarget = (
  columns: Column[],
  activeId: string,
  overId: string
): DropTarget | null => {
  const overColumn = findColumn(columns, overId);
  if (!overColumn) {
    return null;
  }

  if (isColumnId(columns, overId)) {
    const cardIds = overColumn.cardIds.filter((id) => id !== activeId);
    return { columnId: overColumn.id, index: cardIds.length };
  }

  const cardIds = overColumn.cardIds.filter((id) => id !== activeId);
  const index = cardIds.indexOf(overId);
  return { columnId: overColumn.id, index: index === -1 ? cardIds.length : index };
};

export type FilterState = {
  text: string;
  labelIds: string[];
  assigneeText: string;
  dueBefore: string | null;
  dueAfter: string | null;
};

export const EMPTY_FILTER: FilterState = {
  text: "",
  labelIds: [],
  assigneeText: "",
  dueBefore: null,
  dueAfter: null,
};

export const isFilterEmpty = (filters: FilterState): boolean =>
  !filters.text &&
  filters.labelIds.length === 0 &&
  !filters.assigneeText &&
  !filters.dueBefore &&
  !filters.dueAfter;

const cardMatchesFilter = (card: Card, filters: FilterState): boolean => {
  if (filters.text) {
    const haystack = `${card.title} ${card.details}`.toLowerCase();
    if (!haystack.includes(filters.text.toLowerCase())) {
      return false;
    }
  }
  if (filters.labelIds.length > 0) {
    const cardLabelIds = new Set(card.labels.map((label) => label.id));
    if (!filters.labelIds.some((id) => cardLabelIds.has(id))) {
      return false;
    }
  }
  if (filters.assigneeText) {
    const assignee = (card.assigneeText ?? "").toLowerCase();
    if (!assignee.includes(filters.assigneeText.toLowerCase())) {
      return false;
    }
  }
  if (filters.dueBefore && (!card.dueDate || card.dueDate > filters.dueBefore)) {
    return false;
  }
  if (filters.dueAfter && (!card.dueDate || card.dueDate < filters.dueAfter)) {
    return false;
  }
  return true;
};

// Client-side only: narrows each column's cardIds to matches, AND-ing every
// active filter. `cards` passes through unchanged so callers that need the
// real, unfiltered board (drag-and-drop, mutations) keep working from it.
export const filterBoard = (board: BoardData, filters: FilterState): BoardData => {
  if (isFilterEmpty(filters)) {
    return board;
  }
  return {
    cards: board.cards,
    columns: board.columns.map((column) => ({
      ...column,
      cardIds: column.cardIds.filter((id) =>
        cardMatchesFilter(board.cards[id], filters)
      ),
    })),
  };
};
