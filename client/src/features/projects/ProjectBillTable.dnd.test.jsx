// Dragging a bill line into a section (the Melodiva Projects demo, 10 Oct 2026).
//
// What a QS does: adds a section, then drags lines "into the folder" — onto
// its header, or onto a line already in it. What is tested: that both drops
// file the line under that section, that a drop inside the line's own section
// only reorders, that two identical QUIV lines (sn 0, same code, same
// description) are told apart, and that a merged project's source grouping
// cannot be written to.

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import ProjectBillTable from "./ProjectBillTable.jsx";

afterEach(cleanup);

const CATS = ["Substructure", "Walls", "External works", "Uncategorized"];

function rows(items) {
  return items.map((it, i) => ({
    i,
    key: `${it.sn ?? i + 1}::${it.code || ""}::${it.description}`,
    sn: it.sn,
    description: it.description,
    qty: 1,
    unit: "m",
    rate: 10,
    fullAmount: 10,
    amount: 10,
    valuedAmount: 0,
    category: it.category,
    trade: it.trade || "",
    sourceName: it.sourceName || "",
    isMarked: false,
    percentComplete: 0,
  }));
}

const LINES = [
  { sn: 0, code: "SUB-01", description: "Excavate trench", category: "Substructure" },
  { sn: 0, code: "WAL-01", description: "225mm blockwork", category: "Walls" },
  { sn: 0, code: "WAL-01", description: "225mm blockwork", category: "Walls" },
  { sn: 0, code: "", description: "Interlocking paving", category: "Walls" },
];

// A fake DataTransfer: jsdom has none, and the handlers touch it.
function dt() {
  const data = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (k, v) => {
      data[k] = v;
    },
    getData: (k) => data[k],
    setDragImage: () => {},
    data,
  };
}

function renderBill(extra = {}) {
  const onCategoryChange = vi.fn();
  const onTradeChange = vi.fn();
  const onMoveItem = vi.fn();
  const items = extra.items || LINES;
  const utils = render(
    <ProjectBillTable
      items={items}
      computedShown={rows(items)}
      categoryOptions={CATS}
      onCategoryChange={onCategoryChange}
      onTradeChange={onTradeChange}
      onMoveItem={onMoveItem}
      onRateChange={() => {}}
      onStatusToggle={() => {}}
      provisionalSums={[]}
      variations={[]}
      {...extra.props}
    />,
  );
  return { ...utils, onCategoryChange, onTradeChange, onMoveItem };
}

const lineRows = (c) => [...c.querySelectorAll("tr[data-line]")];
const section = (c, name) => c.querySelector(`tr[data-section="cat-${name}"]`);

function drag(from, to) {
  const transfer = dt();
  fireEvent.dragStart(from, { dataTransfer: transfer });
  fireEvent.dragOver(to, { dataTransfer: transfer });
  fireEvent.drop(to, { dataTransfer: transfer });
  fireEvent.dragEnd(from, { dataTransfer: transfer });
  return transfer;
}

describe("dragging a line into a section", () => {
  it("files it under the section whose header it is dropped on", () => {
    const { container, onCategoryChange, onMoveItem } = renderBill();
    const paving = lineRows(container)[3];
    drag(paving, section(container, "External works"));
    expect(onCategoryChange).toHaveBeenCalledWith(3, "External works");
    expect(onMoveItem).not.toHaveBeenCalled();
  });

  it("files it under the section of the line it is dropped on, then places it there", () => {
    const { container, onCategoryChange, onMoveItem } = renderBill();
    const [excavate, , , paving] = lineRows(container);
    drag(paving, excavate);
    expect(onCategoryChange).toHaveBeenCalledWith(3, "Substructure");
    expect(onMoveItem).toHaveBeenCalledWith(3, 0);
    // Filed first, so the parent keys the change off the line's old index.
    expect(onCategoryChange.mock.invocationCallOrder[0]).toBeLessThan(
      onMoveItem.mock.invocationCallOrder[0],
    );
  });

  it("only reorders when dropped on a line in its own section", () => {
    const { container, onCategoryChange, onMoveItem } = renderBill();
    const [, block1, , paving] = lineRows(container);
    drag(paving, block1);
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(onMoveItem).toHaveBeenCalledWith(3, 1);
  });

  it("carries data on the drag so Firefox starts it", () => {
    const { container } = renderBill();
    const transfer = drag(lineRows(container)[3], section(container, "External works"));
    expect(transfer.getData("text/plain")).toBe("3");
  });

  it("tells two identical QUIV lines apart: the dragged one is the one filed", () => {
    const { container, onCategoryChange } = renderBill();
    const [, , block2] = lineRows(container);
    drag(block2, section(container, "External works"));
    expect(onCategoryChange).toHaveBeenCalledTimes(1);
    expect(onCategoryChange).toHaveBeenCalledWith(2, "External works");
  });

  it("matches a section by name whatever its case, under the picker's spelling", () => {
    const items = [
      { sn: 0, code: "A", description: "Fence", category: "external works" },
      { sn: 0, code: "B", description: "Drain", category: "External works" },
    ];
    const { container } = renderBill({ items });
    const headers = [...container.querySelectorAll("tr[data-section]")].map(
      (tr) => tr.dataset.section,
    );
    expect(headers.filter((h) => /external works/i.test(h))).toEqual([
      "cat-External works",
    ]);
  });

  it("files by trade when the bill is grouped by trade", () => {
    const items = [
      { sn: 0, code: "A", description: "Excavate", category: "Substructure", trade: "Earthworks" },
      { sn: 0, code: "B", description: "Blockwork", category: "Walls", trade: "Masonry" },
    ];
    const { container, onCategoryChange, onTradeChange } = renderBill({
      items,
      props: { groupByMode: "trade", tradeOptions: ["Earthworks", "Masonry", "Other"] },
    });
    drag(lineRows(container)[1], section(container, "Earthworks"));
    expect(onTradeChange).toHaveBeenCalledWith(1, "Earthworks");
    expect(onCategoryChange).not.toHaveBeenCalled();
  });

  it("never writes a merged project's source name into category", () => {
    const items = [
      { sn: 0, code: "A", description: "Excavate", category: "Substructure", sourceName: "Structural" },
      { sn: 0, code: "B", description: "Blockwork", category: "Walls", sourceName: "Architectural" },
    ];
    const { container, onCategoryChange, onTradeChange, onMoveItem } = renderBill({
      items,
      props: { groupByMode: "source", sourceOptions: ["Architectural", "Structural"] },
    });
    // Sections are listed in merge order, so pick lines by key, not by row.
    const line = (key) => container.querySelector(`tr[data-line="${key}"]`);
    drag(line("0::B::Blockwork"), section(container, "Structural"));
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(onTradeChange).not.toHaveBeenCalled();
    // A drop on a line still reorders; it just cannot re-home the line.
    drag(line("0::B::Blockwork"), line("0::A::Excavate"));
    expect(onCategoryChange).not.toHaveBeenCalled();
    expect(onMoveItem).toHaveBeenCalledWith(1, 0);
  });
});
