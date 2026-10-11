// The key a bill line's screen-side overrides (rate, actuals, status,
// category, trade, rate stamp) are kept under while they wait for Save.
//
// sn, code and description are the plugin's own identity for a line, so a key
// survives a reorder. But two lines of a QUIV bill can be identical in all
// three (the plugin stores sn as 0, so two "225mm blockwork" lines are twins)
// and they used to share one key: typing a rate on one priced both, and
// dragging one into a section moved both. Twins now get "#<index>" appended;
// every other line keeps its plain key, so nothing cached under the old keys
// is disturbed.

export function materialDescription(it) {
  const takeoff = String(it?.takeoffLine || "").trim();
  const mat = String(it?.materialName || "").trim();
  if (takeoff || mat) return [takeoff, mat].filter(Boolean).join(" - ");
  return String(it?.description || "").trim();
}

export function baseItemKey(it, i, showMaterials = false) {
  const sn = it?.sn ?? i + 1;
  const code = String(it?.code || "");
  const desc = showMaterials
    ? materialDescription(it)
    : String(it?.description || "");
  return `${sn}::${code}::${desc}`;
}

/** One key per line, unique within the list. */
export function buildItemKeys(items, showMaterials = false) {
  const list = Array.isArray(items) ? items : [];
  const base = list.map((it, i) => baseItemKey(it, i, showMaterials));
  const counts = new Map();
  for (const k of base) counts.set(k, (counts.get(k) || 0) + 1);
  return base.map((k, i) => (counts.get(k) > 1 ? `${k}#${i}` : k));
}
