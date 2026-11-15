// General playback audits must never change the user's Windows master volume.
const { EventEmitter } = require('node:events');
class VolumeFixture extends EventEmitter {
  constructor() { super(); this.state = { available: true, volume: .8, muted: false }; }
  start() {}
  stop() {}
  setVolume(volume) { this.state = { available: true, volume, muted: false }; this.emit('change', this.state); }
  toggleMute() { this.state = { ...this.state, muted: !this.state.muted }; this.emit('change', this.state); }
}
require('../src/core/master-volume.cjs');
require.cache[require.resolve('../src/core/master-volume.cjs')].exports = { MasterVolume: VolumeFixture };
