const { test } = require("node:test");
const assert = require("node:assert/strict");
test("LRC parses multiple timestamps, fractions and wrapped Unicode text", async () => {
  const { parseLRC } = await import("../src/core/lyrics.mjs");
  const lines = parseLRC(
    "[ar:Artist]\n[00:12.50][00:22.005]A long line — සිංහල 日本語\n[00:02.1]First\n[01:03]Final",
  );
  assert.deepEqual(
    lines.map((l) => l.time),
    [2.1, 12.5, 22.005, 63],
  );
  assert.equal(lines[1].text, lines[2].text);
  assert.equal(lines[1].text, "A long line — සිංහල 日本語");
});
test("LRC ignores blank lines and untimed metadata without inventing timestamps", async () => {
  const { parseLRC } = await import("../src/core/lyrics.mjs");
  assert.deepEqual(
    parseLRC("[00:10]\n[ar:Artist]\nUntimed text\n[00:11.000]Actual lyric"),
    [{ time: 11, text: "Actual lyric" }],
  );
  assert.deepEqual(parseLRC(null), []);
});
