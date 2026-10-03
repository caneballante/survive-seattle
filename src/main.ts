import "./styles.css";
import { AudioManager } from "./audio";
import { GameEvents } from "./game/events";
import { GameState } from "./game/state";
import { PedestrianTuningStore } from "./game/pedestrians";
import { GameUI } from "./ui";
import { ThreeWorld } from "./three/ThreeWorld";

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("Game mount not found.");

const state = new GameState();
const events = new GameEvents();
const audio = new AudioManager();
const pedestrianTuning = new PedestrianTuningStore(window.localStorage);
const ui = new GameUI(mount, state, events, audio, pedestrianTuning);

const useLegacy = new URLSearchParams(window.location.search).get("renderer") === "legacy";

if (useLegacy) {
  const [{ default: Phaser }, { GAME_HEIGHT, GAME_WIDTH }, { SeattleScene }] =
    await Promise.all([
      import("phaser"),
      import("./game/locations"),
      import("./game/SeattleScene"),
    ]);
  const scene = new SeattleScene(state, events, audio);
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-canvas",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#718d9e",
    pixelArt: true,
    antialias: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    scene,
    render: { roundPixels: true },
    input: { activePointers: 3 },
  });
  ui.attachScene(scene);
} else {
  const host = document.querySelector<HTMLElement>("#game-canvas");
  if (!host) throw new Error("3D game canvas host not found.");
  const world = new ThreeWorld(host, state, events, audio, pedestrianTuning);
  ui.attachScene(world);
}
