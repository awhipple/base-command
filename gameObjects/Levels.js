import Enemy from "./Enemy.js";
import Strafer from "./Strafer.js";
import Image from "../engine/gfx/Image.js";
import Item from "./Item.js";

export default class Levels {
  constructor(engine) {
    this.engine = engine;
    // Levels no longer drop gems OR money — gems come only from synthesis, and
    // money is out of the loop. The ONLY level reward is an HOURGLASS (which
    // boosts synth growth), so the game is an idle plant you speed up by playing.
    // `reward` is the hourglass tier; `chance:100` = always drops, and it's
    // repeatable (replay a level for more). Higher levels give bigger hourglasses.
    // The ramp is a ROUGH first pass; the last (purple) level is hard but
    // finishable with a near-maxed build (see its enemyHp note).
    this.list = [
      {
        // Beatable from a cold start: the no-gem basic shot does 1 dmg, so
        // 2-hp enemies die in 2 hits. Just a few, slow — something to do before
        // your first synthesized gem.
        enemies: 3,
        spawnRate: 1.6,
        enemyHp: 2,
        reward: "hourglass", chance: 100,
        key: "blue",              // one-time: 1st synth unlock (blue → synth machine)
      },
      {
        enemies: 8,
        spawnRate: 1.2,
        enemyHp: 8,
        reward: "hourglass2", chance: 100,
        key: "green",             // one-time: effect slot (green → equip slot)
      },
      {
        enemies: 10,
        spawnRate: 1.0,
        enemyHp: 10,              // lower than a grunt — the blink-dodge is the difficulty
        phaser: true,            // green enemies that ghost + slide aside each time they're hit
        enemyType: "green",
        reward: "hourglass3", chance: 100,
        key: "blue",              // one-time: 2nd synth
      },
      {
        enemies: 12,
        spawnRate: 0.9,
        enemyHp: 32,
        straferChance: 45,        // ~45% of spawns are fast diving Strafers
        straferHp: 30,            // just under a grunt (32): evasive, but AoE no longer one-shots them
        reward: "hourglass4", chance: 100,
        key: "green",             // one-time: 1st helper
      },
      {
        enemies: 12,              // eased 14→12: reds split into 2 whites each, so count is the real load — fewer reds = less swarm
        enemyType: "red",
        spawnRate: 0.9,           // eased 0.8→0.9 (match neighbors) so red grunts don't pile up
        enemyHp: 44,              // eased 48→44 (was 55): trim the split-wave's effective HP to soften the level-5 cliff
        reward: "hourglass5", chance: 100,
        key: "blue",              // one-time: 3rd (last) synth
      },
      {
        icon: engine.images.get("dragon-green"),
        enemies: 16,
        spawnRate: 0.9,
        enemyHp: 80,
        boss: "green",
        bossHp: 1000,
        reward: "hourglass6", chance: 100,
        key: "green",             // one-time: 2nd (last) helper
      },
      {
        icon: engine.images.get("dragon-purple"),
        enemies: 25,
        spawnRate: 0.75,
        // Final wave: a MIX of the three circle grunts (white / green / red).
        // Hard but finishable: ~tier 8-9 gems in EVERY slot (you + both helpers).
        // GREEN spawns as the blink-dodge phaser (its level-3 identity — ghosts +
        // slides aside on a non-lethal hit); RED splits into two half-HP whites on
        // death. The dodges + splits make a mixed wave bite harder than pure white
        // at equal HP, so enemyHp is dropped 150→100 to keep it beatable (≈3.3k
        // effective HP + green evasion ≈ the old all-white 150 wave).
        enemyMix: ["white", "green", "red"],
        enemyHp: 100,
        boss: "purple",
        bossHp: 5000,            // the end boss: big (5× the green boss) but not a 40s slog
        reward: "hourglass7", chance: 100,
      },
    ];

    // One-time KEY rewards (slot unlocks), keyed by 0-based level index. A level's
    // `key` (blue/green) drops exactly once; after that this flag is set so it never
    // shows or drops again. Persisted in the save (see Game._snapshot/_restoreSave).
    this.keysAwarded = {};

    this.selected = 1;
  }

