import { resolveDropTarget, type Column } from "@/lib/kanban";

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
