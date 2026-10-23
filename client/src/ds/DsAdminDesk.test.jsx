// Your desk: the five kinds of row, and the three answers that must be refused.
//
// What these pin is not the layout. It is the things that would be expensive to
// get wrong and cheap to break by accident:
//
//   - all five sources reach one queue, in the order a deadline deserves;
//   - a release that has already gone out is never shown as a decision still
//     to be made;
//   - the three answers the server refuses without a note are refused here
//     first, so he is told in place rather than by a 400;
//   - approving a build sends the rollout he actually picked, because that is
//     the field that decides how many machines it lands on.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

let answer = async () => ({ ok: true });
const calls = [];

vi.mock("../api.js", () => ({
  apiAuthed: vi.fn(async (path, opts) => {
    calls.push({ path, method: opts?.method || "GET", body: opts?.body });
    return answer(path, opts);
  }),
}));

const { default: DsAdminDesk } = await import("./DsAdminDesk.jsx");

const mount = () =>
  render(
    <MemoryRouter>
      <DsAdminDesk />
    </MemoryRouter>,
  );

const idea = {
  _id: "w1",
  title: "Auto take-off with AI",
  kind: "feature",
  products: ["quiv"],
  summary: "Measure the obvious items first, then check them.",
  submittedBy: "dolapo@adlmstudio.net",
  submittedAt: "2026-10-06T09:00:00Z",
  decision: { status: "pending" },
  design: { status: "needed", surfaces: "QUIV panel" },
  businessCase: { problem: "A take-off starts from nothing every time." },
};

const settledIdea = { ...idea, _id: "w2", title: "Already decided", decision: { status: "approved" } };

const batch = {
  _id: "b1",
  title: "Website 2026.10",
  status: "testing",
  headSha: "8f2c1ab",
  products: ["website"],
  createdAt: "2026-10-09T09:00:00Z",
  items: [
    { key: "f1", kind: "flow", title: "Price without an account", where: "https://preview/fit", steps: ["Open it"], verdict: "" },
    { key: "f2", kind: "behind-the-scenes", title: "Sync retries", steps: [] },
  ],
};

const build = {
  _id: "c1",
  kind: "deployment",
  productKey: "heron",
  displayName: "HERON for PlanSwift",
  fromVersion: "2.9.4",
  toVersion: "2.9.5",
  status: "pending",
  rollout: "organizations",
  submittedAt: "2026-10-08T09:00:00Z",
  notifyBody: { notifySubscribers: true, releaseNotes: ["Reads the installed template."] },
};

const setting = {
  _id: "c2",
  kind: "setting",
  productKey: "installer-hub",
  displayName: "Where the Hub downloads from",
  settingField: "installerHubUrl",
  settingPrevious: "https://cdn/old.exe",
  payload: { installerHubUrl: "https://cdn/new.exe" },
  status: "pending",
  submittedAt: "2026-10-09T09:00:00Z",
};

const emergency = {
  _id: "e1",
  kind: "deployment",
  productKey: "website",
  displayName: "ADLM Cloud",
  fromVersion: "2026.10.1",
  toVersion: "2026.10.2",
  status: "emergency",
  appliedTo: "everyone",
  decidedBy: "dolapo@adlmstudio.net",
  decidedAt: "2026-10-09T06:40:00Z",
  reviewDueAt: new Date(Date.now() + 19 * 3600_000).toISOString(),
  reviewVerdict: "",
  emergencyReason: "Sign-in was failing for every new account.",
  notifyBody: { releaseNotes: ["Verification links fixed."] },
};

