import { AudioManager } from "./audio";
import type { SeattleScene } from "./game/SeattleScene";
import { DebugPanel } from "./debugPanel";
import { GameEvents } from "./game/events";
import { INTERACTION_BY_ID } from "./game/interactions";
import { LOCATION_BY_ID } from "./game/locations";
import { GameState, AVAILABLE_JOB, formatTime } from "./game/state";
import { STREET_ENCOUNTER_BY_ID } from "./game/streetEncounters";
import type { ActionResult, GameSnapshot, LocationId, Opportunity } from "./game/types";
import { weatherLabel } from "./game/weather";

const COFFEE_CHOICES = [
  "Rain-Adjusted Americano",
  "Ethically Conflicted Oat Latte",
  "Single-Origin Cascadia Fog",
  "Twelve-Dollar Drip, No Eye Contact",
];

interface MenuChoice {
  label: string;
  action?: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  reason?: string;
}

export class GameUI {
  private readonly root: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly modal: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly cue: HTMLElement;
  private readonly menuPanel: HTMLElement;
  private readonly touchControls: HTMLElement;
  private scene: SeattleScene | null = null;
  private modalOpen = true;
  private toastTimer = 0;

  constructor(
    mount: HTMLElement,
    private readonly state: GameState,
    private readonly events: GameEvents,
    private readonly audio: AudioManager,
  ) {
    mount.innerHTML = `
      <section class="game-frame" aria-label="Survive Seattle">
        <div id="game-canvas" aria-label="A side-scrolling Seattle street"></div>
        <div class="rain-vignette" aria-hidden="true"></div>
        <header class="hud" aria-label="Player statistics"></header>
        <div class="opportunity-cue" aria-live="polite"></div>
        <div class="interaction-prompt" aria-live="polite"></div>
        <div class="toast" role="status" aria-live="polite"></div>
        <nav class="game-tools" aria-label="Game controls">
          <button class="icon-button mute-button" type="button" aria-pressed="false">Sound: on</button>
          <button class="icon-button reset-button" type="button">Reset game</button>
        </nav>
        <div class="touch-controls" aria-label="Touch controls">
          <div class="move-controls">
            <button class="touch-button" data-direction="-1" type="button" aria-label="Walk left">◀</button>
            <button class="touch-button" data-direction="1" type="button" aria-label="Walk right">▶</button>
          </div>
          <div class="action-controls">
            <button class="touch-button sprint-button" type="button">RUN</button>
            <button class="touch-button interact-button" type="button">INTERACT</button>
          </div>
        </div>
        <div class="modal-backdrop" role="presentation" aria-hidden="false">
          <section class="menu-panel" role="dialog" aria-modal="true" aria-labelledby="menu-title"></section>
        </div>
        <div class="portrait-message">
          <div aria-hidden="true" class="phone-icon">↻</div>
          <strong>Seattle is wider this way.</strong>
          <span>Please rotate your phone to landscape to keep exploring.</span>
        </div>
      </section>
    `;
    this.root = mount.querySelector(".game-frame") as HTMLElement;
    this.hud = mount.querySelector(".hud") as HTMLElement;
    this.prompt = mount.querySelector(".interaction-prompt") as HTMLElement;
    this.modal = mount.querySelector(".modal-backdrop") as HTMLElement;
    this.menuPanel = mount.querySelector(".menu-panel") as HTMLElement;
    this.toast = mount.querySelector(".toast") as HTMLElement;
    this.cue = mount.querySelector(".opportunity-cue") as HTMLElement;
    this.touchControls = mount.querySelector(".touch-controls") as HTMLElement;

    this.bindControls();
    this.bindEvents();
    this.state.subscribe((snapshot) => this.renderHUD(snapshot));
    new DebugPanel(this.root, this.state);
  }

  attachScene(scene: SeattleScene): void {
    this.scene = scene;
    scene.setMenuOpen(true);
    this.showIntro();
  }

