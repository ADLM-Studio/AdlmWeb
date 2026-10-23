// server/util/firmAccounts.test.js
//
// The firm filter is evaluated here with sift, the query-matching library
// Mongoose itself depends on, so the test exercises $elemMatch semantics
// rather than the shape of the object. (sift does not reproduce MongoDB's
// behaviour for the OLD dotted-path $nin, which is why that query is only
// described in firmAccounts.js and not asserted here.)
import { test } from "node:test";
import assert from "node:assert/strict";
import sift from "sift";
import { firmOnRecordFilter, belongsToFirm, summariseFirms } from "./firmAccounts.js";
import { accountsFor, watchUrl } from "./orgVideoMail.js";

// project@construworth.com, 23 Oct 2026: one organisation licence and one
// personal licence on the same account.
const mixed = {
  _id: "u1",
  email: "project@construworth.com",
  firstName: "Project",
  organizationName: "",
  entitlements: [
    { productKey: "revit", status: "active", organizationName: "CONSTRUWORTH CONSULT" },
    { productKey: "rategen", status: "active", organizationName: "" },
  ],
};
const personalOnly = {
  _id: "u2",
  email: "solo@example.com",
  organizationName: "",
  entitlements: [{ productKey: "revit", status: "active", organizationName: "" }],
};
const accountLevel = {
  _id: "u3",
  email: "boss@ysassociates.com",
  organizationName: "Y.S. Associates Ltd",
  entitlements: [{ productKey: "planswift", status: "expired" }],
};
const disabled = {
  _id: "u4",
  email: "left@construworth.com",
  disabled: true,
  entitlements: [{ productKey: "revit", status: "active", organizationName: "Construworth Consult" }],
};
const all = [mixed, personalOnly, accountLevel, disabled];

test("an account with one firm licence and one personal licence is on record for the firm", () => {
  const match = sift(firmOnRecordFilter());
  assert.equal(match(mixed), true);
  assert.equal(match(accountLevel), true);
  assert.equal(match(personalOnly), false);
});

test("belongsToFirm matches the firm on either the account or an entitlement, by key", () => {
  assert.equal(belongsToFirm(mixed, "construworth consult"), true);
  assert.equal(belongsToFirm(accountLevel, "y s associates ltd"), true);
  assert.equal(belongsToFirm(personalOnly, "construworth consult"), false);
  assert.equal(belongsToFirm(mixed, ""), false);
});

test("the admin picker lists the firm from the mixed account", () => {
  const items = summariseFirms(all.filter(sift(firmOnRecordFilter())));
  const construworth = items.find((f) => f.key === "construworth consult");
  assert.ok(construworth, "CONSTRUWORTH CONSULT is listed");
  assert.equal(construworth.name, "CONSTRUWORTH CONSULT");
  assert.deepEqual(
    items.map((f) => f.name),
    ["CONSTRUWORTH CONSULT", "Y.S. Associates Ltd"],
  );
  // Both construworth accounts count as people; both hold an active licence.
  assert.equal(construworth.people, 2);
  assert.equal(construworth.live, 2);
  assert.equal(items.find((f) => f.key === "y s associates ltd").live, 0);
});

test("accountsFor emails the mixed account and skips disabled ones", async () => {
  const find = async (filter) => all.filter(sift(filter));
  const people = await accountsFor("construworth consult", { find });
  assert.deepEqual(
    people.map((u) => u.email),
    ["project@construworth.com"],
  );
  assert.deepEqual(await accountsFor("y s associates ltd", { find }), [accountLevel]);
  assert.deepEqual(await accountsFor("nobody", { find }), []);
});

test("the Watch it now button opens the Learning screen's shelf by default", () => {
  // /dashboard redirects to /manage, which has no shelf.
  assert.equal(watchUrl(), "https://www.adlmstudio.net/dash-learning#org-videos");
});
