/** Owns one Web Audio graph per audio element. UI never recreates the source. */
export class EqualizerEngine {
  constructor(audio) {
    this.audio = audio;
    this.context = null;
    this.filters = [];
  }
  initialize(values, enabled) {
    if (this.context) return this;
    const context = new AudioContext();
    this.context = context;
    this.filters = [60, 250, 1000, 4000, 12000].map((frequency, index) => {
      const filter = context.createBiquadFilter();
      filter.type = ["lowshelf", "peaking", "peaking", "peaking", "highshelf"][
        index
      ];
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      filter.gain.value = enabled ? values[index] : 0;
      return filter;
    });
    this.filters.reduce((a, b) => {
      a.connect(b);
      return b;
    });
    this.filters.at(-1).connect(context.destination);
    context.createMediaElementSource(this.audio).connect(this.filters[0]);
    if (context.state === "suspended") void context.resume();
    return this;
  }
}