// A task from the team feed, as GET /admin/team-tasks shapes it. #10 is the one
// whose title used to be cut at the colon; #66 carries the bot's own red dot.
const taskDesign = {
  n: 10,
  to: "richard",
  owner: "Richard Enoch",
  doing: "design",
  text: "Design: saving variations on a merged project (R4c, emailed 26 Sep)",
  link: "",
  urgent: false,
  status: "open",
  openedAt: "2026-09-26T17:25:00Z",
  answer: {},
};
const taskUrgent = {
  n: 66,
  to: "richard",
  owner: "Richard Enoch",
  doing: "design",
  text: "Nudge on #32: HERON 3 AI Review has no design yet. We are building the HERON 3 review section now.",
  link: "https://adlm-studio.vercel.app/plugin-heron",
  urgent: true,
  status: "open",
  openedAt: "2026-09-28T02:45:00Z",
  answer: {},
};
const taskDecide = {
  n: 156,
  to: "richard",
  owner: "Richard Enoch",
  doing: "decide",
  text: "Decide on the work-board proposal 'QUIV: undo a deletion on the take-off list'. Built and waiting on your approval.",
  link: "https://www.adlmstudio.net/admin/work",
  urgent: false,
  status: "open",
  openedAt: "2026-10-11T14:21:00Z",
  answer: {},
};
const taskOfEbun = {
  n: 147,
  to: "ebun",
  owner: "Ebun",
  doing: "admin",
  text: "Update your Notion task board today: all 10 open tasks are past due.",
  link: "",
  urgent: false,
  status: "open",
  openedAt: "2026-10-07T12:09:00Z",
  answer: {},
};

function serve({ items = [], current = null, pending = [], awaitingReview = [], rollouts = [], recent = [], tasks = [], me = "richard" } = {}) {
  answer = async (path) => {
    if (path === "/admin/work") return { ok: true, items, you: { isApprover: true }, options: {} };
    if (path === "/admin/releases/batch") return { ok: true, batch: current, recent: [] };
    if (path === "/admin/releases") {
      return { ok: true, pending, awaitingReview, rollouts, recent, emergencyReviewHours: 24, you: { isApprover: true } };
    }
    if (path === "/admin/team-tasks") return { ok: true, me, items: tasks, recent: [] };
    return { ok: true };
  };
}

beforeEach(() => {
  calls.length = 0;
  serve();
});
afterEach(cleanup);

