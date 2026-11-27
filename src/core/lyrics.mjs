// Pure LRC parsing. No network, audio or DOM dependencies.
export function parseLRCTime(min, sec, fraction) {
  const m = parseInt(min, 10) || 0;
  const s = parseInt(sec, 10) || 0;
  const f = fraction ? Number(`0.${fraction}`) : 0;
  return m * 60 + s + f;
}

export function parseLRC(text) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/);

  for (const raw of lines) {
    const tags = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g)];
    if (!tags.length) continue;

    const lyric = raw
      .replace(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g, "")
      .trim();
    if (!lyric) continue;

    for (const tag of tags) {
      out.push({ time: parseLRCTime(tag[1], tag[2], tag[3]), text: lyric });
    }
  }

  return out.sort((a, b) => a.time - b.time);
}

// Keep the native player's 80 ms tolerance and first-line preview behavior.
export function activeLyricIndex(lines, time) {
  if (!lines.length) return -1;
  let lo = 0, hi = lines.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time + 0.08) { result = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return Math.max(0, result);
}
