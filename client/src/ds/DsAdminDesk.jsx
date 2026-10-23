// Your desk — one queue for everything waiting on the approver.
//
// Why this exists
// ---------------
// /admin/work and /admin/releases both work. Neither was being used. Richard
// opened them, found too many words and too many sections to decode, and went
// back to approving things on GitHub — the process those pages were built to
// replace. In his words: "it's like cognitive overload and too many words or
// descriptions, so I can hardly tell or understand what is what."
//
// Reading both pages, the fault is the same on each: they are written as
// documentation of the release policy rather than as work waiting for
// somebody. /admin/releases opens with an approver card, a paragraph on the
// 22 September rule, a paragraph on rollout, and the whole work board embedded
// in the middle, before anything you can act on. He wrote that policy. He does
// not need it explained back; he needs to be asked a question.
//
// Nothing about the gate changes here. Same models, same routes, same rules,
// same audit trail. What changes is how it asks.
//
// Three rules this screen keeps to:
//
//   1. One place. From where he sits there is one question — what needs me —
//      so there is one queue, and ideas, website batches, plugin builds,
//      gated settings, emergency reviews and the team task feed are all rows
//      in it.
//   2. A table, and a verb. Every row says what it is and what he has to do in
//      his words: "Waiting for you", never "awaiting-signoff"; "Approve or
//      decline", never "pending".
//   3. Nothing on the first screen he cannot act on. History, rollouts and
//      what is in flight are real and needed, and they are behind a tab.
//
// The task feed (15 Oct 2026). Seeing the real Discord digest changed what
// this screen is for: the bot already numbers, groups and ages every task, and
// Richard still had 32 open items because a list you cannot tick is a list you
// learn to scroll past. So the desk renders that queue too, with state — Done
// here means it leaves tomorrow's digest — and adds the one field the digest
// never had: what kind of work each task is. "Decide 9" is an afternoon; no
// amount of scrolling Discord ever said so.
//
// It merges four GETs the server serves (the team tasks are the only one added
// for it) and posts to the routes that already exist.
import React from "react";
import { apiAuthed } from "../api.js";
import { AdmChip, AdmTable, AdmTwo, AdmDim, AdmFilters } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";
import { AdmDrawer } from "./adminForm.jsx";
import "../styles/ds-desk.css";

/* ------------------------------------------------------------ his words */

const PRODUCT_FALLBACK = {
  quiv: "QUIV",
  heron: "HERON",
  rategen: "RateGen",
  mep: "SERVIQ Suite",
  civiq: "CIVIQ",
  timepro: "Time Pro",
  "qs-app": "QS Takeoff app",
  "installer-hub": "Installer Hub",
  website: "Website / ADLM Cloud",
  platform: "All products",
};

// Where a release goes when it is let out, in the server's own two words.
const ROLLOUT = {
  organizations: ["Our firms first", "The firms we work with get it now. Everyone else waits out the three months."],
  everyone: ["Everyone, now", "Every customer on the next check. Use this when the thing it fixes is worse than the risk."],
};

const CASE = [
  ["problem", "The problem"],
  ["whoBenefits", "Who it helps"],
  ["value", "What it is worth"],
  ["cost", "What it costs"],
  ["successMetric", "How we will know it worked"],
  ["risks", "What could go wrong"],
  ["alternatives", "What else we considered"],
];

const VERDICTS = [
  ["works", "Works", "ok"],
  ["needs-change", "Needs a change", "due"],
  ["could-not-test", "Could not test", ""],
];
// A thing that was built but was not in his design: it is not pass or fail,
// it is whether it stays.
const KEEP = [
  ["keep", "Keep it", "ok"],
  ["change", "Change it", "due"],
  ["remove", "Take it out", "bad"],
];

// What a task actually asks of him. The digest has no such field; without it
// 32 items read as one undifferentiated wall. The server derives it from the
// text (util/teamTasks.js), so the desk and the bot can never disagree; these
// are the words and the rough time each takes.
const DOING = {
  decide: ["Decide", "Approve, ask for changes or decline. Each is a couple of minutes.", 2],
  answer: ["Answer a question", "Somebody is blocked until you reply. Usually one number.", 5],
  test: ["Test and sign off", "Open it, work through the flows, then approve or send back.", 25],
  design: ["Design", "Drawing work. Needs a clear run at it, not a gap between meetings.", 90],
  admin: ["Admin", "Housekeeping. Nobody is blocked, but it does not go away.", 10],
};
const DOING_ORDER = ["decide", "answer", "test", "design", "admin"];

// Every answer he can give, in one place: how Done labels it, and how the
// queue says it in a sentence.
const SAID = {
  approved: ["Approved", "approved it"],
  changes: ["Asked for changes", "asked for changes"],
  declined: ["Declined", "declined it"],
  upheld: ["Upheld", "said it was justified"],
  objected: ["Objected", "objected to it"],
  done: ["Done", "finished it"],
  waiting: ["Waiting on somebody", "parked it"],
  dropped: ["Taken out", "took it out"],
};

