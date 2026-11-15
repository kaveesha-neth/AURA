import { useEffect, useState } from "react";
export function useImmersiveControls() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const root = document.getElementById("root")!;
    const audio = document.getElementById("audio") as HTMLAudioElement;
    let timer: ReturnType<typeof setTimeout>;
    let lastMove = 0;
    let enabled = false;
    const wake = () => {
      clearTimeout(timer);
      setIdle(false);
      if (!enabled) return;
      timer = setTimeout(() => {
        if (!audio.paused) setIdle(true);
      }, 3000);
    };
    const changed = () => {
      const next = root.classList.contains("fullscreen-mode");
      if (next !== enabled) {
        enabled = next;
        wake();
      }
    };
    const pointer = () => {
      if (Date.now() - lastMove < 100) return;
      lastMove = Date.now();
      wake();
    };
    const observer = new MutationObserver(changed);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("pointermove", pointer, { passive: true });
    document.addEventListener("keydown", wake);
    audio.addEventListener("play", wake);
    audio.addEventListener("pause", wake);
    changed();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("pointermove", pointer);
      document.removeEventListener("keydown", wake);
      audio.removeEventListener("play", wake);
      audio.removeEventListener("pause", wake);
    };
  }, []);
  return idle;
}
