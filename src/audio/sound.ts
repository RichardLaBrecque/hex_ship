import type { Point } from "../hex/hex";
import { browserStore, type Store } from "../save/store";

// Sound effects synthesized with WebAudio, so there are no audio files to load or host.
// Browsers only allow audio after the player presses a key or clicks; until then every sound is silent.
export const MUTE_KEY = "hex-ship/muted";

const MASTER_VOLUME = 0.5;
const HEARING_RANGE = 450; // pixels from the player at which a sound is at half volume
const MIN_GAP = 0.04; // seconds between two plays of the same sound, so a volley doesn't stack into a roar

// How loud a sound is at `distance` pixels from the listener: 1 up close, falling away smoothly.
export const loudness = (distance: number, range: number = HEARING_RANGE): number => 1 / (1 + (distance / range) ** 2);

export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private thrustGain: GainNode | null = null;
  private lastPlayed = new Map<string, number>();
  private listener: Point = { x: 0, y: 0 };
  private muted: boolean;

  constructor(private store: Store = browserStore()) {
    this.muted = store.get(MUTE_KEY) === "1";
  }

  // Call from a key or mouse event: browsers block audio that starts any other way.
  unlock(): void {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return;
    }
    const AudioCtor = window.AudioContext as typeof AudioContext | undefined;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(context.destination);
    this.noiseBuffer = whiteNoise(context);
    this.startThrustLoop(context, this.master, this.noiseBuffer);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.store.set(MUTE_KEY, this.muted ? "1" : "0");
    if (this.context && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.context.currentTime, 0.02);
  }

  // Sounds are quieter the further they are from here; the flight scene sets it to the player's ship.
  setListener(at: Point): void {
    this.listener = at;
  }

  laser(at: Point): void {
    if (!this.ready("laser")) return;
    this.tone("square", 1400, 320, 0.09, 0.12 * this.near(at));
  }

  cannon(at: Point): void {
    if (!this.ready("cannon")) return;
    const volume = this.near(at);
    this.tone("sine", 140, 50, 0.18, 0.35 * volume);
    this.noise("lowpass", 1800, 400, 0.12, 0.25 * volume);
  }

  missileLaunch(at: Point): void {
    if (!this.ready("missile")) return;
    this.noise("bandpass", 600, 2400, 0.45, 0.3 * this.near(at));
  }

  hullHit(at: Point): void {
    if (!this.ready("hullHit")) return;
    this.noise("highpass", 2500, 900, 0.07, 0.3 * this.near(at));
  }

  shieldHit(at: Point): void {
    if (!this.ready("shieldHit")) return;
    this.tone("sine", 900, 1300, 0.12, 0.12 * this.near(at));
  }

  intercept(at: Point): void {
    if (!this.ready("intercept")) return;
    const volume = this.near(at);
    this.tone("triangle", 1800, 2600, 0.06, 0.12 * volume);
    this.noise("highpass", 3000, 2000, 0.08, 0.2 * volume);
  }

  partDestroyed(at: Point): void {
    if (!this.ready("partDestroyed")) return;
    this.noise("lowpass", 1400, 120, 0.5, 0.45 * this.near(at));
  }

  shipDestroyed(at: Point): void {
    if (!this.ready("shipDestroyed")) return;
    const volume = this.near(at);
    this.noise("lowpass", 900, 60, 1.4, 0.7 * volume);
    this.tone("sine", 90, 30, 1.0, 0.5 * volume);
  }

  // Salvage picked up: a quick rising chirp.
  pickup(): void {
    if (!this.ready("pickup")) return;
    this.tone("triangle", 880, 1320, 0.12, 0.18);
  }

  // Docked: two rising notes.
  dock(): void {
    if (!this.ready("dock")) return;
    this.tone("sine", 660, 660, 0.18, 0.2);
    this.tone("sine", 990, 990, 0.3, 0.2, 0.14);
  }

  // The player's engine rumble, 0 (silent) to 1 (full thrust). Set it to 0 when leaving flight.
  thrust(level: number): void {
    if (!this.context || !this.thrustGain) return;
    this.thrustGain.gain.setTargetAtTime(0.18 * Math.max(0, level), this.context.currentTime, 0.08);
  }

  private near(at: Point): number {
    return loudness(Math.hypot(at.x - this.listener.x, at.y - this.listener.y));
  }

  // False while audio is locked or muted, or if this sound just played.
  private ready(name: string): boolean {
    if (!this.context || this.muted) return false;
    const now = this.context.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < MIN_GAP) return false;
    this.lastPlayed.set(name, now);
    return true;
  }

  // A pitch sweep from `from` to `to` Hz that fades out over `duration` seconds.
  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const { context, master } = this;
    if (!context || !master || volume < 0.005) return;
    const start = context.currentTime + delay;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = fadeOut(context, volume, start, duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration);
  }

  // Filtered noise whose filter sweeps from `from` to `to` Hz while it fades out over `duration` seconds.
  private noise(filterType: BiquadFilterType, from: number, to: number, duration: number, volume: number): void {
    const { context, master, noiseBuffer } = this;
    if (!context || !master || !noiseBuffer || volume < 0.005) return;
    const start = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    const gain = fadeOut(context, volume, start, duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration);
  }

  private startThrustLoop(context: AudioContext, master: GainNode, buffer: AudioBuffer): void {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    this.thrustGain = context.createGain();
    this.thrustGain.gain.value = 0;
    source.connect(filter).connect(this.thrustGain).connect(master);
    source.start();
  }
}

// One second of white noise, reused by every noise sound.
function whiteNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function fadeOut(context: AudioContext, volume: number, start: number, duration: number): GainNode {
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  return gain;
}
