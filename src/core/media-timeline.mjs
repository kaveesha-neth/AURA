// Windows positions and bounds are seconds; LastUpdatedTime is Unix milliseconds.
// Rebase on every report, including seeks, pauses, track and session changes.
export function mediaPosition(session, now = Date.now()) {
  if (!session) return 0;
  const start = Number.isFinite(session.start) ? session.start : 0;
  const position = Number.isFinite(session.position) ? session.position : start;
  const elapsed = session.playing && Number.isFinite(session.updatedAt)
    ? Math.max(0, now - session.updatedAt) / 1000 : 0;
  const rate = Number.isFinite(session.rate) ? session.rate : 1;
  const end = session.end > start ? session.end : position;
  return Math.min(end, Math.max(start, position + elapsed * rate));
}
