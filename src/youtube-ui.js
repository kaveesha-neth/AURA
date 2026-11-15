'use strict';

(() => {
  const modal = document.getElementById('youtube-modal');
  const dialog = document.getElementById('youtube-dialog');
  const query = document.getElementById('youtube-query');
  const source = document.getElementById('youtube-source');
  const results = document.getElementById('youtube-results');
  const status = document.getElementById('youtube-status');
  const search = document.getElementById('youtube-search');
  const cancel = document.getElementById('youtube-cancel');
  const checkTools = document.getElementById('youtube-check-tools');
  const close = document.getElementById('youtube-close');
  const opener = document.getElementById('btn-search-online');
  let busy = false;
  let previousFocus;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function setBusy(value) {
    busy = value;
    search.disabled = value;
    checkTools.disabled = value;
    query.disabled = value;
    source.disabled = value;
    cancel.hidden = !value;
    cancel.disabled = false;
    results.querySelectorAll('button').forEach(button => { button.disabled = value; });
    if (!modal.hidden) {
      if (value) cancel.focus();
      else if (document.activeElement === cancel) query.focus();
    }
  }
  function hide() {
    modal.hidden = true;
    opener.textContent = 'Search online';
    opener.classList.toggle('has-update', busy);
    opener.setAttribute('aria-expanded', 'false');
    opener.title = busy ? 'Online search is working. Click to view progress.' : 'Search online for songs';
    previousFocus?.focus();
  }
  opener.addEventListener('click', () => {
    previousFocus = document.activeElement;
    setLibraryModal(false);
    modal.hidden = false;
    opener.classList.remove('has-update');
    opener.setAttribute('aria-expanded', 'true');
    (busy ? close : query).focus();
  });
  close.addEventListener('click', hide);
  document.getElementById('youtube-backdrop').addEventListener('click', hide);
  cancel.addEventListener('click', async () => {
    cancel.disabled = true;
    message('Cancelling…');
    try { await window.electronAPI.cancelYouTube(); }
    catch (error) { message(error.message, true); cancel.disabled = false; }
  });
  window.addEventListener('youtube-progress', event => { if (busy && !cancel.disabled) message(event.detail); });
  checkTools.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    message('Checking installed tools and AAC encoding for M4A…');
    try {
      const response = await window.electronAPI.checkYouTubeTools();
      if (response.error) throw new Error(response.error);
      message(response.tools.map(tool => `${tool.ok ? 'OK' : 'FAILED'} · ${tool.name}\n${tool.path}\n${tool.ok ? `${tool.version}${tool.checked ? ` · ${tool.checked}` : ''}` : tool.error}`).join('\n\n'), response.tools.some(tool => !tool.ok));
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  });
  document.getElementById('youtube-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !query.value.trim()) return;
    setBusy(true);
    results.replaceChildren();
    message(source.value === 'music' ? 'Searching YouTube Music songs…' : 'Searching YouTube…');
    try {
      const response = await window.electronAPI.searchYouTube(query.value, source.value);
      if (response.error) throw new Error(response.error);
      for (const result of response.results) {
        const row = document.createElement('article');
        row.className = 'youtube-result';
        const meta = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = result.title;
        const subtitle = document.createElement('p');
        subtitle.textContent = `${result.artist}${result.duration ? ` · ${Math.floor(result.duration / 60)}:${String(Math.floor(result.duration % 60)).padStart(2, '0')}` : ''}`;
        meta.append(title, subtitle);
        const actions = document.createElement('div');
        actions.className = 'youtube-result-actions';
        for (const [label, next] of [['Play Next', true], ['Add to Queue', false]]) {
          const button = document.createElement('button');
          button.className = 'library-action';
          button.textContent = label;
          button.addEventListener('click', () => download(result, next));
          actions.append(button);
        }
        row.append(meta, actions);
        results.append(row);
      }
      message(response.results.length ? 'Choose a result. Playback continues while audio downloads.' : 'No results found. Try another song or artist.');
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); if (!modal.hidden) query.focus(); }
  });
  async function download(result, next) {
    if (busy) return;
    setBusy(true);
    message(`Preparing “${result.title}”…`);
    try {
      const response = await window.electronAPI.downloadYouTube(result.id);
      if (response.error) throw new Error(response.error);
      addDownloadedSong(response.song, response.library, next);
      message(`“${response.song.title}” saved to your library and ${next ? 'queued next' : 'added to the queue'}.`);
    } catch (error) { message(error.message, true); }
    finally {
      setBusy(false);
      opener.classList.toggle('has-update', modal.hidden);
      opener.title = 'Open online search to view download status';
    }
  }
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled):not([hidden]), input:not(:disabled), select:not(:disabled)')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
})();
