export type SoundEffect =
  | "ui-click"
  | "menu-open"
  | "notice"
  | "success"
  | "error"
  | "expansion"
  | "footstep";

export type PerformanceCue =
  | "beat"
  | "accent"
  | "perfect"
  | "good"
  | "miss"
  | "coin"
  | "flourish";

interface SoundEffectDefinition {
  files: string[];
  volume: number;
  playbackRate?: [number, number];
}

const audioUrl = (path: string): string => new URL(path, document.baseURI).href;
const AMBIENT_MUSIC_VOLUME = 0.16;
const PERFORMANCE_MUSIC_VOLUME = 0.3;

const EFFECTS: Record<SoundEffect, SoundEffectDefinition> = {
  "ui-click": {
    files: ["audio/sfx/ui-click.ogg"],
    volume: 0.32,
  },
  "menu-open": {
    files: ["audio/sfx/menu-open.ogg"],
    volume: 0.2,
  },
  notice: {
    files: ["audio/sfx/notice.ogg"],
    volume: 0.26,
  },
  success: {
    files: ["audio/sfx/success.ogg"],
    volume: 0.3,
  },
  error: {
    files: ["audio/sfx/error.ogg"],
    volume: 0.28,
  },
  expansion: {
    files: ["audio/sfx/expansion.ogg"],
    volume: 0.38,
  },
  footstep: {
    files: [
      "audio/sfx/footstep-concrete-1.ogg",
      "audio/sfx/footstep-concrete-2.ogg",
      "audio/sfx/footstep-concrete-3.ogg",
      "audio/sfx/footstep-concrete-4.ogg",
      "audio/sfx/footstep-concrete-5.ogg",
    ],
    volume: 0.12,
    playbackRate: [0.92, 1.06],
  },
};

export class AudioManager {
  private readonly music = new Audio(audioUrl("audio/music/holiznacc0-grunge.mp3"));
  private readonly effectSources = new Map<string, HTMLAudioElement>();
  private readonly playingEffects = new Set<HTMLAudioElement>();
  private activated = false;
  private muted = false;
  private sequence = 0;
  private resumeAfterVisibilityChange = false;
  private synthContext: AudioContext | null = null;

  constructor() {
    this.music.loop = true;
    this.music.preload = "auto";
    this.music.volume = AMBIENT_MUSIC_VOLUME;
    this.publishState("waiting");

    Object.values(EFFECTS).forEach(({ files }) => {
      files.forEach((file) => {
        const source = new Audio(audioUrl(file));
        source.preload = "auto";
        this.effectSources.set(file, source);
      });
    });

    window.addEventListener("pointerdown", this.activateFromGesture, {
      capture: true,
    });
    window.addEventListener("keydown", this.activateFromGesture, {
      capture: true,
    });
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.music.muted = muted;
    this.playingEffects.forEach((effect) => {
      effect.muted = muted;
    });

    if (muted) {
      this.music.pause();
      this.publishState("muted");
      return;
    }

    void this.startMusic();
  }

  play(effectId: SoundEffect): void {
    if (!this.activated || this.muted || document.hidden) return;

    const definition = EFFECTS[effectId];
    const file = definition.files[this.sequence % definition.files.length];
    this.sequence += 1;
    const source = this.effectSources.get(file);
    if (!source) return;

    const effect = source.cloneNode(true) as HTMLAudioElement;
    effect.volume = definition.volume;
    if (definition.playbackRate) {
      const [minimum, maximum] = definition.playbackRate;
      const variation = ((this.sequence * 37) % 101) / 100;
      effect.playbackRate = minimum + (maximum - minimum) * variation;
    }

    const release = (): void => {
      this.playingEffects.delete(effect);
    };
    effect.addEventListener("ended", release, { once: true });
    effect.addEventListener("error", release, { once: true });
    this.playingEffects.add(effect);
    void effect
      .play()
      .then(() => {
        document.documentElement.dataset.lastSound = effectId;
      })
      .catch(release);
  }

  playPerformanceCue(cue: PerformanceCue): void {
    if (!this.activated || this.muted || document.hidden) return;
    const context = this.getSynthContext();
    if (!context) return;
    if (context.state === "suspended") void context.resume();

    const tones: Record<PerformanceCue, Array<[number, number, number, OscillatorType, number?]>> = {
      beat: [[330, 0.035, 0.018, "sine"]],
      accent: [[110, 0.1, 0.04, "triangle", 82], [440, 0.045, 0.02, "square"]],
      perfect: [[523, 0.17, 0.035, "triangle"], [659, 0.2, 0.03, "triangle"], [784, 0.24, 0.025, "sine"]],
      good: [[392, 0.12, 0.026, "triangle"], [523, 0.15, 0.02, "sine"]],
      miss: [[180, 0.18, 0.035, "sawtooth", 105]],
      coin: [[880, 0.08, 0.028, "sine"], [1320, 0.12, 0.02, "sine"]],
      flourish: [[196, 0.28, 0.04, "sawtooth", 392], [392, 0.3, 0.025, "triangle", 784]],
    };
    tones[cue].forEach(([frequency, duration, volume, type, endFrequency], index) => {
      this.playTone(context, frequency, duration, volume, type, index * 0.018, endFrequency);
    });
  }

  beginPerformance(): void {
    this.music.volume = PERFORMANCE_MUSIC_VOLUME;
    try {
      this.music.currentTime = 0;
    } catch {
      // The file may still be loading; playback will begin at its earliest available frame.
    }
    void this.startMusic();
  }

  endPerformance(): void {
    this.music.volume = AMBIENT_MUSIC_VOLUME;
  }

  private readonly activateFromGesture = (): void => {
    if (this.activated) return;
    this.activated = true;
    this.getSynthContext();
    this.publishState("starting");
    void this.startMusic();
    window.removeEventListener("pointerdown", this.activateFromGesture, {
      capture: true,
    });
    window.removeEventListener("keydown", this.activateFromGesture, {
      capture: true,
    });
  };

  private async startMusic(): Promise<void> {
    if (!this.activated || this.muted || document.hidden || !this.music.paused) return;
    try {
      await this.music.play();
      this.publishState("playing");
    } catch {
      this.activated = false;
      this.publishState("blocked");
      window.addEventListener("pointerdown", this.activateFromGesture, {
        capture: true,
      });
      window.addEventListener("keydown", this.activateFromGesture, {
        capture: true,
      });
    }
  }

  private getSynthContext(): AudioContext | null {
    if (this.synthContext) return this.synthContext;
    try {
      this.synthContext = new AudioContext();
      return this.synthContext;
    } catch {
      return null;
    }
  }

  private playTone(
    context: AudioContext,
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay: number,
    endFrequency = frequency,
  ): void {
    const now = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.resumeAfterVisibilityChange = !this.music.paused;
      this.music.pause();
      this.publishState(this.muted ? "muted" : "paused");
      return;
    }
    if (this.resumeAfterVisibilityChange) void this.startMusic();
    this.resumeAfterVisibilityChange = false;
  };

  private publishState(state: "waiting" | "starting" | "playing" | "muted" | "paused" | "blocked"): void {
    document.documentElement.dataset.audioState = state;
  }
}
