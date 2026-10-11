import { test } from "node:test";
import assert from "node:assert/strict";
import { ladderFor } from "./awsMediaConvert.js";

const heights = (h) => ladderFor(h).map((o) => o.VideoDescription.Height);

test("a source between rungs gets its own rung at the top", () => {
  assert.deepEqual(heights(610), [610, 540, 360, 240]);
  const native = ladderFor(610)[0];
  assert.equal(native.NameModifier, "_610");
  const mb = native.VideoDescription.CodecSettings.H264Settings.MaxBitrate;
  assert.ok(mb > 800000 && mb < 1200000, `ceiling interpolated, got ${mb}`);
});

test("a source on a rung, or within the slack, gets no extra rung", () => {
  assert.deepEqual(heights(1080), [1080, 720, 540, 360, 240]);
  assert.deepEqual(heights(1076), [1080, 720, 540, 360, 240]);
  assert.deepEqual(heights(2160), [2160, 1080, 720, 540, 360, 240]);
});

test("odd heights round to even; nothing is added above the table or below its floor", () => {
  assert.deepEqual(heights(815), [814, 720, 540, 360, 240]);
  assert.deepEqual(heights(2880), [2160, 1080, 720, 540, 360, 240]);
  assert.deepEqual(heights(200), [240]);
  assert.deepEqual(heights(0), [2160, 1080, 720, 540, 360, 240]);
});
