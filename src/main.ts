import Phaser from "phaser";
import "./styles.css";
import { AudioManager } from "./audio";
import { GAME_HEIGHT, GAME_WIDTH } from "./game/locations";
import { GameEvents } from "./game/events";
import { GameState } from "./game/state";
import { SeattleScene } from "./game/SeattleScene";
import { GameUI } from "./ui";

const mount = document.querySelector<HTMLElement>("#app");
if (!mount) throw new Error("Game mount not found.");

const state = new GameState();
const events = new GameEvents();
const audio = new AudioManager();
const ui = new GameUI(mount, state, events, audio);
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
  render: {
    roundPixels: true,
  },
  input: {
    activePointers: 3,
  },
});

ui.attachScene(scene);