// A deadline outranks a release that is holding customers up, which outranks
// a task somebody is chasing, which outranks an idea nobody is waiting on.
const URGENCY = { emergency: 0, release: 1, candidate: 2, task: 3, idea: 4 };

// A fortnight of being re-sent every morning is a fact worth colouring — once,
// in the column that is about waiting, not across the whole row.
const STALE_DAYS = 14;

// AdmFilters takes [value, label, count]; the count is the badge.
const TABS = [
  ["you", "Needs you"],
  ["flight", "In flight"],
  ["done", "Done"],
];

/* ---------------------------------------------------------- small helpers */

function productName(key, labels) {
  return labels?.[key] || PRODUCT_FALLBACK[key] || key || "—";
}

function productsOf(row, labels, meKey) {
  // Repeating his own name on thirty rows of his own desk is noise. The
  // column earns its place only when the row belongs to somebody else.
  if (row._kind === "task") return row.to && row.to !== meKey ? row.owner || row.to : "";
  const keys = row.products?.length ? row.products : [row.productKey].filter(Boolean);
  if (!keys.length) return "—";
  return keys.map((k) => productName(k, labels)).join(", ");
}

function ageDays(when, now) {
  if (!when) return 0;
  return Math.max(0, Math.floor((now - new Date(when)) / 86400000));
}

function daysSince(when, now) {
  if (!when) return "";
  // A date the server could not give us — a placeholder row under Design
  // Access, or a task the ledger sent without one — must not print "NaN days"
  // at him. Saying nothing is honest; NaN is just broken.
  const then = new Date(when);
  if (isNaN(then.getTime())) return "";
  const n = Math.round((now - then) / 86400000);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days`;
}

function hoursUntil(when, now) {
  if (!when) return null;
  const at = new Date(when);
  if (isNaN(at.getTime())) return null;
  return Math.round((at - now) / 3600000);
}

function notesOf(row) {
  let n = row.notifyBody?.releaseNotes || [];
  if (typeof n === "string") n = n.split("\n").filter((l) => l.trim());
  return Array.isArray(n) ? n : [];
}

function fullDate(when) {
  if (!when) return "—";
  return new Date(when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// The digest writes a paragraph, not a title. The ask is the first sentence —
// and a sentence ends at a full stop, not at the colon that introduces the
// useful half ("Design: saving variations…" is one ask, not a heading called
// "Design:"). Short openers take the next clause with them.
function firstSentence(text, max = 104) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const cut = t.search(/\.\s/);
  let first = cut > 0 ? t.slice(0, cut) : t;
  if (first.length < 30) first = t.slice(0, 110);
  if (first.length > max) first = `${first.slice(0, max - 3).replace(/[\s,;:]+$/, "")}…`;
  return first;
}

/* -------------------------------------------------------- the four sources
   One queue means merging what the server already returns, rather than asking
   for a new endpoint to do it on the way out. */

function toRows({ work, batch, releases, tasks }) {
  const rows = [];

  for (const it of work?.items || []) {
    if (it.decision?.status !== "pending") continue;
    rows.push({ ...it, _kind: "idea", _id: String(it._id), _when: it.submittedAt });
  }

  const b = batch?.batch;
  if (b && b.status === "testing") {
    rows.push({ ...b, _kind: "release", _id: String(b._id), _when: b.createdAt || b.submittedAt });
  }

  for (const c of releases?.pending || []) {
    rows.push({ ...c, _kind: "candidate", _id: String(c._id), _when: c.submittedAt });
  }

  for (const c of releases?.awaitingReview || []) {
    rows.push({ ...c, _kind: "emergency", _id: String(c._id), _when: c.decidedAt || c.submittedAt });
  }

  for (const t of tasks?.items || []) {
    if (t.status !== "open") continue;
    rows.push({ ...t, _kind: "task", _id: `task-${t.n}`, _when: t.openedAt, _parked: t.answer?.verdict === "waiting" });
  }

  return rows.sort((a, z) => {
    const d = URGENCY[a._kind] - URGENCY[z._kind];
    if (d) return d;
    // within the tasks: the bot's own red dot first, a parked one last
    if (a._kind === "task") {
      const u = Number(Boolean(z.urgent)) - Number(Boolean(a.urgent));
      if (u) return u;
      const p = Number(Boolean(a._parked)) - Number(Boolean(z._parked));
      if (p) return p;
    }
    return new Date(a._when || 0) - new Date(z._when || 0);
  });
}

function labelOf(row) {
  if (row._kind === "task") return `#${row.n}`;
  if (row._kind === "candidate") return row.kind === "setting" ? "Setting" : "Build";
  return { idea: "Idea", release: "Release", emergency: "Emergency" }[row._kind];
}

function titleOf(row) {
  if (row._kind === "task") return firstSentence(row.text);
  if (row._kind === "idea" || row._kind === "release") return row.title;
  if (row.kind === "setting") return row.displayName || row.settingField;
  return `${row.displayName || row.productKey} ${row.toVersion || ""}`.trim();
}