  private bindEvents(): void {
    this.events.on("focus", ({ locationId, label }) => {
      this.prompt.textContent = label;
      this.prompt.classList.toggle("visible", locationId !== null);
    });
    this.events.on("interact", ({ locationId }) => {
      this.audio.play("ui-click");
      this.openLocation(locationId);
    });
    this.events.on("streetEncounter", ({ actorId, encounterId }) => {
      this.audio.play("notice");
      this.openStreetEncounter(actorId, encounterId);
    });
    this.events.on("cue", ({ opportunity, direction }) => {
      if (!opportunity || !direction || direction === "visible") {
        this.cue.classList.remove("visible", "left", "right");
        this.cue.innerHTML = opportunity
          ? `<span class="cue-dot" aria-hidden="true">◆</span><span>${opportunity.title}</span>`
          : "";
        return;
      }
      this.cue.className = `opportunity-cue visible ${direction}`;
      this.cue.innerHTML = `
        <span class="cue-arrow" aria-hidden="true">${direction === "left" ? "←" : "→"}</span>
        <span>${opportunity.title}</span>
      `;
    });
  }

  private bindControls(): void {
    const stopWalking = (): void => this.scene?.setTouchDirection(0);
    this.touchControls.querySelectorAll<HTMLButtonElement>("[data-direction]").forEach((button) => {
      const direction = Number(button.dataset.direction);
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.scene?.nudgePlayer(direction);
        this.scene?.setTouchDirection(direction);
      });
      button.addEventListener("pointerup", stopWalking);
      button.addEventListener("pointercancel", stopWalking);
      button.addEventListener("lostpointercapture", stopWalking);
    });
    this.touchControls
      .querySelector<HTMLButtonElement>(".interact-button")
      ?.addEventListener("click", () => this.scene?.triggerInteraction());
    const sprintButton =
      this.touchControls.querySelector<HTMLButtonElement>(".sprint-button");
    const stopSprinting = (): void => this.scene?.setTouchSprinting(false);
    sprintButton?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      sprintButton.setPointerCapture(event.pointerId);
      this.scene?.setTouchSprinting(true);
    });
    sprintButton?.addEventListener("pointerup", stopSprinting);
    sprintButton?.addEventListener("pointercancel", stopSprinting);
    sprintButton?.addEventListener("lostpointercapture", stopSprinting);

    this.root.querySelector<HTMLButtonElement>(".mute-button")?.addEventListener("click", (event) => {
      const muted = this.audio.toggleMuted();
      const button = event.currentTarget as HTMLButtonElement;
      button.textContent = muted ? "Sound: off" : "Sound: on";
      button.setAttribute("aria-pressed", String(muted));
      if (!muted) this.audio.play("ui-click");
    });

    this.root.querySelector<HTMLButtonElement>(".reset-button")?.addEventListener("click", () => {
      this.audio.play("ui-click");
      this.showMenu(
        "Reset your Seattle life?",
        "This returns you to Day 1 with twenty dollars and the original level of misplaced confidence.",
        [
          {
            label: "Reset game",
            kind: "primary",
            action: () => {
              this.state.reset();
              this.scene?.returnHome();
              this.closeMenu();
              this.showToast("Day 1 begins again. The weather barely noticed.");
            },
          },
          { label: "Keep going", kind: "secondary", action: () => this.closeMenu() },
        ],
      );
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.modalOpen) this.closeMenu();
    });
  }

  private renderHUD(snapshot: Readonly<GameSnapshot>): void {
    this.hud.innerHTML = `
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">☂</span>
        <span>SURVIVE <b>SEATTLE</b></span>
      </div>
      <div class="day-clock">
        <span>${snapshot.season.toUpperCase()} · Y${snapshot.year} · D${snapshot.day} · ${weatherLabel(snapshot.weather).toUpperCase()}</span>
        <strong>${formatTime(snapshot.minutes)}</strong>
      </div>
      <div class="stats">
        <span><small>MONEY</small><strong>$${snapshot.stats.money}</strong></span>
        <span><small>STATUS</small><strong>${snapshot.stats.socialStatus}</strong></span>
        <span><small>HAPPINESS</small><strong>${snapshot.stats.happiness}</strong></span>
        <span class="energy-stat">
          <small>ENERGY</small><strong>${snapshot.energy}</strong>
          <i aria-hidden="true"><b style="width: ${snapshot.energy}%"></b></i>
        </span>
      </div>
      ${
        snapshot.cityTrend
          ? `<div class="city-trend"><small>CITYWIDE TREND</small><strong>${snapshot.cityTrend}</strong></div>`
          : ""
      }
    `;
  }

  private showIntro(): void {
    this.showMenu(
      "Day 1",
      "You have one tiny apartment, twenty dollars, and an unreasonable belief that Seattle might work out.",
      [
        {
          label: "Find coffee. Find work. Make it home.",
          kind: "primary",
          action: () => {
            this.closeMenu();
            this.showToast(
              "New opportunities: Find coffee · Find work. Hold Shift to run.",
              5200,
            );
          },
        },
      ],
      "Welcome to Seattle",
    );
  }

  private openLocation(locationId: LocationId): void {
    if (this.modalOpen) return;
    if (locationId === "coffee") return this.openCoffee();
    if (locationId === "job-board") return this.openJobBoard();
    if (locationId === "workplace") return this.openWorkplace();
    if (locationId === "apartment") return this.openApartment();
    return this.openDataLocation(locationId);
  }

  private openStreetEncounter(actorId: string, encounterId: string): void {
    if (this.modalOpen) return;
    const encounter = STREET_ENCOUNTER_BY_ID[encounterId];
    if (!encounter) return;
    const choices: MenuChoice[] = encounter.choices.map((choice) => {
      const availability = this.state.getStreetEncounterChoiceAvailability(
        encounterId,
        choice.id,
      );
      return {
        label: choice.label,
        disabled: !availability.allowed,
        reason: availability.allowed
          ? choice.description
          : availability.reasons.join(" "),
        action: () => {
          const result = this.state.resolveStreetEncounter(encounterId, choice.id);
          if (result.ok) this.scene?.completeStreetEncounter(actorId);
          this.handleResult(result);
        },
      };
    });
    this.showMenu(
      encounter.name,
      encounter.description,
      choices,
      encounter.eyebrow,
    );
  }

  private openCoffee(): void {
    if (this.state.snapshot().daily.coffeeOrdered) {
      this.showMenu(
        "Drizzle & Steam",
        "The employee recognizes you. This is either community or a warning sign.",
        [{ label: "Back outside", action: () => this.closeMenu() }],
      );
      return;
    }
    this.showMenu(
      "What can I start for you?",
      this.state.snapshot().cityTrend === "Mandatory Authenticity"
        ? "Mandatory Authenticity certification is in effect. Coffee currently produces an additional Status point."
        : "All elaborate drinks have identical consequences. This is what experts call balance.",
      [
        ...COFFEE_CHOICES.map((label) => ({
          label: `${label} · $5 · 15 min`,
          action: () => this.handleResult(this.state.orderCoffee()),
        })),
        this.interactionChoice("coffee-recover"),
        { label: "Leave before committing", kind: "secondary" as const, action: () => this.closeMenu() },
      ],
      "Drizzle & Steam",
    );
  }

  private openJobBoard(): void {
    const snapshot = this.state.snapshot();
    if (snapshot.job) {
      this.showMenu(
        "Neighborhood Job Board",
        `Position filled by you: ${snapshot.job.title} at ${snapshot.job.employer}.`,
        [{ label: "Leave", action: () => this.closeMenu() }],
      );
      return;
    }
    this.showMenu(
      AVAILABLE_JOB.title,
      `${AVAILABLE_JOB.employer}\n\n${AVAILABLE_JOB.description}`,
      [
        { label: "Accept job", kind: "primary", action: () => this.handleResult(this.state.acceptJob()) },
        { label: "Leave", kind: "secondary", action: () => this.closeMenu() },
      ],
      "One exciting opportunity",
    );
  }

  private openWorkplace(): void {
    const snapshot = this.state.snapshot();
    if (!snapshot.job) {
      this.showMenu(
        "Cascadia Solutions",
        "The lobby has identified you as a person who does not work here yet. Try the job board.",
        [{ label: "Politely back away", action: () => this.closeMenu() }],
      );
      return;
    }
    if (snapshot.daily.workCompleted) {
      this.showMenu(
        "Cascadia Solutions",
        "Your workday is already complete. No one noticed you hovering near the badge reader.",
        [{ label: "Go home", action: () => this.closeMenu() }],
      );
      return;
    }
    this.showMenu(
      "Cascadia Solutions",
      "Your first shift awaits. Your inbox already contains 14 messages.",
      [
        { label: "Put in my 8 hours", kind: "primary", action: () => this.handleResult(this.state.workShift()) },
        { label: "Not yet", kind: "secondary", action: () => this.closeMenu() },
      ],
    );
  }

  private openApartment(): void {
    const snapshot = this.state.snapshot();
    const body = snapshot.daily.workCompleted
      ? "Your tiny apartment has never looked so rectangular. It is getting late."
      : "Home is available whenever Seattle becomes too Seattle.";
    this.showMenu("Tiny Apartment", body, [
      {
        label: "Go to sleep",
        kind: "primary",
        action: () => {
          const result = this.state.sleep();
          this.scene?.returnHome();
          this.showDaySummary(result.message);
        },
      },
      this.interactionChoice("stay-home"),
      { label: "Stay outside", kind: "secondary", action: () => this.closeMenu() },
    ]);
  }

  private openDataLocation(locationId: LocationId): void {
    this.state.visitLocation(locationId);
    const location = LOCATION_BY_ID[locationId];
    const interactions = this.state.getVisibleInteractions(locationId);
    let description = location.description;
    const snapshot = this.state.snapshot();

    if (locationId === "art-store" && snapshot.stats.socialStatus < 3) {
      description =
        "You are not currently cool enough to enter with confidence. Requires Social Status 3.";
    }
    if (locationId === "transit" && snapshot.worldStage === 0) {
      description =
        "The route map is illuminated, but none of its promises are operational yet. Complete Day 1.";
    }
    if (
      snapshot.cityTrend === "Mandatory Authenticity" &&
      locationId === "convenience"
    ) {
      description =
        "All packaging is now locally authenticated. Cheap meals cost $2 more during the trend.";
    }
    if (
      snapshot.cityTrend === "Mandatory Authenticity" &&
      locationId === "bar"
    ) {
      description =
        "The Crooked Salmon now requires every anecdote to disclose its emotional supply chain.";
    }

    const choices: MenuChoice[] = interactions.map((interaction) =>
      this.interactionChoice(interaction.id),
    );
    choices.push({
      label: "Back to the street",
      kind: "secondary",
      action: () => this.closeMenu(),
    });
    this.showMenu(
      location.name,
      description,
      choices,
      `Tier ${location.rarity} · ${this.rarityLabel(location.rarity)}`,
    );
  }

  private interactionChoice(interactionId: string): MenuChoice {
    const interaction = INTERACTION_BY_ID[interactionId];
    const availability = this.state.getInteractionAvailability(interactionId);
    const costParts: string[] = [];
    if (interaction.costs?.money) costParts.push(`$${interaction.costs.money}`);
    if (interaction.costs?.minutes) {
      const hours = interaction.costs.minutes / 60;
      costParts.push(hours >= 1 ? `${hours} hr` : `${interaction.costs.minutes} min`);
    }
    return {
      label: `${interaction.displayName}${costParts.length ? ` · ${costParts.join(" · ")}` : ""}`,
      disabled: !availability.allowed,
      reason: availability.reasons.join(" "),
      action: () => this.handleResult(this.state.performInteraction(interactionId)),
    };
  }

  private rarityLabel(rarity: number): string {
    return ["", "Everyday", "Neighborhood", "Citywide", "Prestigious", "Exceptional"][
      rarity
    ];
  }

  private handleResult(result: ActionResult): void {
    this.audio.play(result.ok ? "success" : "error");
    this.closeMenu();
    this.showToast(result.message, 5200);
    this.announceOpportunities(result.activated);
  }

  private announceOpportunities(opportunities: Opportunity[]): void {
    if (opportunities.length === 0) return;
    const mostImportant = [...opportunities].sort((a, b) => b.priority - a.priority)[0];
    window.setTimeout(() => {
      this.audio.play("notice");
      this.showToast(`New opportunity: ${mostImportant.title}. ${mostImportant.description ?? ""}`, 4600);
    }, 900);
  }

  private showDaySummary(summary: string): void {
    const snapshot = this.state.snapshot();
    const expanded = snapshot.worldStage >= 1;
    this.showMenu(
      expanded ? "The city notices you" : "Day complete",
      `${summary}\n\n${
        expanded
          ? "The whole street was always there. After one survived day, a few of its previously aspirational possibilities begin to feel slightly less theoretical."
          : `Tomorrow begins in ${snapshot.season}.`
      }`,
      [
        {
          label: expanded ? "Begin Day 2 · Revisit the street" : "Begin next day",
          kind: "primary",
          action: () => {
            this.closeMenu();
            this.showToast(
              expanded
                ? `New opportunity: See More of the Neighborhood. Today's forecast: ${weatherLabel(snapshot.weather)}.`
                : `A new day begins at 8:00 AM. Today's forecast: ${weatherLabel(snapshot.weather)}.`,
              5200,
            );
          },
        },
        {
          label: "Restart prototype",
          kind: "secondary",
          action: () => {
            this.state.reset();
            this.scene?.returnHome();
            this.closeMenu();
            this.showIntro();
          },
        },
      ],
      expanded ? "First day survived" : `${snapshot.season} · Year ${snapshot.year}`,
    );
  }

  private showMenu(title: string, body: string, choices: MenuChoice[], eyebrow?: string): void {
    this.audio.play("menu-open");
    this.modalOpen = true;
    this.scene?.setMenuOpen(true);
    this.modal.classList.add("visible");
    this.modal.setAttribute("aria-hidden", "false");
    this.menuPanel.innerHTML = `
      ${eyebrow ? `<div class="menu-eyebrow">${eyebrow}</div>` : ""}
      <h1 id="menu-title">${title}</h1>
      <p>${body.replaceAll("\n", "<br>")}</p>
      <div class="menu-choices"></div>
      <div class="key-hint">ESC to close</div>
    `;
    const choicesRoot = this.menuPanel.querySelector(".menu-choices") as HTMLElement;
    choices.forEach((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `menu-choice ${choice.kind ?? ""}`;
      button.disabled = choice.disabled ?? false;
      button.innerHTML = `<span>${choice.label}</span>${
        choice.reason ? `<small>${choice.reason}</small>` : ""
      }`;
      button.addEventListener(
        "click",
        () => {
          if (choice.disabled) return;
          this.audio.play("ui-click");
          button.disabled = true;
          choice.action?.();
        },
        { once: true },
      );
      choicesRoot.append(button);
    });
    window.setTimeout(() => choicesRoot.querySelector<HTMLButtonElement>("button")?.focus(), 0);
  }

  private closeMenu(): void {
    this.modalOpen = false;
    this.modal.classList.remove("visible");
    this.modal.setAttribute("aria-hidden", "true");
    this.scene?.setMenuOpen(false);
  }

  private showToast(message: string, duration = 3600): void {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.add("visible");
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove("visible"), duration);
  }
}
