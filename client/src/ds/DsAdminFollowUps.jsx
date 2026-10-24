// Follow-ups — the calls behind lapsed licences and unpaid orders.
//
// Richard drew no screen for this: his rail has no Follow-ups, because his
// prototype had no such list. So there is no design to be faithful to, and
// this is built in his grammar rather than invented in a new one — the same
// register table, the same filter row, the same tone vocabulary the rest of
// the admin uses. A screen that behaves like the four beside it is not a
// fifth thing to learn.
//
// A register rather than a queue of cards, because the question here is "who
// do I ring next" — a list you read down, sorted by how overdue somebody is.
// Cards would give six rows a screenful each and hide the ordering that
// matters.
//
// The list is DERIVED. A rebuild recomputes who belongs on it from expired
// entitlements and unpaid orders, and must never clobber the call history
// attached to a row.
//
// Logging a call IS here, because the screen it restyles could already do it
// and a port that quietly drops a capability is a regression wearing a better
// coat. The outcomes come from the server rather than a copy in this file:
// an outcome the screen offers that the endpoint rejects is a button that
// fails, and two lists drifting apart is exactly how that happens.
//
// The outcome alone is not a call log. "reached" says a conversation happened
// and nothing about it, and the next person to ring has nothing to pick up.
// So logging a call starts with a box for what was said, in the caller's own
// words, and the outcome is how it ended. When somebody was actually spoken
// to, the words are required; a number that rang out has nothing to write.

import React from "react";
import { apiAuthed } from "../api.js";
import { useAuth } from "../store.jsx";
import { AdmTable, AdmTwo, AdmDim, AdmFilters, AdmChip } from "./adminUi.jsx";
import { useAdmToast } from "./adminKit.jsx";

const when = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

const REASON = {
  expired: "Licence lapsed",
  pending: "Order unpaid",
  silent: "Software gone quiet",
};

// How a call ended, in plain words. Any outcome the server adds that is not
// here still shows, with its underscores turned into spaces.
const OUTCOME = {
  reached: "spoke to them",
  renewed: "renewing",
  callback: "call back later",
  not_interested: "not interested",
  no_answer: "no answer",
  voicemail: "left voicemail",
  wrong_number: "wrong number",
  unreachable: "unreachable",
};
const outcomeLabel = (o) => OUTCOME[o] || String(o || "").replace(/_/g, " ");

// Outcomes where a human being was on the line. These need the feedback box
// filled in: a conversation with nothing written down is a call nobody can
// follow up.
const SPOKE = new Set(["reached", "renewed", "callback", "not_interested"]);