// What he has to do, as a verb, and roughly how long it will take. Never a
// status: a status tells him where a thing is, a verb tells him what it wants.
function job(row, now) {
  if (row._kind === "task") {
    if (row._parked) return { verb: "Waiting on somebody", mins: "parked" };
    const d = DOING[row.doing] || DOING.admin;
    // Only the bot's own red dot is urgent. Age is real, but it belongs in the
    // column about waiting, or every row shouts and none is heard.
    return {
      verb: d[0],
      mins: d[2] < 60 ? `${d[2]} min` : `about ${Math.round(d[2] / 60)}h`,
      urgent: Boolean(row.urgent),
    };
  }

  if (row._kind === "idea") return { verb: "Approve or decline", mins: "2 min · read the case" };

  if (row._kind === "emergency") {
    const h = hoursUntil(row.reviewDueAt, now);
    return {
      verb: "Say whether it should have gone out",
      mins: h === null ? "" : h <= 0 ? "overdue" : `due in ${h} hour${h === 1 ? "" : "s"}`,
      urgent: true,
    };
  }

  if (row._kind === "candidate") {
    return row.kind === "setting"
      ? { verb: "Check the new link, then approve it", mins: "1 min" }
      : { verb: "Read the notes, then choose who gets it", mins: "3 min" };
  }

  const flows = (row.items || []).filter((i) => i.kind !== "behind-the-scenes");
  const done = flows.filter((i) => i.verdict).length;
  return {
    verb: `Test ${flows.length} thing${flows.length === 1 ? "" : "s"}, then sign off`,
    mins: done ? `${done} of ${flows.length} done` : `about ${flows.length * 3} min`,
  };
}

/* ================================================================= screen */

