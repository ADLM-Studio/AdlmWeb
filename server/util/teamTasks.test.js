// The kinds of work, checked against the 15 Oct 2026 digest as Richard sorted
// it by hand (adlm-studio-site, site/assets/js/desk-tasks.js). If one of these
// moves, the desk's "Decide 9" count lies.
import test from "node:test";
import assert from "node:assert/strict";
import { doingOf, firstSentence } from "./teamTasks.js";

const CASES = [
  // design
  ["design", "Nudge on #32: HERON 3 AI Review has no design yet (plugin-heron.html only has the plain ‘Review before saving’ sheet). We are building…"],
  ["design", "Design: saving variations on a merged project (R4c, emailed 26 Sep)"],
  ["design", "Send designs: /fit redesign (R18) and the Submitted modal (R13)"],
  ["design", "Design the Installer Hub 2.0 staff area in the Hub 2.0 language, light and dark: the Software gallery … The work-board proposal for this is waiting for your approve or decline."],
  ["design", "Design the COBie export button for ServiQ (the MEP plugin) and say where it goes. … Also approve or decline proposal mep-serviq-cobie-export on the work board."],
  // decide
  ["decide", "Approve or decline work-board proposal heron-template-identity: rename the PlanSwift template root…"],
  ["decide", "Decide and design ServiQ (MEP) auto take-off on the work board: one run measures all 9 MEP items…"],
  ["decide", "Two quick decisions on the bill-pricing and Ada work you approved in Batch 8 (all live): (1) On the sheet, section ‘Built without a design from you’: Keep, Change or Remove…"],
  ["decide", "The product videos are ready for your review in the ADLM Google Drive: 7 products… For each one reply Keep, Change (say what) or Remove."],
  ["decide", "Approve or send back the QUIV proposal: split walls, finishes and painting into internal and external…"],
  ["decide", "Two proposals wait for your decision on the work board: ‘Ada can read the sample projects’…"],
  ["decide", "Approve or decline work-board proposal org-accounts, then design it. Adedolapo has decided the shape…"],
  ["decide", "Decide on the work-board proposal ‘QUIV: undo a deletion on the take-off list’…"],
  ["decide", "Four customer requests from the Melodiva demo are on the work board for a decision: fewer sign-ins…"],
  // test
  ["test", "Please test Installer Hub 2.0 on your PC before it goes to customers. The checklist has the download at the top and 15 short flows…"],
  ["test", "Test sheet for Batch 1 (QUIV 4.0) now has a new card: ‘Review without a RateGen licence’…"],
  ["test", "Test Rate Gen 3.0.0 build 2610.2 in your Installer Hub and approve it on Release sign-off…"],
  ["test", "Test and sign off the Installer Hub’s new ‘close Revit first’ message…"],
  ["test", "Test the new product pages for your next batch, on preview.adlmstudio.net…"],
  ["test", "HERON 3.0, build 3.0.2610.2 is waiting for you on the release desk (it replaces build 3.0.2610.1)…"],
  ["test", "Everything waiting for you is on one page: three approvals on the release desk (Batch 13, Rate Gen 3.0…"],
  ["test", "Test the admin on your phone: 12 screens Ebun uses…"],
  ["test", "Batch 14 is ready again on Release sign-off, now 47 short flows…"],
  ["test", "Quick one (2 minutes): on Release sign-off, a one-item batch ‘Product pages state the version and build’…"],
  // answer
  ["answer", "RateGen rate data: Concrete grade 35 (1:1½:1) calls for 18 bags of cement per m³… Please give the intended mix…"],
  ["answer", "RateGen rate data: Grit blasting and sand blasting to SP10… Please confirm the output per day (m²) the rate should use."],
  // admin
  ["admin", "Accept the invite to join the ADLM-Studio GitHub organization (email from GitHub…"],
  ["admin", "Please update the prices typed into your site source (ADLMWebNewUI/site) so the next port does not bring old figures back…"],
  ["admin", "Google billing: reinstate the Google Cloud billing account 010E75-4D29BB-F31103…"],
  ["admin", "After PR #34 is merged and its deploy approved: move the Android APK into the AWS bucket…"],
  ["admin", "Confirm you have read policy ADLM/POL/2026/09/002 (emailed 26 Sep) by Mon 28 Sep"],
  ["admin", "Update your Notion task board today: all 10 open tasks are past due and nothing has changed since 27 Sep…"],
  ["admin", "On or after 13 Oct 2026: make admin@adlmstudio.net Primary owner of the ADLM Studio YouTube channel…"],
];

test("every task of the 15 Oct digest sorts as Richard sorted it", () => {
  for (const [want, text] of CASES) {
    assert.equal(doingOf(text), want, text.slice(0, 60));
  }
});

test("empty or odd input is admin, never a throw", () => {
  assert.equal(doingOf(""), "admin");
  assert.equal(doingOf(null), "admin");
  assert.equal(doingOf(42), "admin");
});

test("the title is the first sentence, not the text up to the first colon", () => {
  assert.equal(firstSentence("Design: saving variations on a merged project (R4c, emailed 26 Sep)"), "Design: saving variations on a merged project (R4c, emailed 26 Sep)");
  assert.equal(
    firstSentence("Accept the invite to join the ADLM-Studio GitHub organization. It gives you read access to every repo."),
    "Accept the invite to join the ADLM-Studio GitHub organization",
  );
  // a very short first sentence takes the next clause with it
  assert.equal(firstSentence("Quick one. Open QUIV from the Products menu and check the line under the buttons."), "Quick one. Open QUIV from the Products menu and check the line under the buttons.");
  // long asks are cut with an ellipsis, never mid-punctuation
  const long = firstSentence("Design the Installer Hub 2.0 staff area in the Hub 2.0 language, light and dark, with the Software gallery, Installations, Devices and the Manifest editor and everything else");
  assert.ok(long.endsWith("…"));
  assert.ok(long.length <= 104);
});