export default function DsAdminFollowUps() {
  const { accessToken } = useAuth();
  const [view, setView] = React.useState("to_call");
  const [d, setD] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const [logging, setLogging] = React.useState(null);
  // The feedback being typed for the row in `logging`.
  const [note, setNote] = React.useState("");
  // Row whose earlier calls are unfolded.
  const [history, setHistory] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [say, toast] = useAdmToast();
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!accessToken) return undefined;
    let alive = true;
    setD(null);
    apiAuthed("/admin/queues/followups", { token: accessToken, params: { view } })
      .then((r) => alive && setD(r))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [accessToken, view, reload]);

  if (failed) {
    return <p className="adm-note">Follow-ups could not be loaded just now. Please refresh.</p>;
  }

  const items = d?.items || [];
  const counts = d?.counts || {};
  const outcomes = d?.outcomes || [];

  function startLogging(id) {
    setNote("");
    setLogging(id);
  }

  async function logCall(id, outcome) {
    if (busy) return;
    const feedback = note.trim();
    if (SPOKE.has(outcome) && !feedback) {
      say("Write what was said on the call first, then pick how it ended.");
      return;
    }
    setBusy(true);
    try {
      await apiAuthed(`/admin/followups/${id}/calls`, {
        token: accessToken,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note: feedback, channel: "phone" }),
      });
      setLogging(null);
      setNote("");
      setReload((n) => n + 1);
      const who = items.find((f) => f.id === id)?.who || "the account";
      say(
        feedback
          ? `Call logged — ${outcomeLabel(outcome)}. Your feedback is saved against ${who}.`
          : `Call logged — ${outcomeLabel(outcome)}.`,
      );
    } catch (e) {
      say(e?.message || "The server refused that. Nothing was logged.");
    } finally {
      setBusy(false);
    }
  }

  const cols = [
    {
      h: "Who to ring",
      w: "26%",
      cell: (f) => <AdmTwo top={f.who} under={f.phone || f.email} />,
    },
    {
      h: "Firm",
      w: "18%",
      cell: (f) =>
        f.org ? (
          <AdmTwo top={f.org} under={f.location || "No location recorded"} />
        ) : (
          <AdmDim>Personal licence</AdmDim>
        ),
    },
    {
      h: "Why",
      cell: (f) => (
        <span className="adm-two">
          <b>{(f.reasons || []).map((r) => REASON[r] || r).join(" · ") || "–"}</b>
          <span>
            {(f.products || []).join(" · ") || "no product recorded"}
            {/* Somebody who let one licence lapse but still holds another is
                a different call from somebody who has left entirely. */}
            {f.hasOther ? " · still holds another" : ""}
            {f.silence
              ? f.silence.neverUsed
                ? " · licence never used"
                : ` · no use for ${f.silence.days} days`
              : ""}
          </span>
        </span>
      ),
    },
    {
      h: "Overdue",
      num: true,
      cell: (f) =>
        f.overdue ? (
          <AdmChip tone={f.overdue >= 30 ? "bad" : f.overdue >= 7 ? "due" : ""}>
            {f.overdue}d
          </AdmChip>
        ) : (
          <AdmDim>–</AdmDim>
        ),
    },
    {
      h: "Calls",
      num: true,
      cell: (f) => (f.calls ? f.calls : <AdmDim>none</AdmDim>),
    },
    {
      h: "Last call",
      w: "22%",
      cell: (f) => {
        if (!f.lastCalledAt) return <AdmDim>never called</AdmDim>;
        const last = f.log?.[0];
        const earlier = (f.log || []).slice(1);
        const open = history === f.id;
        return (
          <div className="adm-lastcall">
            {/* The feedback is the headline; the fixed outcome is the detail. */}
            {f.lastNote ? (
              <b className="adm-lastcall-note">{f.lastNote}</b>
            ) : (
              <AdmDim>No feedback written</AdmDim>
            )}
            <span className="adm-lastcall-meta">
              {outcomeLabel(f.lastOutcome)} · {when(f.lastCalledAt)}
              {last?.by ? ` · ${last.by}` : ""}
            </span>
            {earlier.length ? (
              <button
                type="button"
                className="adm-b adm-lastcall-more"
                aria-expanded={open}
                onClick={() => setHistory(open ? null : f.id)}
              >
                {open ? "hide earlier calls" : `earlier calls (${earlier.length})`}
              </button>
            ) : null}
            {open && earlier.length ? (
              <ul className="adm-calllog">
                {earlier.map((c, i) => (
                  <li key={`${c.at || "call"}-${i}`}>
                    <b>{c.note || <AdmDim>No feedback written</AdmDim>}</b>
                    <span>
                      {outcomeLabel(c.outcome)} · {when(c.at)}
                      {c.by ? ` · ${c.by}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      },
    },
    {
      h: "Log a call",
      cell: (f) =>
        logging === f.id ? (
          <div className="adm-log adm-log-form">
            <label className="adm-log-label" htmlFor={`fu-note-${f.id}`}>
              What was said on the call
            </label>
            <textarea
              id={`fu-note-${f.id}`}
              className="adm-log-note"
              rows={4}
              autoFocus
              maxLength={2000}
              disabled={busy}
              placeholder="Who you spoke to, what they said, what they need, and when to ring again."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <span className="adm-log-how">How did it end?</span>
            <span className="adm-log-outcomes">
              {outcomes.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="adm-b"
                  disabled={busy}
                  onClick={() => logCall(f.id, o)}
                >
                  {outcomeLabel(o)}
                </button>
              ))}
              <button
                type="button"
                className="adm-b"
                disabled={busy}
                onClick={() => {
                  setLogging(null);
                  setNote("");
                }}
              >
                cancel
              </button>
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="ds-btn btn-o ds-btn-sm"
            onClick={() => startLogging(f.id)}
          >
            Log a call
          </button>
        ),
    },
  ];

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1 className="adm-h">Follow-ups</h1>
          <p className="adm-lede">
            People whose licence has lapsed or whose order was never paid, sorted by how long they
            have been overdue. The list is rebuilt from those two facts, so somebody leaves it by
            renewing or paying rather than by being ticked off.
          </p>
        </div>
      </div>

      <AdmFilters
        current={view}
        onPick={setView}
        options={[
          ["to_call", "To call", counts.to_call],
          ["in_progress", "In progress", counts.in_progress],
          ["done", "Done", counts.done],
          ["all", "Everyone", counts.all],
        ]}
      />

      {!d ? (
        <p className="adm-note">Reading the list…</p>
      ) : (
        <AdmTable
          cols={cols}
          rows={items}
          empty={[
            "Nobody to ring",
            "No licence has lapsed, no order is sitting unpaid, and every paid licence is in use. That is the list being empty, not missing.",
          ]}
        />
      )}

      <p className="adm-foot-note">
        The list is rebuilt every morning from expired licences, unpaid orders and paid software nobody is using, and a rebuild never touches
        the call history — somebody leaves this list by renewing or paying, not by being ticked
        off. Logging a call records what was said, how it ended, and who made it and when, against
        your name; the feedback stays with the account so the next call can pick up where the last
        one stopped.
      </p>

      {toast}
    </>
  );
}
