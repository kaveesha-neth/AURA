import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { LyricLine } from "./native-lyrics-store";

// Keep timestamped lines mounted as they move between slots, with one spare
// on either side. Both playback sources use the same presentation.
export const LyricLines = memo(function LyricLines({ lines, index, visible, fit = false, fontSize }: {
  lines: LyricLine[]; index: number; visible: number; fit?: boolean; fontSize?: number;
}) {
  const elements = useRef(new Map<number, HTMLParagraphElement>());
  const radius = Math.floor(visible / 2);
  const start = Math.max(0, index - radius - 1);
  useLayoutEffect(() => {
    if (!fit) return;
    const resize = () => elements.current.forEach(element => {
      element.style.fontSize = "";
      const text = element.firstElementChild as HTMLElement;
      const preferred = parseFloat(getComputedStyle(element).fontSize);
      if (text.scrollHeight > element.clientHeight && element.clientHeight > 0) {
        element.style.fontSize = `${Math.min(preferred, Math.max(16, preferred * element.clientHeight / text.scrollHeight - .5))}px`;
      }
    });
    resize();
    const observer = new ResizeObserver(resize);
    elements.current.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [lines, index, visible, fit, fontSize]);
  return <>{lines.slice(start, index + radius + 2).map((line, offset) => {
    const lineIndex = start + offset;
    const distance = lineIndex - index;
    return <p key={lineIndex} ref={element => { if (element) elements.current.set(lineIndex, element); else elements.current.delete(lineIndex); }} className={`system-lyric ${distance === 0 ? "is-current" : ""}`}
      aria-hidden={Math.abs(distance) > radius} style={{ "--lyric-offset": distance } as CSSProperties}><span>{line.text}</span></p>;
  })}</>;
});