  rollForReward() {
    var chance = (this.current.qty ?? 0) > 0 ? 100 : (this.current.chance ?? 0);
    if ( this.current.reward && Math.random() * 100 < chance) {
      var item = new Item(this.engine, this.current.reward);
      this.engine.globals.inventory.add(item);
      this.engine.trigger("displayReward", item);

      if ( (this.current.qty ?? 0) > 0 ) {
        this.current.qty--;
        if ( this.current.qty === 0 && !this.current.chance ) {
          delete this.current.reward;
        }
      }
    }

    // One-time slot-unlock KEY, separate from the repeatable energy cell. Granted
    // once per level then flagged off forever. Shown as a SECOND reward pop,
    // staggered so the two don't overlap on-screen.
    if ( this.current.key && !this.keysAwarded[this._selected] ) {
      this.keysAwarded[this._selected] = true;
      var keyItem = this.engine.globals.inventory.add(this.current.key === "blue" ? "blueKey" : "greenKey");
      var eng = this.engine;
      // A KEY is a one-time slot-unlock, not the repeatable energy cell — give it
      // a LOUDER pop so it doesn't read as "just a second gem": bigger icon, a
      // punch-in, key-coloured pulse rings, a longer dwell, and a "NEW KEY!"
      // caption. Its own chime (850ms after the victory chime) flags the bonus.
      var ringColor = this.current.key === "blue" ? "#5b93ff" : "#3fe389";
      setTimeout(() => {
        eng.sounds.play("chime", { volume: 0.6 });
        eng.trigger("displayReward", keyItem, {
          caption: "NEW KEY!",
          ringColor,
          scale: 1.45,
          time: 1.9,
          slideAt: 0.75,
          popIn: true,
        });
      }, 850);
      this.engine.trigger("saveRequested");
    }
  }

  // Dev cheat (Unlock all): flag EVERY level's key as already awarded so keys stop
  // dropping and stop showing in the reward strip. Pairs with Inventory.unlockAll.
  disableKeyRewards() {
    for ( var i = 0; i < this.list.length; i++ ) this.keysAwarded[i] = true;
    this.engine.trigger("saveRequested");
  }

  get selectedReward() {
    if ( this.current.reward ) {
      if( !this.current.rewardIcon ) {
        this.current.rewardIcon = (new Item(this.engine, this.current.reward)).icon;
      }
    } else {
      this.current.rewardIcon = null;
    }
    return this.current.rewardIcon;
  }

  // The unearned KEY for the selected level (an Item), or null once it's been
  // awarded / the level has no key. Drawn beside the energy-cell reward by the
  // level-select. Cached per key name.
  get selectedKeyReward() {
    if ( !this.current.key || this.keysAwarded[this._selected] ) return null;
    var name = this.current.key === "blue" ? "blueKey" : "greenKey";
    if ( !this._keyItem || this._keyItem.name !== name ) {
      this._keyItem = new Item(this.engine, name);
    }
    return this._keyItem;
  }

  get selected() {
    return this._selected + 1;
  }

  set selected(val) {
    val = val - 1;
    if ( val >= 0 && val <= this.list.length - 1 ) {
      var changed = this._selected !== val;
      this._selected = val;
      this.current = this.list[val];
      // Persist the choice so a reload reopens on the same level. (No-op during
      // construction/restore — the autosave listener isn't installed yet.)
      if ( changed ) this.engine.trigger("saveRequested");
      if ( !this.current.icon ) {
        var icon = document.createElement("canvas");
        icon.width = 100;
        icon.height = 100;
        // Strafer-flavoured levels show the diving dart (nose-up) as their icon.
        if ( this.current.straferChance ) {
          var s = new Strafer(this.engine, 0, 0, this.current.straferHp ?? this.current.enemyHp, "orange");
          s.x = 50; s.y = 50; s.angle = -Math.PI / 2;
          s.draw(icon.getContext("2d"), {noHp: true});
        } else {
          (new Enemy(this.engine, 50, 50, this.current.enemyHp, this.current.enemyType)).draw(icon.getContext("2d"), {noHp: true});
        }
        this.current.icon = new Image(icon);
      }
    }
  }
}