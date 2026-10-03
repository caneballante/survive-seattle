import type { GameEvents } from "./game/events";
import {
  PedestrianTuningStore,
  expectedAcceptancesPerTen,
  percentageTotal,
  type PedestrianTuning,
} from "./game/pedestrians";

export class PedestrianLab {
  private readonly element: HTMLElement;
  private status: HTMLElement;
  private open = false;
  private lastStatus = "Waiting for the first crowd roll…";

  constructor(
    private readonly root: HTMLElement,
    private readonly store: PedestrianTuningStore,
    events: GameEvents,
  ) {
    this.element = document.createElement("aside");
    this.element.className = "pedestrian-lab";
    this.element.setAttribute("aria-label", "Pedestrian testing table");
    this.root.append(this.element);
    this.status = document.createElement("div");

    this.root.querySelector<HTMLButtonElement>(".crowd-tuning-button")?.addEventListener("click", () => {
      this.setOpen(!this.open);
    });
    window.addEventListener("keydown", (event) => {
      if (event.key === "F3") {
        event.preventDefault();
        this.setOpen(!this.open);
      } else if (event.key === "Escape" && this.open) {
        event.stopImmediatePropagation();
        this.setOpen(false);
      }
    });
    events.on("crowdChanged", ({ label, target, active }) => {
      this.lastStatus = `${label} · target ${target} · ${active} currently on the block`;
      this.status.textContent = this.lastStatus;
    });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.element.classList.toggle("visible", open);
    if (open) this.render(this.store.snapshot());
    else this.element.replaceChildren();
  }

