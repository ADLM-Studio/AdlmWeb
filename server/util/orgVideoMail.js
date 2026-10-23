// server/util/orgVideoMail.js
//
// The two emails an organisation gets from the org-video and seat work:
//
//   notifyOrgVideoReady(doc)   "ADLM recorded something for your firm" — to
//                              every account whose licence names the firm,
//                              once, when the recording first becomes
//                              watchable while published.
//   notifySeatsChanged(...)    "your QUIV licence now has 8 seats" — to the
//                              account whose entitlement was changed.
//
// Both are fire-and-forget from the routes that cause them: a mail that
// fails must never fail the admin action it announces, so every entry point
// swallows and logs. The frame is util/emailLayout.js, same as every other
// message the studio sends.

import { sendMail } from "./mailer.js";
import { wrapEmail } from "./emailLayout.js";
import { User } from "../models/User.js";
import { firmOnRecordFilter, belongsToFirm } from "./firmAccounts.js";

const SITE = process.env.PUBLIC_SITE_URL || "https://www.adlmstudio.net";
// Where the shelf lives: the Learning screen of the customer dashboard.
// (/dashboard now redirects to /manage, which has no shelf, so the old
// default sent the "Watch it now" button to the wrong page.) Overridable for
// a build that keeps it somewhere else.
const WATCH_PATH = process.env.ORG_VIDEO_WATCH_PATH || "/dash-learning#org-videos";
// Where an account sees its seats. The old Dashboard on the public build; the
// new design has a Team screen, set through the same kind of override.
const SEATS_PATH = process.env.ACCOUNT_SEATS_PATH || "/dashboard";

const PRODUCT_NAMES = {
  revit: "QUIV (Revit)",
  planswift: "HERON (PlanSwift)",
  mep: "SERVIQ (Revit)",
  civil3d: "CIVIQ (Civil 3D)",
  rategen: "RateGen",
  "qs-takeoff": "ADLM Time Pro",
  archicad: "ArchiCAD",
  "boq-import": "BoQ Import",
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const p = (html) =>
  `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0E1620">${html}</p>`;
const first = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

/** The page the "Watch it now" button opens. */
export function watchUrl() {
  return `${SITE}${WATCH_PATH}`;
}

/**
 * Every account that would see this firm's shelf. `find` is injectable so the
 * selection can be tested without a database; it defaults to User.find.
 */
export async function accountsFor(orgKey, { find } = {}) {
  const query = async (filter, projection) => User.find(filter, projection).lean();
  const users = await (find || query)(
    { disabled: { $ne: true }, ...firmOnRecordFilter() },
    { email: 1, firstName: 1, username: 1, organizationName: 1, "entitlements.organizationName": 1 },
  );
  return users.filter((u) => belongsToFirm(u, orgKey));
}

/**
 * Tell the firm a recording is waiting for them. Sends at most once per
 * video: the caller checks `notifiedAt` and sets it; this only sends.
 */
export async function notifyOrgVideoReady(doc) {
  try {
    const people = await accountsFor(doc.orgKey);
    if (!people.length) return { sent: 0 };
    const watch = watchUrl();
    let sent = 0;
    for (const u of people) {
      if (!u.email) continue;
      try {
        await sendMail({
          to: u.email,
          subject: `A walkthrough from ADLM for ${doc.orgName}: ${doc.title}`,
          html: wrapEmail({
            title: `Recorded for ${esc(doc.orgName)}`,
            preheader: doc.description ? String(doc.description).slice(0, 120) : `Watch “${doc.title}” on your account.`,
            body:
              p(`Hello ${esc(first(u.firstName || u.username))},`) +
              p(
                `ADLM has recorded <b>${esc(doc.title)}</b> for ${esc(doc.orgName)}. It is on your account now, ` +
                  `under “From ADLM, for ${esc(doc.orgName)}”. Only accounts on your licence can see it.`,
              ) +
              (doc.description ? p(esc(doc.description)) : "") +
              p("It plays in the browser — no download, nothing to install."),
            cta: { label: "Watch it now", href: watch },
            footNote:
              "You are receiving this because your ADLM licence is held under " +
              esc(doc.orgName) +
              ". Questions go to support from inside your account.",
          }),
          templateKey: "org-video-ready",
        });
        sent += 1;
      } catch (e) {
        console.warn("[orgVideoMail] ready mail failed for", u.email, e?.message || e);
      }
    }
    return { sent };
  } catch (e) {
    console.warn("[orgVideoMail] ready notification failed:", e?.message || e);
    return { sent: 0 };
  }
}

/** Tell the account holder their seat count on one software changed. */
export async function notifySeatsChanged({ user, productKey, before, after, bound = 0, changedBy = "" }) {
  try {
    if (!user?.email) return false;
    const product = PRODUCT_NAMES[String(productKey).toLowerCase()] || productKey;
    const org = after?.organizationName || "";
    const up = Number(after.seats) > Number(before.seats);
    await sendMail({
      to: user.email,
      subject: `${product}: your licence now has ${after.seats} seat${after.seats === 1 ? "" : "s"}`,
      html: wrapEmail({
        title: up ? "More seats on your licence" : "Your seat count changed",
        preheader: `${product} · ${before.seats} → ${after.seats} seats${org ? ` · ${org}` : ""}`,
        body:
          p(`Hello ${esc(first(user.firstName || user.username))},`) +
          p(
            `Your <b>${esc(product)}</b> licence${org ? ` for ${esc(org)}` : ""} has been changed from ` +
              `<b>${before.seats}</b> to <b>${after.seats}</b> seat${after.seats === 1 ? "" : "s"}.` +
              (bound ? ` ${bound} machine${bound === 1 ? " is" : "s are"} signed in on it at the moment.` : ""),
          ) +
          p(
            up
              ? "Each extra seat lets one more machine sign in with this account. Install the software on the new " +
                  "machine, sign in with the same account, and it takes a seat."
              : "Machines already signed in keep working. A machine that signs out frees its seat for another.",
          ),
        cta: { label: "See your seats", href: `${SITE}${SEATS_PATH}` },
        footNote:
          (changedBy ? `Changed by ${esc(changedBy)} at ADLM. ` : "") +
          "If you did not ask for this, reply to this email or contact support from inside your account.",
      }),
      templateKey: "seats-changed",
    });
    return true;
  } catch (e) {
    console.warn("[orgVideoMail] seats mail failed:", e?.message || e);
    return false;
  }
}
