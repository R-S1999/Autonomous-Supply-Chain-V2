// Lightweight frame player shared by Simulate and Act.
export class TimelinePlayer {
  constructor(frames, onFrame, { msPerTick = 380 } = {}) {
    this.frames = frames; this.onFrame = onFrame; this.msPerTick = msPerTick;
    this.i = 0; this.timer = null; this.playing = false;
  }
  play() {
    if (this.playing) return;
    this.playing = true; this.onFrame(this.frames[this.i], this.i);
    this.timer = setInterval(() => this.step(), this.msPerTick);
  }
  step() {
    if (this.i >= this.frames.length - 1) return this.pause();
    this.i += 1; this.onFrame(this.frames[this.i], this.i);
  }
  pause() { this.playing = false; if (this.timer) clearInterval(this.timer); this.timer = null; }
  restart() { this.pause(); this.i = 0; this.play(); }
  seek(i) { this.i = Math.max(0, Math.min(this.frames.length - 1, i)); this.onFrame(this.frames[this.i], this.i); }
  destroy() { this.pause(); }
}
