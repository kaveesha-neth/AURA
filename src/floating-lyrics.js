'use strict';

const root = document.getElementById('floating-lyrics');
const lyricNodes = [...document.querySelectorAll('.floating-lyric')];
let lastStateKey = '';
let lastActiveLineCount = 1;
let visibleLineCount = 6;
let latestLyricsState = null;

function splitActiveLyric(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= 5) return [String(text || '')];

  const lines = [];
  for (let index = 0; index < words.length; index += 5) {
    lines.push(words.slice(index, index + 5).join(' '));
  }
  return lines;
}

function visibleLyricIndexes(activeIndex, count) {
  const visibleCount = Math.max(3, Math.min(lyricNodes.length, Number(count) || lyricNodes.length));
  let start = activeIndex - Math.floor((visibleCount - 1) / 2);
  start = Math.max(0, Math.min(lyricNodes.length - visibleCount, start));
  return new Set(Array.from({ length: visibleCount }, (_value, index) => start + index));
}

function renderLyrics(state = {}) {
  latestLyricsState = state;
  const lines = Array.isArray(state.lines) ? state.lines.slice(0, lyricNodes.length).map(line => String(line || '')) : [];
  const activeIndex = Math.max(0, Math.min(lyricNodes.length - 1, Number(state.activeIndex) || 0));
  const transition = ['forward', 'backward'].includes(state.transition) ? state.transition : 'none';
  const stateKey = JSON.stringify([lines, activeIndex, transition, visibleLineCount]);
  if (stateKey === lastStateKey) return;
  lastStateKey = stateKey;

  const activeLyricLines = splitActiveLyric(lines[activeIndex] || '');
  const visibleIndexes = visibleLyricIndexes(activeIndex, visibleLineCount);
  lyricNodes.forEach((node, index) => {
    node.hidden = !visibleIndexes.has(index);
    node.textContent = index === activeIndex ? activeLyricLines.join('\n') : (lines[index] || '');
    node.classList.toggle('current', index === activeIndex);
  });

  if (activeLyricLines.length !== lastActiveLineCount) {
    lastActiveLineCount = activeLyricLines.length;
    window.floatingLyricsAPI?.setActiveLineCount?.(lastActiveLineCount);
  }

  root.classList.remove('transition-forward', 'transition-backward');
  if (transition !== 'none') {
    void root.offsetWidth;
    root.classList.add(`transition-${transition}`);
  }
}

window.floatingLyricsAPI?.onState(renderLyrics);
window.floatingLyricsAPI?.onScale(({ scale }) => {
  const factor = Math.max(0.1, Math.min(1.4, Number(scale) / 100 || 1));
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--floating-gap', `${8 * factor}px`);
  rootStyle.setProperty('--floating-padding-y', `${20 * factor}px`);
  rootStyle.setProperty('--floating-padding-x', `${38 * factor}px`);
  rootStyle.setProperty('--floating-side-size', `${18 * factor}px`);
  rootStyle.setProperty('--floating-current-size', `${30 * factor}px`);
});
window.floatingLyricsAPI?.onVisibleLineCount(({ count }) => {
  visibleLineCount = Math.max(3, Math.min(lyricNodes.length, Number(count) || lyricNodes.length));
  if (latestLyricsState) renderLyrics(latestLyricsState);
});
