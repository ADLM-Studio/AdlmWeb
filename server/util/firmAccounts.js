// server/util/firmAccounts.js
//
// Which accounts belong to a firm. A firm name lives in two places on a User:
// the top-level `organizationName`, and `organizationName` on each
// entitlement, because one account can hold an organisation licence for one
// product and a personal licence for another.
//
// That second case is why the filter uses $elemMatch. The obvious query,
//   { "entitlements.organizationName": { $nin: [null, ""] } }
// looks right but is wrong on an array path: $nin excludes the document when
// ANY element is null or empty, so an account with one firm licence and one
// personal licence vanished from the org-video picker and from the "recorded
// for your firm" email (project@construworth.com, 23 Oct 2026).

import { orgKeyOf } from "../models/OrgVideo.js";

/** Users with a firm name on the account or on at least one entitlement. */
export function firmOnRecordFilter() {
  return {
    $or: [
      { entitlements: { $elemMatch: { organizationName: { $exists: true, $nin: [null, ""] } } } },
      { organizationName: { $exists: true, $nin: [null, ""] } },
    ],
  };
}

/** True when this account belongs to the firm with this key. */
export function belongsToFirm(user, orgKey) {
  if (!orgKey) return false;
  if (orgKeyOf(user?.organizationName) === orgKey) return true;
  return (user?.entitlements || []).some((e) => orgKeyOf(e?.organizationName) === orgKey);
}

/**
 * Every firm named on these users, for the admin picker:
 *   [{ name, key, people, live }] sorted by name. `people` counts accounts
 * that name the firm anywhere; `live` counts accounts with an active
 * entitlement under it.
 */
export function summariseFirms(users) {
  const firms = new Map(); // key -> { name, key, people, live }
  const add = (name) => {
    const n = String(name ?? "").trim().slice(0, 120);
    const key = orgKeyOf(n);
    if (!key) return;
    const f = firms.get(key) || { name: n, key, people: new Set(), live: 0 };
    firms.set(key, f);
    return f;
  };
  for (const u of users || []) {
    const seen = new Set();
    if (u.organizationName) {
      const f = add(u.organizationName);
      if (f) {
        f.people.add(String(u._id));
        seen.add(f.key);
      }
    }
    for (const e of u.entitlements || []) {
      const f = add(e.organizationName);
      if (!f) continue;
      f.people.add(String(u._id));
      if (String(e.status).toLowerCase() === "active" && !seen.has(f.key)) {
        f.live += 1;
        seen.add(f.key);
      }
    }
  }
  return [...firms.values()]
    .map((f) => ({ name: f.name, key: f.key, people: f.people.size, live: f.live }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
