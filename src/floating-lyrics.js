'use strict';

const root = document.getElementById('floating-lyrics');
const lyricNodes = [...document.querySelectorAll('.floating-lyric')];
const controls = document.getElementById('floating-lyrics-controls');
const playButton = controls?.querySelector('[data-action="play-pause"]');
let lastStateKey = '';
let visibleLineCount = 6;
let latestLyricsState = null;
let controlsHovered = false;

function setControlsHovered(hovered) {
  const nextHovered = Boolean(hovered);
  if (nextHovered === controlsHovered) return;
  controlsHovered = nextHovered;
  window.floatingLyricsAPI?.setControlsHover?.(controlsHovered);
}

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
  rootStyle.setProperty('--floating-control-size', `${34 * factor}px`);
  rootStyle.setProperty('--floating-play-size', `${44 * factor}px`);
  rootStyle.setProperty('--floating-controls-gap', `${14 * factor}px`);
  rootStyle.setProperty('--floating-controls-margin', `${4 * factor}px`);
});
window.floatingLyricsAPI?.onVisibleLineCount(({ count }) => {
  visibleLineCount = Math.max(3, Math.min(lyricNodes.length, Number(count) || lyricNodes.length));
  if (latestLyricsState) renderLyrics(latestLyricsState);
});
window.floatingLyricsAPI?.onPlaybackState(state => {
  const isPlaying = Boolean(state?.isPlaying);
  if (playButton) {
    playButton.classList.toggle('is-playing', isPlaying);
    playButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
    playButton.title = isPlaying ? 'Pause' : 'Play';
  }
});

controls?.addEventListener('pointerenter', () => setControlsHovered(true));
controls?.addEventListener('pointerleave', () => setControlsHovered(false));
controls?.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  window.floatingLyricsAPI?.controlPlayback?.(button.dataset.action);
});
document.addEventListener('mousemove', event => {
  if (!controls) return;
  const bounds = controls.getBoundingClientRect();
  setControlsHovered(
    event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom,
  );
});
