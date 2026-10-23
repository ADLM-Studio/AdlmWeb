// server/util/teamTasks.js
//
// The team task feed (the Discord digest Richard, Ebun and Adedolapo get every
// weekday at 09:00 WAT) mirrored into ADLM Cloud so Your desk (/admin/desk) can
// show the real queue and let its owner tick things off.
//
// The feed itself lives in the owner's tasks.mjs ledger; it writes each task
// here as it posts it and reads the desk's answers back before every digest.
// What this module adds is the one field the digest never had: what KIND of
// work a task asks for. Richard's observation (15 Oct 2026): thirty-two items
// are not one problem, they are four — nine two-minute decisions, ten
// test-and-sign-offs, eleven days of drawing and two bits of admin — and a
// list that mixes them makes all of them feel like the same immovable wall.
//
// It is derived here, once, from the task's text, so the desk and the bot can
// never disagree about it. The rules are checked against the 41 tasks of the
// 15 Oct digest (teamTasks.test.js); a new wording that classifies wrongly is
// fixed by adding a rule, never by hand-tagging the task.

export const DOING = Object.freeze({
  decide: { label: "Decide", hint: "Approve, ask for changes or decline. Each is a couple of minutes.", mins: 2 },
  answer: { label: "Answer a question", hint: "Somebody is blocked until you reply. Usually one number.", mins: 5 },
  test: { label: "Test and sign off", hint: "Open it, work through the flows, then approve or send back.", mins: 25 },
  design: { label: "Design", hint: "Drawing work. Needs a clear run at it, not a gap between meetings.", mins: 90 },
  admin: { label: "Admin", hint: "Housekeeping. Nobody is blocked, but it does not go away.", mins: 10 },
});

// The order the desk's filter chips come in: quickest first.
export const DOING_ORDER = Object.freeze(["decide", "answer", "test", "design", "admin"]);

/**
 * What kind of work a task asks of its owner, from its text alone.
 * @param {string} text
 * @returns {"decide"|"answer"|"test"|"design"|"admin"}
 */
export function doingOf(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  // Drawing work is asked for by its verb, up front ("Design the…", "Send
  // designs"), or by saying the design does not exist yet. It is checked first
  // because a design task often ends "…also approve or decline the proposal".
  if (/^(design\b|send designs\b)/i.test(t) || /\bno design yet\b/i.test(t)) return "design";
  // Anything that lands on the release desk is a test-and-sign-off, however it
  // is worded: a batch, a build, a sheet, or "waiting for you on the release
  // desk".
  if (
    /^(please )?test\b/i.test(t) ||
    /^(batch \d+|quick one)\b/i.test(t) ||
    /\b(release desk|release sign-off|sign off|sign-off|test sheet)\b/i.test(t)
  ) {
    return "test";
  }
  // A decision: a proposal, a yes/no, a Keep/Change/Remove.
  if (
    /^(approve|decide)\b/i.test(t) ||
    /\b(approve or (decline|send back)|for (a|your) decision|quick decisions|work-board proposal|keep, change)\b/i.test(t)
  ) {
    return "decide";
  }
  // A question somebody is waiting on: the rate-data queries, "please confirm".
  if (/\bplease (confirm|give)\b/i.test(t) || /\brate data\b/i.test(t)) return "answer";
  return "admin";
}

// The ask is the first sentence; the rest is why. A sentence ends at a full
// stop, not at the colon that introduces the useful half ("Design: saving
// variations…" is one ask, not a heading called "Design:").
export function firstSentence(text, max = 104) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const cut = t.search(/\.\s/);
  let first = cut > 0 ? t.slice(0, cut) : t;
  if (first.length < 30) first = t.slice(0, 110);
  if (first.length > max) first = `${first.slice(0, max - 3).replace(/[\s,;:]+$/, "")}…`;
  return first;
}
