import Game from './Game.js';
import { migrateStorage } from './gameObjects/storageMigration.js';

// async function getGameJS() {
//   let y = await fetch('./Game.js');
//   y = await y.json();
//   return y;
// }
// getGameJS().then(Game => {

window.onload = function() {
  migrateStorage();          // carry old base-command:* saves over to kalros:*
  var game = new Game();
  game.start();
}
