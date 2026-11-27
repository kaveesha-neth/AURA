import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { LyricLine } from "./native-lyrics-store";

// Keep timestamped lines mounted as they move between slots, with one spare
// on either side. Both playback sources use the same presentation.
export const LyricLines = memo(function LyricLines({ lines, index, visible, fontSize }: {
  lines: LyricLine[]; index: number; visible: number; fontSize: number;
}) {
  const elements = useRef(new Map<number, HTMLParagraphElement>());
  const radius = Math.floor(visible / 2);
  const start = Math.max(0, index - radius - 1);
  useLayoutEffect(() => {
    const viewport = elements.current.get(index)?.parentElement;
    if (!viewport) return;
    let disposed = false;
    let width = 0, height = 0;
    const layout = () => {
      if (disposed || !viewport.clientHeight || !viewport.clientWidth) return;
      width = viewport.clientWidth;
      height = viewport.clientHeight;
      const available = height;
      const heights = new Map<number, number>();
      elements.current.forEach((element, lineIndex) => {
        element.style.fontSize = `${fontSize}px`;
        // Natural wrapping is allowed to consume the entire viewport. Only
        // exceptionally tall text needs a measured, bounded font-size search.
        // Fit entering/leaving lines too, so their height stays stable in motion.
        if (element.offsetHeight > available) {
          let low = 0, high = fontSize;
          for (let attempt = 0; attempt < 12; attempt++) {
            const candidate = (low + high) / 2;
            element.style.fontSize = `${candidate}px`;
            if (element.offsetHeight <= available) low = candidate;
            else high = candidate;
          }
          element.style.fontSize = `${low}px`;
        }
        heights.set(lineIndex, element.offsetHeight);
      });
      const spacing = parseFloat(getComputedStyle(viewport).getPropertyValue("--lyric-spacing"));
      const step = Math.min(viewport.clientHeight * .9 / visible, spacing);
      const gap = fontSize * .6;
      elements.current.get(index)?.style.setProperty("--lyric-y", "0px");
      // Walk outwards using actual adjacent heights, keeping the active line
      // centered. Only the outer viewport clips the surrounding lines.
      for (const direction of [-1, 1]) {
        let previous = index, center = 0;
        for (let next = index + direction; heights.has(next); next += direction) {
          center += direction * Math.max(step, (heights.get(previous)! + heights.get(next)!) / 2 + gap);
          elements.current.get(next)?.style.setProperty("--lyric-y", `${center}px`);
          previous = next;
        }
      }
    };
    layout();
    // Resize and font-load events cover wrapping changes without polling or
    // observing our own positioning writes. Playback ticks never run layout.
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth !== width || viewport.clientHeight !== height) layout();
    });
    observer.observe(viewport);
    document.fonts.addEventListener("loadingdone", layout);
    if (document.fonts.status !== "loaded") void document.fonts.ready.then(layout);
    return () => { disposed = true; observer.disconnect(); document.fonts.removeEventListener("loadingdone", layout); };
  }, [lines, index, visible, fontSize]);
  return <>{lines.slice(start, index + radius + 2).map((line, offset) => {
    const lineIndex = start + offset;
    const distance = lineIndex - index;
    return <p key={lineIndex} ref={element => { if (element) elements.current.set(lineIndex, element); else elements.current.delete(lineIndex); }} className={`system-lyric ${distance === 0 ? "is-current" : ""}`}
      aria-hidden={Math.abs(distance) > radius} style={{ "--lyric-offset": distance } as CSSProperties}><span>{line.text}</span></p>;
  })}</>;
});
