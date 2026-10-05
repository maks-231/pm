import {
  EMPTY_FILTER,
  filterBoard,
  resolveDropTarget,
  type BoardData,
  type Card,
  type Column,
  type FilterState,
} from "@/lib/kanban";

describe("resolveDropTarget", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("resolves reordering within the same column", () => {
    expect(resolveDropTarget(baseColumns, "card-2", "card-1")).toEqual({
      columnId: "col-a",
      index: 0,
    });
  });

  it("resolves moving a card to another column, before an existing card", () => {
    expect(resolveDropTarget(baseColumns, "card-2", "card-3")).toEqual({
      columnId: "col-b",
      index: 0,
    });
  });

  it("resolves dropping on a column's empty area as appending to the end", () => {
    expect(resolveDropTarget(baseColumns, "card-1", "col-b")).toEqual({
      columnId: "col-b",
      index: 1,
    });
  });

  it("resolves dropping into an empty column", () => {
    const columns: Column[] = [
      { id: "col-a", title: "A", cardIds: ["card-1"] },
      { id: "col-b", title: "B", cardIds: [] },
    ];
    expect(resolveDropTarget(columns, "card-1", "col-b")).toEqual({
      columnId: "col-b",
      index: 0,
    });
  });

  it("returns null when the drop target can't be resolved", () => {
    expect(resolveDropTarget(baseColumns, "card-1", "does-not-exist")).toBeNull();
  });
});

describe("filterBoard", () => {
  const card = (overrides: Partial<Card>): Card => ({
    id: "card-x",
    title: "Title",
    details: "Details",
    dueDate: null,
    assigneeText: null,
    labels: [],
    commentCount: 0,
    ...overrides,
  });

  const board: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
      { id: "col-b", title: "B", cardIds: ["card-3"] },
    ],
    cards: {
      "card-1": card({
        id: "card-1",
        title: "Fix login bug",
        details: "Users can't sign in",
        dueDate: "2026-11-01",
        assigneeText: "Alex",
        labels: [{ id: "label-1", name: "Urgent", color: "#ecad0a" }],
      }),
      "card-2": card({
        id: "card-2",
        title: "Write docs",
        details: "API reference",
        dueDate: "2026-12-01",
        assigneeText: "Sam",
      }),
      "card-3": card({ id: "card-3", title: "Design review", details: "" }),
    },
  };

  const withFilter = (overrides: Partial<FilterState>): FilterState => ({
    ...EMPTY_FILTER,
    ...overrides,
  });

  it("returns the same board unchanged when the filter is empty", () => {
    expect(filterBoard(board, EMPTY_FILTER)).toBe(board);
  });

  it("filters by text matching title or details, case-insensitively", () => {
    const result = filterBoard(board, withFilter({ text: "LOGIN" }));
    expect(result.columns[0].cardIds).toEqual(["card-1"]);
    expect(result.columns[1].cardIds).toEqual([]);
  });

  it("filters by label id", () => {
    const result = filterBoard(board, withFilter({ labelIds: ["label-1"] }));
    expect(result.columns[0].cardIds).toEqual(["card-1"]);
  });

  it("filters by assignee substring, case-insensitively", () => {
    const result = filterBoard(board, withFilter({ assigneeText: "sam" }));
    expect(result.columns[0].cardIds).toEqual(["card-2"]);
  });

  it("filters by due date range, inclusive", () => {
    const result = filterBoard(
      board,
      withFilter({ dueAfter: "2026-11-01", dueBefore: "2026-11-30" })
    );
    expect(result.columns[0].cardIds).toEqual(["card-1"]);
  });

  it("excludes cards with no due date when a date filter is active", () => {
    const result = filterBoard(board, withFilter({ dueAfter: "2026-01-01" }));
    expect(result.columns[1].cardIds).toEqual([]);
  });

  it("combines filters with AND", () => {
    const result = filterBoard(
      board,
      withFilter({ text: "fix", assigneeText: "sam" })
    );
    expect(result.columns[0].cardIds).toEqual([]);
  });

  it("never mutates the cards dict", () => {
    const result = filterBoard(board, withFilter({ text: "login" }));
    expect(result.cards).toBe(board.cards);
  });
});