describe("Your desk", () => {
  it("merges the gate's five sources into one queue, deadline first", async () => {
    serve({ items: [idea], current: batch, pending: [build, setting], awaitingReview: [emergency] });
    mount();

    await waitFor(() => expect(screen.getByText("5 things waiting. Open one, do what it says, and it leaves this list.")).toBeTruthy());

    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
    // A 24-hour clock outranks everything; an idea nobody waits on comes last.
    expect(rows[0].textContent).toContain("Emergency");
    expect(rows[4].textContent).toContain("Idea");
  });

  it("leaves out anything already decided", async () => {
    serve({ items: [idea, settledIdea] });
    mount();
    await waitFor(() => expect(screen.getByText(/1 thing waiting/)).toBeTruthy());
    expect(screen.queryByText("Already decided")).toBeNull();
  });

  it("says what he has to do, never the database's word for it", async () => {
    serve({ items: [idea], current: batch, pending: [build, setting], awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText("Approve or decline")).toBeTruthy());

    expect(screen.getByText("Read the notes, then choose who gets it")).toBeTruthy();
    expect(screen.getByText("Check the new link, then approve it")).toBeTruthy();
    expect(screen.getByText("Say whether it should have gone out")).toBeTruthy();
    // the batch counts only what he can actually try
    expect(screen.getByText("Test 1 thing, then sign off")).toBeTruthy();
    expect(screen.queryByText(/awaiting-signoff|pending/i)).toBeNull();
  });

  it("refuses to send an idea back without a note, and does not call the server", async () => {
    serve({ items: [idea] });
    mount();
    await waitFor(() => expect(screen.getByText("Auto take-off with AI")).toBeTruthy());
    fireEvent.click(screen.getByText("Auto take-off with AI"));

    await waitFor(() => expect(screen.getByText("Send it back")).toBeTruthy());
    fireEvent.click(screen.getByText("Send it back"));

    await waitFor(() => expect(screen.getByText(/Say what to change/)).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("refuses an objection with no reason", async () => {
    serve({ awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText(/ADLM Cloud 2026.10.2/)).toBeTruthy());
    fireEvent.click(screen.getByText(/ADLM Cloud 2026.10.2/));

    await waitFor(() => expect(screen.getByText("It should not have gone out")).toBeTruthy());
    fireEvent.click(screen.getByText("It should not have gone out"));

    await waitFor(() => expect(screen.getByText(/not a record of anything/)).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("tells him an emergency has already gone out, rather than asking him to approve it", async () => {
    serve({ awaitingReview: [emergency] });
    mount();
    await waitFor(() => expect(screen.getByText(/ADLM Cloud 2026.10.2/)).toBeTruthy());
    fireEvent.click(screen.getByText(/ADLM Cloud 2026.10.2/));

    await waitFor(() => expect(screen.getByText("This has already gone out.")).toBeTruthy());
    expect(screen.getByText(/every customer/)).toBeTruthy();
    expect(screen.getByText(/Neither answer takes it back/)).toBeTruthy();
  });

  it("sends the rollout he picked when a build is let out", async () => {
    serve({ pending: [build] });
    mount();
    await waitFor(() => expect(screen.getByText(/HERON for PlanSwift 2.9.5/)).toBeTruthy());
    fireEvent.click(screen.getByText(/HERON for PlanSwift 2.9.5/));

    await waitFor(() => expect(screen.getByText("Everyone, now")).toBeTruthy());
    fireEvent.click(screen.getByText("Everyone, now"));
    fireEvent.click(screen.getByText("Let it out"));

    await waitFor(() => {
      const post = calls.find((c) => c.path === "/admin/releases/c1/approve");
      expect(post).toBeTruthy();
      expect(post.body.rollout).toBe("everyone");
    });
  });

  it("puts the task feed in the same queue: after a build, before an idea, the bot's red dot first", async () => {
    serve({ items: [idea], pending: [build], tasks: [taskDesign, taskUrgent, taskDecide] });
    mount();
    await waitFor(() => expect(screen.getByText(/5 things waiting/)).toBeTruthy());

    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
    expect(rows[0].textContent).toContain("Build");
    expect(rows[1].textContent).toContain("#66"); // urgent, though newer than #10
    expect(rows[2].textContent).toContain("#10");
    expect(rows[3].textContent).toContain("#156");
    expect(rows[4].textContent).toContain("Idea");
  });

  it("does not cut a task's title at the first colon", async () => {
    serve({ tasks: [taskDesign] });
    mount();
    await waitFor(() => expect(screen.getByText("Design: saving variations on a merged project (R4c, emailed 26 Sep)")).toBeTruthy());
    expect(screen.queryByText("Design:")).toBeNull();
  });

  it("offers the kinds of work as chips with their counts, and a chip filters the list", async () => {
    serve({ items: [idea], tasks: [taskDesign, taskUrgent, taskDecide] });
    mount();
    await waitFor(() => expect(screen.getByText(/4 things waiting/)).toBeTruthy());

    const chips = Array.from(document.querySelectorAll(".dk-chip"));
    const text = chips.map((c) => c.textContent);
    expect(text).toContain("Everything4");
    expect(text).toContain("Decide1");
    expect(text).toContain("Design2");
    expect(text).toContain("Releases and ideas1");

    fireEvent.click(chips.find((c) => c.textContent === "Decide1"));
    await waitFor(() => expect(document.querySelectorAll("tbody tr").length).toBe(1));
    expect(document.querySelector("tbody tr").textContent).toContain("#156");
  });

  it("shows only his own tasks until he asks for other people's, and the badge agrees with the list", async () => {
    serve({ tasks: [taskDesign, taskOfEbun] });
    mount();
    await waitFor(() => expect(screen.getByText(/1 thing waiting/)).toBeTruthy());
    expect(document.querySelectorAll("tbody tr").length).toBe(1);
    expect(screen.queryByText(/Notion task board/)).toBeNull();

    fireEvent.click(screen.getByText("Also show the 1 on other people"));
    await waitFor(() => expect(screen.getByText(/2 things waiting/)).toBeTruthy());
    expect(document.querySelectorAll("tbody tr").length).toBe(2);
    // the column names the owner only when the row is somebody else's
    expect(screen.getByText("Ebun")).toBeTruthy();
    expect(screen.queryByText("Richard Enoch")).toBeNull();
  });

  it("refuses to take a task out without a note, and Done posts to the feed", async () => {
    serve({ tasks: [taskDecide] });
    mount();
    await waitFor(() => expect(screen.getByText(/undo a deletion/)).toBeTruthy());
    fireEvent.click(screen.getByText(/undo a deletion/));

    await waitFor(() => expect(screen.getByText("Take it out")).toBeTruthy());
    fireEvent.click(screen.getByText("Take it out"));
    await waitFor(() => expect(screen.getByText(/Say why it is being taken out/)).toBeTruthy());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => {
      const post = calls.find((c) => c.path === "/admin/team-tasks/156/answer");
      expect(post).toBeTruthy();
      expect(post.body.verdict).toBe("done");
    });
  });

  it("keeps the queue when one source fails", async () => {
    answer = async (path) => {
      if (path === "/admin/work") return { ok: true, items: [idea], you: { isApprover: true }, options: {} };
      throw new Error("releases is down");
    };
    mount();
    await waitFor(() => expect(screen.getByText("Auto take-off with AI")).toBeTruthy());
    expect(screen.getByText(/Part of the desk could not be loaded/)).toBeTruthy();
  });
});

// Answering one flow on a long sheet (Richard, Batch 14, 109 flows).
//
// "Buttons will not be clickable for a while, and the list still looks the
// same, or it takes me back to the very top." All three came from answering
// a flow refetching the whole desk: it disabled every other verdict button,
// it left the answer invisible until four endpoints came back, and replacing
// the data rebuilt the drawer and lost his place.
describe("answering a flow on a long sheet", () => {
  const longBatch = {
    _id: "b2",
    title: "Batch 14",
    status: "testing",
    headSha: "3bd8883",
    products: ["website"],
    createdAt: "2026-10-20T09:00:00Z",
    items: Array.from({ length: 12 }, (_, i) => ({
      key: `k${i}`,
      kind: "flow",
      title: `Flow number ${i}`,
      where: "https://preview/x",
      steps: ["Open it"],
      verdict: "",
    })),
  };

  it("shows the answer at once, saves it, and does not reload the desk", async () => {
    serve({ current: longBatch });
    mount();
    await waitFor(() => expect(screen.getByText("Batch 14")).toBeTruthy());
    fireEvent.click(screen.getByText("Batch 14"));
    await waitFor(() => expect(screen.getByText("0 of 12 checked")).toBeTruthy());

    const loadsBefore = calls.filter((c) => c.method === "GET").length;
    fireEvent.click(screen.getAllByText("Works")[3]);

    // the count moves on the click, not when the network agrees
    await waitFor(() => expect(screen.getByText("1 of 12 checked")).toBeTruthy());
    await waitFor(() =>
      expect(calls.some((c) => c.path === "/admin/releases/batch/b2/verdict")).toBe(true),
    );
    // and the desk is not refetched, which is what rebuilt the drawer and
    // threw him back to the top of a hundred-odd rows
    expect(calls.filter((c) => c.method === "GET").length).toBe(loadsBefore);
  });

  it("leaves the other flows answerable while one is saving", async () => {
    serve({ current: longBatch });
    mount();
    await waitFor(() => expect(screen.getByText("Batch 14")).toBeTruthy());
    fireEvent.click(screen.getByText("Batch 14"));
    await waitFor(() => expect(screen.getByText("0 of 12 checked")).toBeTruthy());

    fireEvent.click(screen.getAllByText("Works")[0]);
    // every other flow's buttons stay live
    const stillLive = screen.getAllByText("Works").filter((b) => !b.disabled);
    expect(stillLive.length).toBeGreaterThan(9);
  });
});

// A row whose date the server could not give us — a Design Access placeholder,
// or a task the ledger sent without one — printed "NaN days" in the Waiting
// column. Richard saw a screenful of it.
it("says nothing rather than NaN when a date is missing or unusable", async () => {
  serve({
    items: [idea],
    awaitingReview: [{ ...emergency, reviewDueAt: "not-a-date" }],
  });
  mount();
  await waitFor(() => expect(screen.getByText("Auto take-off with AI")).toBeTruthy());
  expect(document.body.textContent).not.toMatch(/NaN/);
});