export default function DsAdminDesk() {
  const [say, toast] = useAdmToast();
  const [tab, setTab] = React.useState("you");
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");
  const [open, setOpen] = React.useState(null);
  const [busy, setBusy] = React.useState("");
  // Answers given since the drawer opened, by flow key. They are written here
  // first so the sheet updates under the finger; the server is told straight
  // after and only disagrees if it refuses, which it cannot for a verdict.
  const [answered, setAnswered] = React.useState({});
  // The one button mid-flight. A set, not a flag, so two quick answers do not
  // disable each other.
  const [saving, setSaving] = React.useState({});
  const [note, setNote] = React.useState("");
  const [rollout, setRollout] = React.useState("");
  // Which kind of work he is looking at, and whose. Two filters, because the
  // two questions he actually asks of this list are "what can I knock out in
  // ten minutes" and "what is Dolapo waiting on me for".
  const [doing, setDoing] = React.useState("");
  const [who, setWho] = React.useState("me");

  const [now, setNow] = React.useState(() => new Date());

  const load = React.useCallback(async () => {
    setError("");
    try {
      // Four calls, because that is what exists. Each is allowed to fail on
      // its own: a broken batch endpoint should not empty the queue of ideas
      // he could still be getting through.
      const [work, batch, releases, tasks] = await Promise.all([
        apiAuthed("/admin/work").catch((e) => ({ _error: e })),
        apiAuthed("/admin/releases/batch").catch((e) => ({ _error: e })),
        apiAuthed("/admin/releases").catch((e) => ({ _error: e })),
        apiAuthed("/admin/team-tasks").catch((e) => ({ _error: e })),
      ]);
      const broke = [work, batch, releases, tasks].filter((r) => r?._error);
      if (broke.length === 4) throw broke[0]._error;
      if (broke.length) setError("Part of the desk could not be loaded. What is here is still current.");
      // one clock per load, so every "due in" on the screen agrees
      setNow(new Date());
      setData({ work, batch, releases, tasks });
    } catch (e) {
      setError(e?.data?.error || e?.message || "The desk could not be loaded.");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const all = React.useMemo(() => (data ? toRows(data) : []), [data]);
  const labels = data?.work?.options?.productLabels;
  const meKey = data?.tasks?.me || "";
  const current = React.useMemo(() => all.find((r) => r._id === open) || null, [all, open]);

  // Other people's tasks are in the feed too. They are his to look at, not to
  // do, so they are behind a switch; the badge counts what the list shows, or
  // the first thing the screen does is contradict itself.
  const isMine = (r) => r._kind !== "task" || !meKey || r.to === meKey;
  const mine = who === "all" ? all : all.filter(isMine);
  const others = all.filter((r) => !isMine(r)).length;
  const rows = doing ? mine.filter((r) => (doing === "gate" ? r._kind !== "task" : r._kind === "task" && r.doing === doing)) : mine;

  // Opening a row is also where its own draft state starts, so a note typed
  // against one thing can never be posted against another.
  function openRow(row) {
    setOpen(row._id);
    setAnswered({});
    setNote("");
    setRollout(row.rollout || "organizations");
  }
  function close() {
    setOpen(null);
    setNote("");
    // The queue can only have changed in ways that matter once he leaves the
    // thing he was working through, so this is where the desk catches up.
    const dirty = Object.keys(answered).length > 0;
    setAnswered({});
    if (dirty) load();
  }

  async function send(path, body, { needNote, after } = {}) {
    if (needNote && note.trim().length < 5) {
      say(needNote, "bad");
      return;
    }
    setBusy(path);
    try {
      await apiAuthed(path, { method: "POST", body });
      say(after || "Saved.", "ok");
      close();
      await load();
    } catch (e) {
      say(e?.data?.error || e?.message || "That did not go through.", "bad");
    } finally {
      setBusy("");
    }
  }

  /* --------------------------------------------------------------- queue */

  const queueCols = [
    {
      h: "What it is",
      cell: (r) => (
        <span className="dk-what-cell">
          <AdmChip tone={r._kind === "emergency" ? "bad" : r._kind === "idea" ? "calm" : r._kind === "task" ? "" : "due"}>{labelOf(r)}</AdmChip>
          <AdmTwo top={titleOf(r)} under={productsOf(r, labels, meKey)} />
        </span>
      ),
    },
    { h: "What you do", cell: (r) => <b>{job(r, now).verb}</b> },
    {
      h: "How long",
      cell: (r) => {
        const j = job(r, now);
        return j.urgent ? <span className="dk-urgent">{j.mins}</span> : <AdmDim>{j.mins}</AdmDim>;
      },
    },
    {
      h: "Waiting",
      num: true,
      cell: (r) => <span className={ageDays(r._when, now) >= STALE_DAYS ? "dk-stale" : undefined}>{daysSince(r._when, now)}</span>,
    },
  ];

  function Chips() {
    const counts = {};
    for (const r of mine) {
      const k = r._kind === "task" ? r.doing || "admin" : "gate";
      counts[k] = (counts[k] || 0) + 1;
    }
    const chips = [["", "Everything", mine.length]];
    for (const k of DOING_ORDER) if (counts[k]) chips.push([k, DOING[k][0], counts[k]]);
    if (counts.gate) chips.push(["gate", "Releases and ideas", counts.gate]);
    // one kind of thing on the list is not a choice worth a row of chips
    if (chips.length < 3) return null;
    return (
      <div className="dk-chips" role="group" aria-label="Kind of work">
        {chips.map(([k, label, n]) => (
          <button key={k || "all"} type="button" className={`dk-chip${doing === k ? " on" : ""}`} onClick={() => setDoing(doing === k ? "" : k)}>
            {label}
            <i>{n}</i>
          </button>
        ))}
      </div>
    );
  }

  function Queue() {
    if (!all.length) {
      return (
        <div className="adm-sec">
          <p>
            <b>Nothing is waiting for you.</b>
          </p>
          <AdmDim>When somebody proposes something or puts up a release, it lands here.</AdmDim>
        </div>
      );
    }
    return (
      <>
        <p className="adm-lede">
          {mine.length} thing{mine.length === 1 ? "" : "s"} waiting. Open one, do what it says, and it leaves this list.
          {others ? (
            <>
              {" "}
              <button type="button" className="dk-link" onClick={() => setWho(who === "all" ? "me" : "all")}>
                {who === "all" ? "Show only mine" : `Also show the ${others} on other people`}
              </button>
            </>
          ) : null}
        </p>
        <Chips />
        <AdmTable cols={queueCols} rows={rows} rowKey={(r) => r._id} onRow={openRow} empty={["Nothing of that kind is waiting", "Pick another kind, or Everything."]} />
      </>
    );
  }

  /* -------------------------------------------------------------- in flight
     Rollouts that went to our firms and are waiting out the three months.
     Nothing is owed on these, which is why they are not in the queue — but he
     is the one who opens the gate, so he has to be able to see the clock. */

  const rollouts = data?.releases?.rollouts || [];

  const flightCols = [
    { h: "What went out", cell: (r) => <AdmTwo top={r.displayName} under={`${r.firstVersion || "—"} → ${r.earlyVersion || "—"}`} /> },
    { h: "With our firms since", cell: (r) => <AdmDim>{fullDate(r.startedAt)}</AdmDim> },
    {
      h: "Everyone",
      num: true,
      cell: (r) =>
        r.canReleaseToEveryone ? (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === `/admin/releases/rollouts/${r.productKey}/everyone`}
            onClick={() => setOpen(`rollout:${r.productKey}`)}
          >
            Open it to everyone
          </button>
        ) : (
          <AdmDim>{r.unlocksAt ? `opens ${fullDate(r.unlocksAt)}` : "with our firms"}</AdmDim>
        ),
    },
  ];

  function Flight() {
    return (
      <>
        <p className="adm-lede">Everything part-way out. Nothing here is owed by you today.</p>
        {rollouts.length ? (
          <AdmTable cols={flightCols} rows={rollouts} rowKey={(r) => r.productKey} empty={["Nothing is with our firms", "A release that goes to firms first will show here with its clock."]} />
        ) : (
          <AdmDim>Nothing is with our firms right now.</AdmDim>
        )}
        {data?.releases?.rolloutError ? (
          <p className="adm-lede">
            <AdmDim>Rollouts could not be read: {data.releases.rolloutError}</AdmDim>
          </p>
        ) : null}
      </>
    );
  }

  /* ------------------------------------------------------------------ done */

  const settled = data?.releases?.recent || [];
  const finished = data?.tasks?.recent || [];

  const doneCols = [
    { h: "What it was", cell: (r) => <AdmTwo top={r.displayName || r.productKey} under={`${r.fromVersion || "—"} → ${r.toVersion || "—"}`} /> },
    {
      h: "You said",
      cell: (r) => {
        const word = r.reviewVerdict || r.status;
        const pair = SAID[word];
        return <AdmChip tone={word === "approved" || word === "upheld" ? "ok" : "bad"}>{pair ? pair[0] : word}</AdmChip>;
      },
    },
    { h: "When", num: true, cell: (r) => <AdmDim>{fullDate(r.decidedAt || r.reviewedAt)}</AdmDim> },
    { h: "Note", cell: (r) => (r.decisionNote ? r.decisionNote : <AdmDim>—</AdmDim>) },
  ];

  const finishedCols = [
    {
      h: "Task",
      cell: (r) => (
        <span className="dk-what-cell">
          <AdmChip>{`#${r.n}`}</AdmChip>
          <AdmTwo top={firstSentence(r.text)} under={r.to !== meKey ? r.owner : ""} />
        </span>
      ),
    },
    {
      h: "You said",
      cell: (r) => {
        const word = r.answer?.verdict || "done";
        return <AdmChip tone={word === "dropped" ? "bad" : "ok"}>{(SAID[word] || SAID.done)[0]}</AdmChip>;
      },
    },
    { h: "When", num: true, cell: (r) => <AdmDim>{fullDate(r.doneAt)}</AdmDim> },
    { h: "Note", cell: (r) => (r.note && r.note !== "done on the desk" ? r.note : <AdmDim>—</AdmDim>) },
  ];

  function Done() {
    if (!settled.length && !finished.length) return <AdmDim>Nothing decided yet.</AdmDim>;
    return (
      <>
        <p className="adm-lede">What you have decided. Every one is recorded and cannot be altered later.</p>
        {settled.length ? (
          <AdmTable cols={doneCols} rows={settled} rowKey={(r) => String(r._id)} empty={["Nothing decided yet", "What you approve or send back is recorded here."]} />
        ) : null}
        {finished.length ? (
          <>
            <h3 className="dk-h">Tasks finished this month</h3>
            <AdmTable cols={finishedCols} rows={finished} rowKey={(r) => `task-${r.n}`} empty={["No tasks finished yet", "A task you mark Done leaves the morning digest and lands here."]} />
          </>
        ) : null}
      </>
    );
  }

  /* --------------------------------------------------------------- panels */

  function NoteBox({ placeholder }) {
    return (
      <label className="adm-f wide">
        <span className="adm-f-l">Your note</span>
        <textarea rows={2} value={note} placeholder={placeholder} onChange={(e) => setNote(e.target.value)} />
      </label>
    );
  }

  function Idea({ row }) {
    const filled = CASE.filter((c) => row.businessCase?.[c[0]]);
    const path = `/admin/work/${row._id}/decide`;
    return (
      <>
        <p>{row.summary}</p>
        <h3 className="dk-h">Why they want to build it</h3>
        <dl className="dk-case">
          {filled.map((c) => (
            <div key={c[0]}>
              <dt>{c[1]}</dt>
              <dd>{row.businessCase[c[0]]}</dd>
            </div>
          ))}
        </dl>
        {row.design?.surfaces ? (
          <>
            <h3 className="dk-h">Screens it touches</h3>
            <p>
              {row.design.surfaces}
              {row.design.link ? (
                <>
                  {" — "}
                  <a href={row.design.link} target="_blank" rel="noreferrer">
                    your design
                  </a>
                </>
              ) : null}
            </p>
          </>
        ) : null}
        <h3 className="dk-h">Your answer</h3>
        <AdmDim>Nothing is designed or built until you approve it. If you send it back, say what to change.</AdmDim>
        <NoteBox placeholder="A note — needed if you send it back or decline it" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, { verdict: "approved", note: note.trim() }, { after: "Approved. Whoever proposed it is told." })}
          >
            Approve it
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "changes", note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back with your note.",
              })
            }
          >
            Send it back
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm adm-danger"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "declined", note: note.trim() }, {
                needNote: "Say why, so it is on the record.",
                after: "Declined.",
              })
            }
          >
            Decline it
          </button>
        </div>
      </>
    );
  }

  function Release({ row }) {
    const flows = (row.items || []).filter((i) => i.kind !== "behind-the-scenes");
    const behind = (row.items || []).filter((i) => i.kind === "behind-the-scenes");
    const done = flows.filter((f) => (f.key in answered ? answered[f.key] : f.verdict)).length;
    const left = flows.length - done;

    const verdict = async (key, word) => {
      const path = `/admin/releases/batch/${row._id}/verdict`;
      const before = answered[key];
      // Shown first. On a sheet this long, an answer that waits for the
      // network to agree reads as a dead button.
      setAnswered((a) => ({ ...a, [key]: word }));
      setSaving((p) => ({ ...p, [key]: true }));
      try {
        await apiAuthed(path, { method: "POST", body: { key, verdict: word } });
      } catch (e) {
        // Put it back the way it was rather than leave a tick over an answer
        // that never landed.
        setAnswered((a) => ({ ...a, [key]: before }));
        say(e?.data?.error || e?.message || "That did not save. Try it again.", "bad");
      } finally {
        setSaving((p) => {
          const n = { ...p };
          delete n[key];
          return n;
        });
      }
    };

    // what the sheet shows: his answer this session, else the stored one
    const verdictOf = (f) => (f.key in answered ? answered[f.key] : f.verdict);

    return (
      <>
        <p>
          Try each one on the preview, then say what you found. Your answer is pinned to this exact build — if
          anything changes after you sign off, it comes back to you.
        </p>
        <p className="dk-prog">
          <b>
            {done} of {flows.length} checked
          </b>
        </p>
        {flows.map((f, i) => {
          const set = f.kind === "not-in-design" ? KEEP : VERDICTS;
          return (
            <section key={f.key} className={`dk-flow${verdictOf(f) ? " is-done" : ""}`}>
              <h4>
                <span className="dk-no">{i + 1}</span>
                {f.title}
              </h4>
              {f.kind === "not-in-design" ? (
                <AdmDim>This was not in your design. Say whether it stays.</AdmDim>
              ) : null}
              {f.where ? <p className="dk-where">{f.where}</p> : null}
              {f.steps?.length ? (
                <ol className="dk-steps">
                  {f.steps.map((s, n) => (
                    <li key={n}>{s}</li>
                  ))}
                </ol>
              ) : null}
              <div className="dk-flow-a">
                {f.where && /^https?:/i.test(f.where) ? (
                  <a href={f.where} target="_blank" rel="noreferrer">
                    Open it →
                  </a>
                ) : null}
                {f.designUrl ? (
                  <a href={f.designUrl} target="_blank" rel="noreferrer">
                    Compare with your design
                  </a>
                ) : null}
              </div>
              <div className="dk-vs">
                {set.map((v) => (
                  <button
                    key={v[0]}
                    type="button"
                    className={`ds-btn btn-o ds-btn-sm${verdictOf(f) === v[0] ? " on" : ""}`}
                    disabled={!!saving[f.key]}
                    onClick={() => verdict(f.key, v[0])}
                  >
                    {saving[f.key] && verdictOf(f) === v[0] ? "Saving…" : v[1]}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {behind.length ? (
          <section className="dk-behind">
            <h4>Fixed behind the scenes</h4>
            <AdmDim>Nothing to try. Listed so you know it changed.</AdmDim>
            <ul>
              {behind.map((b) => (
                <li key={b.key}>{b.title}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <h3 className="dk-h">Your answer</h3>
        {left ? (
          <p className="dk-warn">
            {left} still unchecked. You can sign off anyway, but anything you did not try goes to customers untested.
          </p>
        ) : (
          <AdmDim>Everything checked.</AdmDim>
        )}
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/batch/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/batch/${row._id}/approve`, { note: note.trim() }, {
                after: "Signed off. It goes to customers now.",
              })
            }
          >
            Sign off — send to customers
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/batch/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/batch/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back with your note.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // A signed build. Nothing to try on a preview — it is already made. What he
  // is deciding is whether the notes describe something he wants customers to
  // have, and who gets it.
  function Build({ row }) {
    const ns = notesOf(row);
    const path = `/admin/releases/${row._id}/approve`;
    return (
      <>
        <p>
          A build is ready. It is already made and signed — there is nothing to try on a preview. Read what changed,
          choose who gets it, and let it out.
        </p>
        <p className="dk-ver">
          <span>{row.fromVersion || "—"}</span> <i>→</i> <b>{row.toVersion || "—"}</b>
        </p>
        <h3 className="dk-h">What changed</h3>
        {ns.length ? (
          <ul className="dk-notes">
            {ns.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="dk-warn">
            No notes were written. Send it back and ask for them — these are what customers are emailed.
          </p>
        )}
        <AdmDim>
          {row.notifyBody?.notifySubscribers
            ? "Letting it out emails everyone who gets it, with those notes."
            : "Nobody is emailed about this one."}
        </AdmDim>
        <h3 className="dk-h">Who gets it</h3>
        <div className="dk-roll">
          {Object.keys(ROLLOUT).map((k) => (
            <button
              key={k}
              type="button"
              className={`dk-r${rollout === k ? " on" : ""}`}
              onClick={() => setRollout(k)}
            >
              <b>{ROLLOUT[k][0]}</b>
              <span>{ROLLOUT[k][1]}</span>
            </button>
          ))}
        </div>
        <h3 className="dk-h">Your answer</h3>
        <AdmDim>
          Once it is out it installs on the next check, and it cannot be called back — the only way out is another
          build.
        </AdmDim>
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(path, { note: note.trim(), rollout }, {
                after: `Out to ${ROLLOUT[rollout][0].toLowerCase()}.`,
              })
            }
          >
            Let it out
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what to change, so whoever picks it up knows.",
                after: "Sent back. Nothing has been installed.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // One link swapped for another. He cannot judge a URL by reading it, so the
  // only honest thing this panel can do is get him to click it.
  function Setting({ row }) {
    const next = row.payload?.[row.settingField] || "";
    return (
      <>
        <p>
          This is the link the website hands out when somebody downloads it. It is being changed. Download it before
          you approve it — a wrong link here means nobody can install anything at all.
        </p>
        <h3 className="dk-h">The link now</h3>
        <p className="dk-url was">{row.settingPrevious || "— nothing set —"}</p>
        <h3 className="dk-h">The link they want</h3>
        <p className="dk-url">
          <a href={next} target="_blank" rel="noreferrer">
            {next}
          </a>
        </p>
        <AdmDim>Open it. You should get an installer, of about the size you expect.</AdmDim>
        <h3 className="dk-h">Your answer</h3>
        <NoteBox placeholder="A note — needed if you send it back" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/approve`, { note: note.trim() }, {
                after: "Changed. The website hands out the new link from now on.",
              })
            }
          >
            Approve the change
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy.startsWith(`/admin/releases/${row._id}`)}
            onClick={() =>
              send(`/admin/releases/${row._id}/reject`, { note: note.trim() }, {
                needNote: "Say what is wrong with it.",
                after: "Sent back. The link stays as it is.",
              })
            }
          >
            Send it back
          </button>
        </div>
      </>
    );
  }

  // This one runs backwards: it has already gone to customers. He is not
  // deciding whether it ships, he is putting on the record whether forcing it
  // was right — and neither answer is the primary button, because the screen
  // must not nudge him toward either. Objecting does not roll anything back,
  // and saying so is the panel's job.
  function Emergency({ row }) {
    const h = hoursUntil(row.reviewDueAt, now);
    const ns = notesOf(row);
    const path = `/admin/releases/${row._id}/review`;
    return (
      <>
        <div className="dk-alarm">
          <b>This has already gone out.</b>
          <span>
            {(row.decidedBy || "Somebody").split("@")[0]} released it without waiting for you, to{" "}
            {row.appliedTo === "everyone" ? "every customer" : "our firms"}. It is on their machines now. You are
            saying whether that was the right call.
          </span>
        </div>
        {h === null ? null : (
          <div className={`dk-due${h <= 6 ? " hot" : ""}`}>
            <b>{h <= 0 ? "Your review was due already." : `Your review is due in ${h} hour${h === 1 ? "" : "s"}.`}</b>
            <span>Set at {data?.releases?.emergencyReviewHours || 24} hours, so a forced release cannot sit unexamined.</span>
          </div>
        )}
        <h3 className="dk-h">Why they forced it</h3>
        <blockquote className="dk-why">{row.emergencyReason || "No reason was recorded."}</blockquote>
        <p className="dk-ver">
          <span>{row.fromVersion || "—"}</span> <i>→</i> <b>{row.toVersion || "—"}</b>
        </p>
        {ns.length ? (
          <>
            <h3 className="dk-h">What it changed</h3>
            <ul className="dk-notes">
              {ns.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </>
        ) : null}
        <h3 className="dk-h">Your verdict</h3>
        <AdmDim>
          Neither answer takes it back — it is out. Upholding it says the reason was good enough. Objecting puts on the
          record that it was not, which is what you would point at if it happened again for a thinner reason.
        </AdmDim>
        <NoteBox placeholder="A note — needed if you object" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, { verdict: "upheld", note: note.trim() }, { after: "Upheld, and on the record." })}
          >
            It was justified
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm adm-danger"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "objected", note: note.trim() }, {
                needNote: "An objection that gives no reason is not a record of anything.",
                after: "Objected, and on the record.",
              })
            }
          >
            It should not have gone out
          </button>
        </div>
      </>
    );
  }

  // A task from the digest. The bot writes a paragraph because Discord gives
  // it nothing else. Here the paragraph can be what it is — the brief — with
  // the ask pulled out above it and the links made into buttons. The only
  // thing the desk adds is the one thing Discord cannot: somewhere to say it
  // is finished.
  function Task({ row }) {
    const d = DOING[row.doing] || DOING.admin;
    const age = ageDays(row._when, now);
    const itsMine = !meKey || row.to === meKey;
    const path = `/admin/team-tasks/${row.n}/answer`;
    return (
      <>
        <div className="dk-tk-head">
          <span className="dk-tk-doing">{d[0]}</span>
          <span className={`dk-tk-age${age >= STALE_DAYS ? " old" : ""}`}>
            {age === 0 ? "came in today" : `waiting ${age} day${age === 1 ? "" : "s"}`}
          </span>
        </div>
        <AdmDim>{d[1]}</AdmDim>
        {age >= STALE_DAYS ? (
          <p className="dk-warn">
            This has been on the list since {new Date(row._when).toLocaleDateString("en-GB", { day: "numeric", month: "long" })} and
            has been re-sent every morning since. If it is not going to happen, taking it out is also an answer.
          </p>
        ) : null}
        <p className="dk-what">{row.text}</p>
        {row.signoff || row.sheet || row.link ? (
          <div className="dk-flow-a">
            {row.signoff ? (
              <a href={row.signoff} target="_blank" rel="noreferrer">
                Open Release sign-off →
              </a>
            ) : null}
            {row.sheet ? (
              <a href={row.sheet} target="_blank" rel="noreferrer">
                The test sheet
              </a>
            ) : null}
            {row.link ? (
              <a href={row.link} target="_blank" rel="noreferrer">
                Open it →
              </a>
            ) : null}
          </div>
        ) : null}
        <h3 className="dk-h">Your answer</h3>
        {itsMine ? (
          <AdmDim>Done takes it off tomorrow morning&apos;s digest. Taking it out needs a note saying why.</AdmDim>
        ) : (
          <AdmDim>
            This one is {row.owner || row.to}&apos;s. You are looking at it, not doing it — but chasing is a thing you
            can do from here.
          </AdmDim>
        )}
        <NoteBox placeholder="A note — needed if you are taking it out" />
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, { verdict: "done", note: note.trim() }, { after: `Task #${row.n} is finished. It will not be in tomorrow morning's digest.` })}
          >
            Done
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            disabled={busy === path || row._parked}
            onClick={() => send(path, { verdict: "waiting", note: note.trim() }, { after: "Parked. It stays on the list but stops counting against you until whoever you are waiting on moves." })}
          >
            Waiting on somebody
          </button>
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm adm-danger"
            disabled={busy === path}
            onClick={() =>
              send(path, { verdict: "dropped", note: note.trim() }, {
                needNote: "Say why it is being taken out, so the record says more than that it disappeared.",
                after: "Taken out. The bot stops asking, and your note says why.",
              })
            }
          >
            Take it out
          </button>
        </div>
      </>
    );
  }

  // Widening a rollout puts it on every customer's machine, so it is asked as
  // a question on a panel rather than taken on one click.
  function WidenPanel({ productKey }) {
    const r = rollouts.find((x) => x.productKey === productKey);
    if (!r) return null;
    const path = `/admin/releases/rollouts/${productKey}/everyone`;
    return (
      <AdmDrawer title={`Open ${r.displayName} to everyone?`} onClose={close}>
        <p>
          It has been with our firms since {fullDate(r.startedAt)}. Opening it means every customer gets{" "}
          {r.earlyVersion || "it"} on their next check, and there is no way to put it back except another build.
        </p>
        <div className="adm-acts">
          <button
            type="button"
            className="ds-btn btn-p ds-btn-sm"
            disabled={busy === path}
            onClick={() => send(path, {}, { after: `${r.displayName} is out to everyone.` })}
          >
            Open it to everyone
          </button>
          <button type="button" className="ds-btn btn-o ds-btn-sm" onClick={close}>
            Not yet
          </button>
        </div>
      </AdmDrawer>
    );
  }

  function Panel() {
    if (typeof open === "string" && open.startsWith("rollout:")) {
      return <WidenPanel productKey={open.slice("rollout:".length)} />;
    }
    if (!current) return null;
    const body =
      current._kind === "idea" ? (
        <Idea row={current} />
      ) : current._kind === "release" ? (
        <Release row={current} />
      ) : current._kind === "emergency" ? (
        <Emergency row={current} />
      ) : current._kind === "task" ? (
        <Task row={current} />
      ) : current.kind === "setting" ? (
        <Setting row={current} />
      ) : (
        <Build row={current} />
      );

    const stamp =
      current._kind === "task"
        ? `task #${current.n} · ${current.owner || current.to}`
        : current._kind === "release"
          ? `commit ${current.headSha || "—"}`
          : current._kind === "idea"
            ? current.kind
            : current.kind === "setting"
              ? "a setting, not a build"
              : `${current.fromVersion || "—"} → ${current.toVersion || "—"}`;

    const from =
      current._kind === "task"
        ? current.from || "the task feed"
        : (current.preparedBy || current.submittedBy || "").split("@")[0] || "—";
    const intro = [productsOf(current, labels, meKey), stamp, `from ${from}`].filter(Boolean).join(" · ");

    return (
      <AdmDrawer wide title={titleOf(current)} intro={intro} onClose={close}>
        {body}
      </AdmDrawer>
    );
  }

  /* ---------------------------------------------------------------- render */

  if (!data && !error) return <AdmDim>Loading your desk…</AdmDim>;

  const isApprover = data?.releases?.you?.isApprover ?? data?.work?.you?.isApprover;

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Your desk</h1>
          <p className="adm-lede">Everything waiting on you, in one list. Open a row, do what it says, and it leaves.</p>
        </div>
      </div>

      {error ? <p className="dk-warn">{error}</p> : null}

      {isApprover === false ? (
        <p className="dk-warn">
          You are signed in as someone who cannot decide these. You can read the queue; the answers will be refused.
        </p>
      ) : null}

      <AdmFilters
        options={TABS.map(([value, label]) => [value, label, value === "you" && mine.length ? mine.length : null])}
        current={tab}
        onPick={setTab}
      />

      <div className="adm-sec">{tab === "you" ? <Queue /> : tab === "flight" ? <Flight /> : <Done />}</div>

      <Panel />
      {toast}
    </>
  );
}
