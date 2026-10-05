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
