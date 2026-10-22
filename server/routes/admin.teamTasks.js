// server/routes/admin.teamTasks.js
//
// The team task feed, read by Your desk (/admin/desk).
//
//   GET  /admin/team-tasks            the open queue, who "me" is, what was finished lately
//   POST /admin/team-tasks/:n/answer  { verdict: done | waiting | dropped, note }
//
// The rows are written by the owner's tasks.mjs ledger (models/TeamTask.js),
// which also reads the answers back before each digest, so "Done" here means
// the task leaves tomorrow morning's digest too. Same audience as the release
// desk: the `releases` area. Taking a task out needs a reason — a task that
// quietly disappears is the one thing worse than a task that is never done.
import express from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { TeamTask } from "../models/TeamTask.js";
import { getGateConfig, isApprover, ownerEmail, releasesUrl } from "../util/releaseGate.js";
import { doingOf } from "../util/teamTasks.js";

const router = express.Router();
router.use(requireAuth, requirePermission("releases"));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const me = (req) => String(req.user?.email || "").trim().toLowerCase();

const RECENT_DAYS = 30;
const isSheet = (url) => /^https:\/\/claude\.ai\/artifact\//i.test(String(url || ""));

// Which person in the feed the signed-in user is. The feed knows people by a
// short key, not an email; the approver is Richard and the owner is Adedolapo,
// and anyone else sees the whole queue with nothing marked as theirs.
async function whoAmI(req) {
  const email = me(req);
  if (!email) return "";
  const cfg = await getGateConfig();
  if (isApprover(cfg, email)) return "richard";
  if (email === String(ownerEmail() || "").toLowerCase()) return "adedola";
  return "";
}

function shape(t) {
  const sheet = isSheet(t.link);
  return {
    n: t.n,
    to: t.to,
    owner: t.owner,
    doing: doingOf(t.text),
    text: t.text,
    // Richard tests batches on Release sign-off, not on a claude.ai page
    // (owner, 8 Oct 2026): a sheet link opens the desk, with the sheet kept.
    link: sheet ? "" : t.link,
    signoff: sheet ? releasesUrl() : "",
    sheet: sheet ? t.link : "",
    urgent: Boolean(t.urgent),
    from: t.from,
    status: t.status,
    openedAt: t.openedAt,
    doneAt: t.doneAt,
    note: t.note,
    answer: t.answer || {},
    syncedAt: t.syncedAt,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const since = new Date(Date.now() - RECENT_DAYS * 86400000);
    const [open, recent, who, last] = await Promise.all([
      TeamTask.find({ status: "open" }).sort({ urgent: -1, n: 1 }).lean(),
      TeamTask.find({ status: "done", doneAt: { $gte: since } }).sort({ doneAt: -1 }).limit(50).lean(),
      whoAmI(req),
      TeamTask.findOne({}, { syncedAt: 1 }).sort({ syncedAt: -1 }).lean(),
    ]);
    res.json({
      ok: true,
      me: who,
      digestAt: last?.syncedAt || null,
      items: open.map(shape),
      recent: recent.map(shape),
    });
  }),
);

router.post(
  "/:n/answer",
  asyncHandler(async (req, res) => {
    if (req.designMode || req.demoMode) return res.status(403).json({ error: "View-only session." });
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: "Which task?" });
    const verdict = String(req.body?.verdict || "").trim();
    const note = String(req.body?.note || "").trim();
    if (!["done", "waiting", "dropped"].includes(verdict)) {
      return res.status(400).json({ error: "The answer is done, waiting or dropped." });
    }
    if (verdict === "dropped" && note.length < 5) {
      return res.status(400).json({ error: "Say why it is being taken out." });
    }
    const task = await TeamTask.findOne({ n });
    if (!task) return res.status(404).json({ error: `No task #${n}.` });
    if (task.status === "done") return res.status(409).json({ error: `Task #${n} is already finished.` });

    const now = new Date();
    task.answer = { verdict, note, by: me(req), at: now };
    if (verdict !== "waiting") {
      task.status = "done";
      task.doneAt = now;
      task.note = note || (verdict === "done" ? "done on the desk" : "");
    }
    await task.save();
    res.json({ ok: true, task: shape(task.toObject()) });
  }),
);

export default router;
