export type SoundEffect =
  | "ui-click"
  | "menu-open"
  | "notice"
  | "success"
  | "error"
  | "expansion"
  | "footstep";

interface SoundEffectDefinition {
  files: string[];
  volume: number;
  playbackRate?: [number, number];
}

const audioUrl = (path: string): string => new URL(path, document.baseURI).href;

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

  constructor() {
    this.music.loop = true;
    this.music.preload = "auto";
    this.music.volume = 0.16;
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

  private readonly activateFromGesture = (): void => {
    if (this.activated) return;
    this.activated = true;
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
