import { GameState, formatTime } from "./game/state";
import type { GameSnapshot } from "./game/types";

export class DebugPanel {
  private readonly element: HTMLElement;
  private open = false;

  constructor(root: HTMLElement, private readonly state: GameState) {
    const element = document.createElement("aside");
    element.className = "debug-panel";
    element.setAttribute("aria-label", "Development controls");
    root.append(element);
    this.element = element;

    this.bindKeyboard();
    this.state.subscribe((snapshot) => this.render(snapshot));
    if (new URLSearchParams(window.location.search).has("debug")) this.setOpen(true);
  }

  private bindKeyboard(): void {
    window.addEventListener("keydown", (event) => {
      if (event.key === "F2" || event.key === "`") {
        event.preventDefault();
        this.setOpen(!this.open);
      }
    });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.element.classList.toggle("visible", open);
    this.render(this.state.snapshot());
  }

  private render(snapshot: Readonly<GameSnapshot>): void {
    if (!this.open) {
      this.element.innerHTML = "";
      return;
    }
    const opportunities = this.state.opportunities
      .active()
      .map((item) => item.title)
      .join(", ") || "none";
    const cooldowns =
      Object.entries(snapshot.eventCooldowns)
        .map(([id, day]) => `${id}: day ${day}`)
        .join("\n") || "none";
    const events = this.state
      .getEventDefinitions()
      .map((event) => `<option value="${event.id}">${event.name}</option>`)
      .join("");

    this.element.innerHTML = `
      <div class="debug-heading">
        <strong>SEATTLE DEV DESK</strong>
        <button type="button" data-debug="close" aria-label="Close debug controls">x</button>
      </div>
      <div class="debug-summary">
        ${snapshot.season} · Year ${snapshot.year} · Day ${snapshot.day} · ${formatTime(snapshot.minutes)}
        <br>Stage ${snapshot.worldStage} · Rent $${snapshot.rent} · ${snapshot.weather} · Energy ${snapshot.energy}
      </div>
      <div class="debug-grid">
        <button type="button" data-stat="money" data-amount="100">Money +100</button>
        <button type="button" data-stat="money" data-amount="-20">Money -20</button>
        <button type="button" data-stat="socialStatus" data-amount="3">Status +3</button>
        <button type="button" data-stat="socialStatus" data-amount="-1">Status -1</button>
        <button type="button" data-stat="happiness" data-amount="3">Happy +3</button>
        <button type="button" data-stat="happiness" data-amount="-1">Happy -1</button>
        <button type="button" data-energy="25">Energy +25</button>
        <button type="button" data-energy="-25">Energy -25</button>
        <button type="button" data-time="480">Set 8 AM</button>
        <button type="button" data-time="1080">Set 6 PM</button>
        <button type="button" data-time="1200">Set 8 PM</button>
        <button type="button" data-debug="day">Advance day</button>
        <button type="button" data-debug="season">Advance season</button>
        <button type="button" data-debug="year">Advance year</button>
        <button type="button" data-stage="1">Unlock stage 1</button>
        <button type="button" data-stage="2">Unlock stage 2</button>
        <button type="button" data-item="guitar">Add guitar</button>
        <button type="button" data-item="sketchbook">Add sketchbook</button>
        <button type="button" data-debug="clear">Clear local save</button>
      </div>
      <label class="debug-event-label">
        Event
        <select class="debug-event-select">${events}</select>
      </label>
      <div class="debug-event-buttons">
        <button type="button" data-debug="event">Trigger selected</button>
        <button type="button" data-debug="tailored">Trigger tailored</button>
      </div>
      <details open>
        <summary>Live state</summary>
        <pre>Opportunities: ${opportunities}
Items: ${snapshot.inventory.join(", ") || "none"}
Active events: ${snapshot.activeEvents.join(", ") || "none"}
Cooldowns:
${cooldowns}</pre>
      </details>
      <small>F2 or \` toggles this panel.</small>
    `;
    this.bindButtons();
  }

  private bindButtons(): void {
    this.element.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.stat && button.dataset.amount) {
          this.state.updateStat(
            button.dataset.stat as "money" | "socialStatus" | "happiness",
            Number(button.dataset.amount),
          );
        } else if (button.dataset.energy) {
          this.state.updateEnergy(Number(button.dataset.energy));
        } else if (button.dataset.time) {
          this.state.debugSetTime(Number(button.dataset.time));
        } else if (button.dataset.stage) {
          this.state.unlockWorldStage(Number(button.dataset.stage));
        } else if (button.dataset.item) {
          this.state.debugAddItem(button.dataset.item);
        } else {
          this.runAction(button.dataset.debug ?? "");
        }
      });
    });
  }

  private runAction(action: string): void {
    if (action === "close") return this.setOpen(false);
    if (action === "day") this.state.debugAdvanceDay();
    if (action === "season") this.state.debugAdvanceSeason();
    if (action === "year") this.state.debugAdvanceYear();
    if (action === "clear") {
      window.localStorage.removeItem("survive-seattle-save");
      this.state.reset();
    }
    if (action === "event") {
      const id = this.element.querySelector<HTMLSelectElement>(".debug-event-select")?.value;
      if (id) this.state.triggerEvent(id, true);
    }
    if (action === "tailored") this.state.triggerTailoredEvent();
  }
}
