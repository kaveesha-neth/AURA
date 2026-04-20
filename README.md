# Aura Music Player

A modern Electron-based desktop music player with a 9:16 player panel and side-by-side queue panel.

## Window Layout
- **Total window**: 900 × 800px (9:8 ratio)
- **Player panel**: 450 × 800px (9:16)
- **Queue panel**: 450 × 800px (9:16)

## Setup & Run

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or newer
- npm (comes with Node.js)

### Install & Launch

```bash
# 1. Install dependencies (downloads Electron ~100MB)
npm install

# 2. Run the app
npm start
```

> First run takes a moment while Electron downloads. Subsequent launches are instant.

### Add Your Music

**Option A – Drop files into the `/songs` folder before launching**
The app will not auto-scan on startup, but you can drag & drop audio files directly onto the window.

**Option B – Use the buttons inside the app**
- Click **"+ Files"** → pick individual audio files
- Click **"+ Folder"** → pick a folder and all audio files inside are loaded

**Supported formats:** MP3, FLAC, WAV, OGG, M4A, AAC, OPUS, WMA, AIFF

## Features

| Feature | Detail |
|---|---|
| Album art | Extracted from ID3 tags; dynamic background tint from cover colors |
| Waveform | Real audio waveform rendered from decoded audio data |
| Scrubbing | Click or drag on waveform or seek bar |
| Metadata | ID3v2 tags: title, artist, album |
| Shuffle | True random shuffle with history for prev |
| Repeat | Off → Repeat All → Repeat One |
| Queue | Scrollable, searchable, click-to-play, remove individual tracks |
| Volume | Drag slider or use ↑↓ keys; click icon to mute/unmute |
| Keyboard | Space=play/pause, ←/→=seek 5s, Alt+←/→=prev/next, S=shuffle, R=repeat |
| Drag & drop | Drop audio files anywhere on the window |
| Disc spin | Album cover spins while playing, pauses when paused |

## Build for Distribution

```bash
# Windows (.exe installer)
npm run build-win

# macOS (.dmg)
npm run build-mac

# Linux (.AppImage)
npm run build-linux
```

Output files go to `/dist`.

## Project Structure

```
aura-music-player/
├── main.js          # Electron main process
├── preload.js       # Secure bridge (contextBridge)
├── package.json
├── songs/           # Drop your music here (optional)
├── assets/
│   └── icon.png     # App icon (add your own 512×512 PNG)
└── src/
    ├── index.html   # App shell
    ├── styles.css   # All styles + animations
    └── renderer.js  # Player logic, waveform, metadata
```
