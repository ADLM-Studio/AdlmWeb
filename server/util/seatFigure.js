// server/util/seatFigure.js
//
// ONE SEAT FIGURE FOR AN ACCOUNT OR A FIRM — AND WHY IT IS NEVER A SUM
//
// "Seats" is the number of USERS a piece of software is licensed for. It is a
// per-product number on each entitlement, and the desktop products enforce it
// per product against the machines bound to that one licence. An account that
// holds QUIV on 3 seats and RateGen on 3 seats has 3 seats, not 6: the same
// three people use both. Adding the seats of every product together produced
// a figure that was neither the seat count nor the product count, and the
// People register showed Melodiva Projects (two products, one licence) as 3.
//
// "Software" — how many different products the account holds — is a separate
// figure, shown under its own word, never under "seats".
//
// So where a register needs one seat figure for several entitlements, this is
// it: the seats of the licence. Across an organisation's products the counts
// should be equal; when they are not, the figure is a range ("2–3", with the
// en dash every placeholder and range on the site uses) and never the sum.
//
// This file is the only place that arithmetic lives, so it cannot be done a
// second way somewhere else.

const n = (v) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) && x > 0 ? x : 1;
};

/**
 * The seat figure across several entitlements (or anything carrying `seats`).
 *
 * Returns { min, max, label }. An empty list is { 0, 0, "" } — "no licence"
 * rather than "0 seats", which the screens render as a dash.
 */
export function seatFigure(items) {
  const counts = (items || [])
    .map((e) => (e && typeof e === "object" ? e.seats : e))
    .filter((v) => v !== undefined && v !== null)
    .map(n);
  if (!counts.length) return { min: 0, max: 0, label: "" };
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return { min, max, label: seatLabel(min, max) };
}

/** "3", or "2–3" when the counts differ. */
export function seatLabel(min, max) {
  if (!max) return "";
  return min === max ? String(max) : `${min}–${max}`;
}

/** "3 seats", "1 seat", "2–3 seats", or "" when there is no licence. */
export function seatsText(figure) {
  const label = typeof figure === "string" ? figure : figure?.label || "";
  if (!label) return "";
  return `${label} seat${label === "1" ? "" : "s"}`;
}
