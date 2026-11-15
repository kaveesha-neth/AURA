import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from "react";
import { flushSync } from "react-dom";

// Fixed-height virtual rows need no off-screen droppable registrations. One
// animation loop owns only transforms; the playback queue changes once on drop.
export function useQueueDrag(
  list: RefObject<HTMLDivElement | null>,
  ids: string[],
  disabled: boolean,
  rowHeight: number,
) {
  const [dragging, setDragging] = useState(false);
  const session = useRef<null | { cancel: () => void }>(null);
  const suppressClick = useRef(false);
  const identity = ids.join("\0");
  useEffect(() => () => session.current?.cancel(), [identity, disabled]);
  function begin(event: PointerEvent<HTMLElement>, id: string) {
    if (session.current) return;
    suppressClick.current = false;
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    if (
      (event.target as HTMLElement).closest(
        "button:not(.track-hit):not(.track-grip),input,a,[role=menu]",
      )
    )
      return;
    const container = list.current;
    const source = event.currentTarget;
    if (!container) return;
    const origin = ids.indexOf(id);
    const initial = source.getBoundingClientRect();
    const startX = event.clientX,
      startY = event.clientY,
      initialScroll = container.scrollTop;
    let x = startX,
      y = startY,
      destination = origin,
      lifted = false,
      settling = false,
      frame = 0,
      last = performance.now();
    let overlay: HTMLElement | null = null,
      pocket: HTMLElement | null = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const springs = new Map<HTMLElement, { value: number; velocity: number }>();
    const hidden = new Map<HTMLElement, string>();
    let animation: Animation | undefined;
    const move = (e: globalThis.PointerEvent) => {
      if (e.pointerId !== event.pointerId || settling) return;
      x = e.clientX;
      y = e.clientY;
      if (!lifted && Math.hypot(x - startX, y - startY) >= 5) {
        lifted = true;
        suppressClick.current = true;
        setDragging(true);
        source
          .querySelector<HTMLButtonElement>(".track-hit")
          ?.focus({ preventScroll: true });
        overlay = source.cloneNode(true) as HTMLElement;
        overlay.removeAttribute("id");
        overlay
          .querySelectorAll("[id]")
          .forEach((e) => e.removeAttribute("id"));
        overlay.classList.remove("q-item");
        overlay.classList.add("queue-drag-overlay");
        overlay.setAttribute("aria-hidden", "true");
        overlay.inert = true;
        Object.assign(overlay.style, {
          top: `${initial.top}px`,
          left: `${initial.left}px`,
          width: `${initial.width}px`,
          height: `${rowHeight}px`,
        });
        // Copy the resolved shared grid, including its responsive column widths.
        overlay.style.gridTemplateColumns =
          getComputedStyle(source).gridTemplateColumns;
        overlay.style.columnGap = getComputedStyle(source).columnGap;
        document.body.append(overlay);
        pocket = document.createElement("div");
        pocket.className = "queue-drop-pocket";
        pocket.style.height = `${rowHeight}px`;
        container.querySelector(".track-spacer")?.append(pocket);
        container.dataset.dragging = "true";
        container.setPointerCapture(event.pointerId);
        announce(
          `Moving ${source.querySelector(".track-title")?.textContent}. Use Escape to cancel.`,
        );
      }
      if (lifted) e.preventDefault();
    };
    function announce(message: string) {
      const live =
        container!.parentElement?.querySelector(".queue-drag-status");
      if (live) live.textContent = message;
    }
    function clean() {
      cancelAnimationFrame(frame);
      animation?.cancel();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
      if (container!.hasPointerCapture(event.pointerId))
        container!.releasePointerCapture(event.pointerId);
      overlay?.remove();
      pocket?.remove();
      delete container!.dataset.dragging;
      springs.forEach((_, element) =>
        element.style.removeProperty("transform"),
      );
      hidden.forEach((value, element) => (element.style.visibility = value));
      setDragging(false);
      session.current = null;
    }
    function finish(commit: boolean, immediate = false) {
      if (settling) return;
      settling = true;
      if (!lifted) {
        clean();
        return;
      }
      if (!commit) destination = origin;
      const top =
        container!.getBoundingClientRect().top +
        destination * rowHeight -
        container!.scrollTop;
      const end = () => {
        if (commit && destination !== origin) {
          const order = ids.filter((value) => value !== id);
          order.splice(destination, 0, id);
          // Commit the virtual row positions before revealing the source and
          // clearing reflow transforms, so there is no intermediate old frame.
          flushSync(() => window.aura.move(id, order[destination + 1]));
        }
        announce(
          commit
            ? `Moved to position ${destination + 1}.`
            : "Reorder cancelled.",
        );
        clean();
      };
      if (immediate || reduced) {
        end();
        return;
      }
      animation = overlay!.animate(
        [
          { transform: overlay!.style.transform },
          { transform: `translate3d(0,${top - initial.top}px,0)` },
        ],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" },
      );
      animation.finished.then(end, () => {});
    }
    const up = (e: globalThis.PointerEvent) => {
      if (e.pointerId === event.pointerId) finish(true);
    };
    const cancel = () => finish(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(false);
      }
    };
    function tick(now: number) {
      const dt = Math.min((now - last) / 1000, 0.032);
      last = now;
      if (lifted) {
        if (!settling) {
          const bounds = container!.getBoundingClientRect(),
            edge = Math.min(64, bounds.height / 4);
          const speed =
            y < bounds.top + edge
              ? -Math.min(1, (bounds.top + edge - y) / edge)
              : y > bounds.bottom - edge
                ? Math.min(1, (y - bounds.bottom + edge) / edge)
                : 0;
          container!.scrollTop += speed * Math.abs(speed) * 640 * dt;
          const delta = y - startY + container!.scrollTop - initialScroll;
          destination = Math.max(
            0,
            Math.min(ids.length - 1, Math.round(origin + delta / rowHeight)),
          );
          overlay!.style.transform = `translate3d(${Math.max(-24, Math.min(24, x - startX))}px,${y - startY}px,0)`;
        }
        pocket!.style.transform = `translate3d(0,${destination * rowHeight}px,0)`;
        pocket!.dataset.position = String(destination);
        container!
          .querySelectorAll<HTMLElement>(".q-item")
          .forEach((element) => {
            const index = Number(element.dataset.index);
            if (element.dataset.id === id) {
              if (!hidden.has(element))
                hidden.set(element, element.style.visibility);
              element.style.visibility = "hidden";
              return;
            }
            const target =
              destination > origin && index > origin && index <= destination
                ? -rowHeight
                : destination < origin && index >= destination && index < origin
                  ? rowHeight
                  : 0;
            const spring = springs.get(element) || { value: 0, velocity: 0 };
            springs.set(element, spring);
            // Critically damped spring: controlled reflow, without overshoot/bounce.
            const omega = 24,
              displacement = spring.value - target,
              decay = Math.exp(-omega * dt),
              impulse = spring.velocity + omega * displacement;
            spring.value = reduced
              ? target
              : target + (displacement + impulse * dt) * decay;
            spring.velocity = reduced
              ? 0
              : (spring.velocity - omega * impulse * dt) * decay;
            element.style.transform = `translate3d(0,${spring.value}px,0)`;
          });
      }
      frame = requestAnimationFrame(tick);
    }
    session.current = { cancel: () => finish(false, true) };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    frame = requestAnimationFrame(tick);
  }
  return { begin, dragging, suppressClick };
}
