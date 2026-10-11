// client/src/lib/seatFigure.js
//
// The one seat figure for several licences — the client half of
// server/util/seatFigure.js, and the same rule:
//
// "Seats" is the number of users ONE product is licensed for. Across an
// account's products the figure is the seats of the licence — equal across
// its products, or a range ("2–3") when they differ — and NEVER the sum.
// How many products the account holds is "software", a separate number shown
// under its own word.

const n = (v) => {
  const x = Math.floor(Number(v));
  return Number.isFinite(x) && x > 0 ? x : 1;
};

/** { min, max, label } across items carrying `seats` (or bare numbers). */
export function seatFigure(items) {
  const counts = (items || [])
    .map((e) => (e && typeof e === "object" ? e.seats : e))
    .filter((v) => v !== undefined && v !== null)
    .map(n);
  if (!counts.length) return { min: 0, max: 0, label: "" };
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  return { min, max, label: min === max ? String(max) : `${min}–${max}` };
}

/**
 * "3 seats", "1 seat", "2–3 seats", or "" for no licence. Takes the figure,
 * its label, or a plain number, so a screen that already has the label from
 * the server can use it directly.
 */
export function seatsText(v) {
  const label = v && typeof v === "object" ? v.label : v == null ? "" : String(v);
  if (!label || label === "0") return "";
  return `${label} seat${label === "1" ? "" : "s"}`;
}
