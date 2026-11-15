// Budget the artwork against the actual text/control heights, including wrapped lyrics.
// Measurements happen only when the window or those elements resize, never on timeupdate.
export function observePlayerLayout() {
  const panel = document.getElementById("player-panel")!;
  const artwork = document.getElementById("cover-wrap")!;
  let frame = 0;
  const measure = () => {
    frame = 0;
    let occupied = 0;
    for (const child of Array.from(panel.children)) {
      const element = child as HTMLElement;
      if (element === artwork) continue;
      const style = getComputedStyle(element);
      occupied +=
        element.getBoundingClientRect().height +
        (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0);
    }
    const style = getComputedStyle(artwork);
    const margin =
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0);
    const panelStyle = getComputedStyle(panel);
    const width =
      panel.clientWidth -
      parseFloat(panelStyle.paddingLeft) -
      parseFloat(panelStyle.paddingRight);
    const size = Math.floor(
      Math.max(
        130,
        Math.min(
          width,
          innerHeight > 940 ? 390 : 340,
          panel.clientHeight -
            occupied -
            margin -
            parseFloat(panelStyle.paddingTop) -
            parseFloat(panelStyle.paddingBottom) -
            5,
        ),
      ),
    );
    if (artwork.style.width !== size + "px") artwork.style.width = size + "px";
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(panel);
  for (const child of Array.from(panel.children))
    if (child !== artwork) observer.observe(child);
  schedule();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