  private render(tuning: PedestrianTuning): void {
    this.element.innerHTML = `
      <div class="pedestrian-lab-heading">
        <div><small>LIVE BALANCE TOOL</small><strong>Pedestrian Lab</strong></div>
        <button type="button" data-lab="close" aria-label="Close pedestrian lab">×</button>
      </div>
      <p class="pedestrian-lab-intro">
        Starting target: make ten flyer attempts take roughly 2–4 minutes. Each interval rolls one density row, then chooses a random population inside its range. Weights are relative; they do not have to total 100.
      </p>
      <div class="pedestrian-lab-status" aria-live="polite"></div>
      <form>
        <fieldset class="pedestrian-lab-scalars">
          <legend>Timing and movement</legend>
          ${this.numberField("Crowd roll (sec)", "crowdIntervalSeconds", tuning.crowdIntervalSeconds, 10, 300, 1)}
          ${this.numberField("Inside store (sec)", "storeVisitSeconds", tuning.storeVisitSeconds, 2, 45, 0.5)}
          ${this.numberField("Conversation (sec)", "conversationSeconds", tuning.conversationSeconds, 2, 30, 0.5)}
          ${this.numberField("Walking speed", "walkSpeed", tuning.walkSpeed, 0.45, 3, 0.05)}
          ${this.numberField("Running multiplier", "runMultiplier", tuning.runMultiplier, 1.15, 4, 0.05)}
          ${this.numberField("Flyer awareness", "awarenessRadius", tuning.awarenessRadius, 1.5, 10, 0.1)}
        </fieldset>

        <fieldset>
          <legend>Crowd density spread <output data-total="crowd">${percentageTotal(tuning.crowdBands)} weight</output></legend>
          <table>
            <thead><tr><th>Street condition</th><th>Weight</th><th>Min</th><th>Max</th></tr></thead>
            <tbody>
              ${tuning.crowdBands.map((row) => `
                <tr><th>${row.label}</th>
                  <td><input type="number" name="crowd.${row.id}.weight" value="${row.weight}" min="0" max="100" step="1"></td>
                  <td><input type="number" name="crowd.${row.id}.min" value="${row.minPeople}" min="0" max="24" step="1"></td>
                  <td><input type="number" name="crowd.${row.id}.max" value="${row.maxPeople}" min="0" max="24" step="1"></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </fieldset>

        <fieldset>
          <legend>Flyer dispositions <output data-total="disposition">${percentageTotal(tuning.dispositions)} weight · ~${expectedAcceptancesPerTen(tuning.dispositions).toFixed(1)} accepts / 10</output></legend>
          <table>
            <thead><tr><th>Reaction</th><th>Weight</th><th>Accept %</th></tr></thead>
            <tbody>
              ${tuning.dispositions.map((row) => `
                <tr><th>${row.label}</th>
                  <td><input type="number" name="disposition.${row.id}.weight" value="${row.weight}" min="0" max="100" step="1"></td>
                  <td><input type="number" name="disposition.${row.id}.acceptance" value="${row.acceptancePercent}" min="0" max="100" step="1"></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </fieldset>

        <fieldset>
          <legend>Ambient reasons for walking <output data-total="goal">${percentageTotal(tuning.goals)} weight</output></legend>
          <table>
            <thead><tr><th>Goal</th><th>Weight</th></tr></thead>
            <tbody>
              ${tuning.goals.map((row) => `
                <tr><th>${row.label}</th>
                  <td><input type="number" name="goal.${row.id}.weight" value="${row.weight}" min="0" max="100" step="1"></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </fieldset>

        <div class="pedestrian-lab-actions">
          <button type="submit">Apply & reroll crowd</button>
          <button type="button" data-lab="reset">Restore defaults</button>
        </div>
      </form>
      <small class="pedestrian-lab-hint">F3 toggles this table. Settings persist in this browser.</small>
    `;
    this.status = this.element.querySelector(".pedestrian-lab-status") as HTMLElement;
    this.status.textContent = this.lastStatus;
    this.bindForm(tuning);
  }

  private numberField(
    label: string,
    name: keyof Pick<PedestrianTuning, "crowdIntervalSeconds" | "storeVisitSeconds" | "conversationSeconds" | "walkSpeed" | "runMultiplier" | "awarenessRadius">,
    value: number,
    min: number,
    max: number,
    step: number,
  ): string {
    return `<label><span>${label}</span><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
  }

  private bindForm(tuning: PedestrianTuning): void {
    this.element.querySelector<HTMLButtonElement>("[data-lab='close']")?.addEventListener("click", () => this.setOpen(false));
    this.element.querySelector<HTMLButtonElement>("[data-lab='reset']")?.addEventListener("click", () => {
      this.store.reset();
      this.render(this.store.snapshot());
    });
    const form = this.element.querySelector<HTMLFormElement>("form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const read = (name: string, fallback: number): number => Number(data.get(name) ?? fallback);
      const next: PedestrianTuning = {
        crowdIntervalSeconds: read("crowdIntervalSeconds", tuning.crowdIntervalSeconds),
        storeVisitSeconds: read("storeVisitSeconds", tuning.storeVisitSeconds),
        conversationSeconds: read("conversationSeconds", tuning.conversationSeconds),
        walkSpeed: read("walkSpeed", tuning.walkSpeed),
        runMultiplier: read("runMultiplier", tuning.runMultiplier),
        awarenessRadius: read("awarenessRadius", tuning.awarenessRadius),
        crowdBands: tuning.crowdBands.map((row) => ({
          ...row,
          weight: read(`crowd.${row.id}.weight`, row.weight),
          minPeople: read(`crowd.${row.id}.min`, row.minPeople),
          maxPeople: read(`crowd.${row.id}.max`, row.maxPeople),
        })),
        dispositions: tuning.dispositions.map((row) => ({
          ...row,
          weight: read(`disposition.${row.id}.weight`, row.weight),
          acceptancePercent: read(`disposition.${row.id}.acceptance`, row.acceptancePercent),
        })),
        goals: tuning.goals.map((row) => ({
          ...row,
          weight: read(`goal.${row.id}.weight`, row.weight),
        })),
      };
      this.store.replace(next);
      this.render(this.store.snapshot());
      this.status.textContent = "Applied. The director is rerolling the block now.";
    });
  }
}
