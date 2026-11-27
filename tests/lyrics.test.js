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

test("shared lyric lookup preserves native preview and tolerance, seeks and instrumental gaps", async () => {
  const { parseLRC, activeLyricIndex } = await import("../src/core/lyrics.mjs");
  const lines = parseLRC('[00:10]First\n[00:20]Second\n[01:00]After instrumental');
  assert.equal(activeLyricIndex([], 30), -1);
  assert.equal(activeLyricIndex(lines, 0), 0);
  assert.equal(activeLyricIndex(lines, 19.93), 1);
  assert.equal(activeLyricIndex(lines, 59), 1);
  assert.equal(activeLyricIndex(lines, 61), 2);
  assert.equal(activeLyricIndex(lines, 12), 0);
});

test("Windows timeline rebases on pause, resume, forward/backward seek and session changes", async () => {
  const { mediaPosition } = await import('../src/core/media-timeline.mjs');
  const session = { start: 0, end: 200, position: 30, playing: true, updatedAt: 10000, rate: 1 };
  assert.equal(mediaPosition(session, 12000), 32);
  const paused = { ...session, playing: false, position: 32, updatedAt: 12000 };
  assert.equal(mediaPosition(paused, 60000), 32);
  assert.equal(mediaPosition({ ...paused, playing: true, updatedAt: 60000 }, 61000), 33);
  assert.equal(mediaPosition({ ...session, position: 120, updatedAt: 12000 }, 12000), 120);
  assert.equal(mediaPosition({ ...session, position: 5, updatedAt: 12000 }, 12000), 5);
  assert.equal(mediaPosition({ ...session, position: 80, playing: false }, 12000), 80);
  assert.equal(mediaPosition({ ...session, position: 0, playing: false }, 12000), 0);
  assert.equal(mediaPosition({ ...session, rate: 2 }, 12000), 34);
  assert.equal(mediaPosition(session, 9000), 30);
  assert.equal(mediaPosition(session, 999999), 200);
  assert.equal(mediaPosition(undefined, 12000), 0);
  assert.equal(mediaPosition({ ...session, end: 0 }, 12000), 30);
});
