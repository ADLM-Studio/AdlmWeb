// server/models/TeamTask.js
//
// One task from the team task feed (the owner's tasks.mjs ledger, which posts
// to Discord and sends the weekday digest), mirrored here so Your desk
// (/admin/desk) shows the real queue and its owner can tick a task off.
//
// The ledger is the source of truth for what a task IS: the feed writes these
// rows and overwrites them on every sync. The desk owns one thing only, the
// `answer`, which the feed reads back before each digest: Done means it leaves
// and is not in tomorrow's digest.
import mongoose from "mongoose";

const AnswerSchema = new mongoose.Schema(
  {
    // done: finished. waiting: parked, stays on the list but is not chased.
    // dropped: taken out with a note saying why.
    verdict: { type: String, enum: ["", "done", "waiting", "dropped"], default: "" },
    note: { type: String, trim: true, default: "" },
    by: { type: String, trim: true, lowercase: true, default: "" },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const TeamTaskSchema = new mongoose.Schema(
  {
    // The feed's own number (#151 in the digest).
    n: { type: Number, required: true, unique: true, index: true },
    // The feed's person key (richard, ebun, adedola) and the name it shows.
    to: { type: String, trim: true, lowercase: true, default: "", index: true },
    owner: { type: String, trim: true, default: "" },
    text: { type: String, trim: true, default: "" },
    link: { type: String, trim: true, default: "" },
    urgent: { type: Boolean, default: false },
    from: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["open", "done"], default: "open", index: true },
    openedAt: { type: Date, default: null },
    doneAt: { type: Date, default: null },
    note: { type: String, trim: true, default: "" },

    answer: { type: AnswerSchema, default: () => ({}) },

    // When the feed last wrote this row; the desk shows the digest's age from it.
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true, demoTenancy: false },
);

export const TeamTask = mongoose.models.TeamTask || mongoose.model("TeamTask", TeamTaskSchema);
