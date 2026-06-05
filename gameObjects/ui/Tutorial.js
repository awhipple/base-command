import GameObject from "../../engine/objects/GameObject.js";
import { roundedRectPath } from "./canvas.js";
import { idleFuelForTier } from "./InventoryMenu.js";

// Frames to wait after a level ends before the coach reappears, so its ring/card
// doesn't flash over empty space while the title screen slides back in (~0.5s of
// slide + reward pops). ~1.2s at 60fps.
const SETTLE_FRAMES = 72;

// Level-2 nudge: an OPTIONAL, permission-giving suggestion to try World 2 — never a
// forced step. It pops after a win (once settle clears), on every 3rd eligible win,
// shows for ~6s then auto-dismisses, and stops for good once the player selects
// Level 2. Kept entirely separate from the linear lesson chain.
const NUDGE_FRAMES = 360;        // ~6s on screen, then auto-dismiss
const NUDGE_EVERY = 3;           // show on every Nth eligible win

// ── Onboarding coach ─────────────────────────────────────────────────────────
// A small, self-pacing state machine that teaches the synth → equip → idle loop
// the first time a player reaches it. It is PURELY a HUD: it never mutates game
// state. Each step watches the real inventory/menu state and completes the moment
// the player performs the actual action (drag a key, drop a cell, equip a gem,
// merge two gems) — no scripted/forced input, no fake buttons. Completed steps are
// persisted (see Game._snapshot) so nothing ever re-nags.
//
// Presentation: one instruction CARD pinned to the bottom of the screen + a
// pulsing RING around the slot to act on (the ring is computed live from
// InventoryMenu.anchorRect, so it tracks the sliding panel). Hidden during a level
// (combat owns the screen then).
//
// The whole flow is STATE-DRIVEN: a step's `active()` predicate decides when it's
// relevant (e.g. "you hold a blue key and a synth is still locked"), so the coach
// naturally lights up right after level 1 hands you your first key + cell, and
// stays quiet for anyone who's already past this point.
export default class Tutorial extends GameObject {
  // Above the inventory panel (z 101) but below the dragged-gem cursor (z 105) so
  // you can still see the gem you're dragging onto the ringed slot.
  z = 104;

  constructor(engine, menu, opts = {}) {
    super(engine, { x: 0, y: 0, w: 0, h: 0 });
    this.engine = engine;
    this.menu = menu;                       // InventoryMenu — supplies anchor rects
    this.title = opts.title || null;        // TitleScreen — supplies the Start-button anchor
    this.inv = engine.globals.inventory;
    this.done = {};                         // completed step ids (persisted)
    this.pulse = 0;
    this.current = null;
    // True while the coach must stay hidden (in a level / death cinematic). Plus a
    // settle countdown so it doesn't flash during the return-to-title transition.
    this._suppress = opts.suppress || (() => this.engine.globals.base.on);
    this._settle = 0;
    // Sticky flags: a merge of that kind has happened. Split by type so the gem
    // lesson and the energy-cell lesson each complete only on their OWN merge.
    this._mergedGem = false;
    this._mergedBoost = false;
    this._playedLevel = false;              // sticky: a level was started (drives "go play")

    // Level-2 nudge state (persisted): have they found Level 2 yet, and a counter of
    // eligible wins for the every-Nth cadence. `_nudgeTimer` is the live ~6s show
    // window (transient).
    this.triedLevelTwo = false;
    this.nudgeWins = 0;
    this._nudgeTimer = 0;
    this._nudge = false;

    // Restore persisted progress. A pre-existing save that's already progressed but
    // predates the tutorial (no `tutorial` field) shouldn't suddenly coach a
    // veteran — mark everything done in that case (opts.markAllDone).
    if ( opts.saved ) {
      if ( opts.saved.done ) Object.assign(this.done, opts.saved.done);
      this.triedLevelTwo = !!opts.saved.triedLevelTwo;
      this.nudgeWins = opts.saved.nudgeWins || 0;
    }
    if ( opts.markAllDone ) {
      this.steps().forEach(s => this.done[s.id] = true);
      this.sideSteps().forEach(s => this.done[s.id] = true);
      this.triedLevelTwo = true;            // veterans already know about World 2
    }

    // A merge satisfies the matching lesson — by result type (energy cells are
    // "boost", gems are "gem"). Unknown/missing result defaults to gem (the common
    // case) so an arg-less trigger can't silently break the lesson.
    engine.on("itemsMerged", (item) => {
      if ( item && item.type === "boost" ) this._mergedBoost = true;
      else this._mergedGem = true;
    });

    // Starting any level satisfies the "go fight with it" lesson. Set on the start
    // signal (the step is hidden during combat, so it's marked done when the level
    // ends and update() resumes). Also dismiss any pending Level-2 nudge — they moved
    // on by replaying, not by going to World 2.
    engine.on("startGame", () => { this._playedLevel = true; this._nudgeTimer = 0; });

    // Once the core loop is learned, count eligible wins and arm the Level-2 nudge on
    // every Nth one (it shows post-settle, then auto-dismisses). Stops once found.
    engine.on("levelWin", () => {
      if ( !this.done.mergeIntoWeapon || this.triedLevelTwo ) return;
      this.nudgeWins = (this.nudgeWins || 0) + 1;
      if ( this.nudgeWins % NUDGE_EVERY === 0 ) this._nudgeTimer = NUDGE_FRAMES;
      this.engine.trigger("saveRequested");
    });

    this._steps = this.steps();
    this._sideSteps = this.sideSteps();
  }

  snapshot() {
    return { done: this.done, triedLevelTwo: this.triedLevelTwo, nudgeWins: this.nudgeWins };
  }

  // Dev "Reset save" → replay the whole tutorial from scratch.
  reset() {
    this.done = {};
    this._mergedGem = false; this._mergedBoost = false; this._playedLevel = false;
    this.triedLevelTwo = false; this.nudgeWins = 0; this._nudgeTimer = 0; this._nudge = false;
    this.current = null;
  }

  // Permanently retire the whole coach — every linear step AND side step marked done,
  // the Level-2 nudge stopped, and any on-screen card / nudge / panel-lock cleared THIS
  // frame. Used by the Settings "Skip tutorial" button and (in dev) by the cheat buttons,
  // which jump the player past the state the lessons assume. Persisted so it never returns.
  skip() {
    this._steps.forEach(s => this.done[s.id] = true);
    this._sideSteps.forEach(s => this.done[s.id] = true);
    this.triedLevelTwo = true;
    this._nudgeTimer = 0; this._nudge = false;
    this.current = null; this._frontier = null;
    this.engine.trigger("saveRequested");
  }

  // ── state helpers (read-only over inventory) ───────────────────────────────
  _W() { return this.engine.window.width; }
  _panelOpen()   { return this.menu.originX < 4; }
  _has(name)     { return this.inv.items.some(i => i && i.name === name); }
  _gemIndex()    { return this.inv.items.findIndex(i => i && i.type === "gem"); }
  _firstGem()    { var i = this._gemIndex(); return i < 0 ? null : this.inv.items[i]; }
  _synthGems()   { return ["redGem", "blueGem", "yellowGem"]; }
  _anyLocked()   { return this._synthGems().some(g => this.inv.isLocked(g)); }
  _anyUnlocked() { return this._synthGems().some(g => !this.inv.isLocked(g)); }
  _anyLoaded()   { return this._synthGems().some(g => this.inv.machines[g] && this.inv.machines[g].loaded); }
  _firstLocked()   { return this._synthGems().find(g => this.inv.isLocked(g)); }
  _lockedSynths()  { return this._synthGems().filter(g => this.inv.isLocked(g)); }
  _firstUnlocked() { return this._synthGems().find(g => !this.inv.isLocked(g)); }
  _weaponEquipped() { return !!this.inv.equipment.primary; }
  _burning() { return this._synthGems().some(g => (this.inv.machines[g]?.burstQueue?.length || 0) > 0); }
  _hasBoost()   { return this.inv.items.some(i => i && i.type === "boost"); }
  _countBoost() { return this.inv.items.filter(i => i && i.type === "boost").length; }

  // Inventory-slot ring for the SOURCE item a step wants you to drag (so the coach
  // rings the item to grab, not just the slot to drop on). null when it's not in the
  // bag — callers put it in the anchor array, where draw() skips null entries.
  _invAnchor(pred) {
    var i = this.inv.items.findIndex(it => it && pred(it));
    return i >= 0 ? { kind: "inv", index: i } : null;
  }

  // A spare gem in the bag whose colour synth is unlocked AND has an empty fuel
  // slot — the candidate for the "passive growth" lesson. null if none.
  _idleCandidate() {
    for ( var i = 0; i < this.inv.items.length; i++ ) {
      var it = this.inv.items[i];
      if ( !it || it.type !== "gem" ) continue;
      var g = it.color + "Gem";
      if ( !this.inv.isLocked(g) && !(this.inv.machines[g] && this.inv.machines[g].loaded) ) {
        return { gem: g, index: i };
      }
    }
    return null;
  }

  // Two inventory items of `type` with the SAME name (mergeable) → [indexA, indexB],
  // or null. Only counts mergeable items (a maxed top-tier has no `craft`).
  _dupIndices(type) {
    var seen = {};
    for ( var i = 0; i < this.inv.items.length; i++ ) {
      var it = this.inv.items[i];
      if ( !it || it.type !== type || !(it.stats && it.stats.craft) ) continue;
      if ( seen[it.name] !== undefined ) return [seen[it.name], i];
      seen[it.name] = i;
    }
    return null;
  }

  // ── the lesson script ──────────────────────────────────────────────────────
  // A strict LINEAR flow: each step is gated on the previous step's `done` flag, so
  // the player is walked through exactly one deterministic path. Steps with a
  // `gate(ctx)` also RESTRICT drops while they're showing (see allowDrop) — only the
  // intended drag is allowed, everything else snaps back, so the player can't fork
  // off the rails mid-onboarding. The coach shows the FIRST !done && active() step;
  // anchor()/text() are evaluated live each frame.
  //
  // Flow: play L1 → open synth → unlock w/ key → fuel cell → equip gem → beat L1
  // twice (farm 2 cells) → merge cells → fuel the bigger cell → merge the new gem
  // INTO your weapon → (later) load a spare gem as idle fuel.
  steps() {
    var t = this;
    // Anchor/text helpers for steps whose action is INSIDE the panel: ring the real
    // slot when it's open, otherwise point at the SYNTH tab ("open it first").
    var inPanel  = (openAnchor) => () => t._panelOpen() ? openAnchor() : { kind: "tab" };
    var openHint = (open) => () => !t._panelOpen()
      ? "Open your synthesizer — tap the SYNTH tab on the right edge."
      : (typeof open === "function" ? open() : open);
    // Title-screen steps: ring Start when the panel's closed, or the CLOSE tab when
    // it's open (the way back to level select).
    var toStart = () => t._panelOpen() ? { kind: "tab" } : { kind: "play" };

    return [
      {
        // 0 — coach the very first level (brand-new save: nothing earned yet).
        // Keyed on actually EARNING the first reward, not just starting — so a loss
        // (no Blue Key / cell) leaves it active and re-prompts "press Start" to retry.
        id: "startFirstLevel",
        active: () => !t._has("blueKey") && t.inv.items.length === 0 && !t._weaponEquipped() && !t._anyUnlocked(),
        anchor: toStart,
        text:   () => t._panelOpen()
          ? "Let's begin — close this panel and press Start on Level 1."
          : "Welcome, Commander! Press Start to take on Level 1.",
        complete: () => t._has("blueKey") || t.inv.items.length > 0,
      },
      {
        // 1 — open the synth panel (you just won a Blue Key + an Energy Cell).
        id: "openSynth",
        active: () => t._has("blueKey") && t._anyLocked(),
        anchor: () => ({ kind: "tab" }),
        text:   () => "Nice — you earned a Blue Key and an Energy Cell. Tap the SYNTH tab on the right to open your gear.",
        complete: () => t._panelOpen(),
      },
      {
        // 2 — spend the blue key on ANY synthesizer (the colour is the player's call).
        id: "unlockSynth",
        active: () => t.done.openSynth && t._has("blueKey") && t._anyLocked(),
        // Ring the Blue Key (which item to grab) AND every locked synth (where it can go).
        anchor: () => t._lockedSynths().map(gem => ({ kind: "synthBody", gem }))
                       .concat([t._invAnchor(it => it.name === "blueKey")]),
        text:   () => "Drag your Blue Key onto any locked synthesizer to power it up — pick whichever colour you like.",
        complete: () => t._anyUnlocked(),
        gate:   (c) => c.drag.name === "blueKey" && c.target && c.target.kind === "unlockSynth",
      },
      {
        // 3 — burn the Energy Cell to forge your first gem (the first burn is doubled,
        // so a single T1 cell makes exactly one whole gem).
        id: "fuelSynth",
        active: () => t.done.unlockSynth && !t.inv.firstHourglassBonusUsed,
        // Ring the Energy Cell (grab this) AND the unlocked synth (drop it here).
        anchor: inPanel(() => [{ kind: "synthBody", gem: t._firstUnlocked() }, t._invAnchor(it => it.type === "boost")]),
        text:   openHint("Now drop your Energy Cell onto that synthesizer — it burns the cell to forge a gem."),
        complete: () => t.inv.firstHourglassBonusUsed,
        gate:   (c) => c.drag.type === "boost" && c.target && c.target.kind === "fuel",
      },
      {
        // 4 — equip the forged gem (waits ~5s while it's still brewing).
        id: "equipWeapon",
        active: () => t.done.fuelSynth && !t._weaponEquipped(),
        // Once the gem exists: ring the gem (grab) + the Weapon slot (drop). Still brewing: ring the synth.
        anchor: inPanel(() => t._firstGem()
          ? [t._invAnchor(it => it.type === "gem"), { kind: "equip", slot: "primary" }]
          : { kind: "synthBody", gem: t._firstUnlocked() }),
        text:   openHint(() => t._firstGem()
          ? "Drag the new gem into your Weapon slot to arm your base."
          : "Your synthesizer is forging a gem… give it a moment."),
        complete: () => t._weaponEquipped(),
        gate:   (c) => c.drag.type === "gem" && c.target && c.target.kind === "equip" && c.target.slot === "primary",
      },
      {
        // 5 — farm cells: beat Level 1 until you have two cells to merge. No
        // inventory fiddling allowed mid-farm: the drop gate (gate:false) refuses
        // every drop AND the panel is locked CLOSED (lockPanel) so the single cell
        // can't be burned on a synth — we want exactly two, then a merge.
        id: "playTwice",
        active: () => t.done.equipWeapon && !t._dupIndices("boost"),
        anchor: toStart,
        text:   () => {
          // Plays still needed = 2 cells − what's already in the bag (each L1 win
          // drops one), so the count ticks "two more times" → "one more time".
          var left = Math.max(1, 2 - t._countBoost());
          var times = left === 1 ? "one more time" : left + " more times";
          return (t._panelOpen()
              ? "Close this panel and beat Level 1 " + times + " — "
              : "Beat Level 1 " + times + " to collect Energy Cells — ")
            + "you have " + t._countBoost() + " (need 2 to merge).";
        },
        complete: () => !!t._dupIndices("boost"),
        gate:   () => false,
        lockPanel: true,
      },
      {
        // 6 — merge the two cells into a bigger one (a whole gem's worth of fuel).
        id: "mergeCells",
        active: () => t.done.playTwice && !t._mergedBoost,
        anchor: inPanel(() => { var d = t._dupIndices("boost"); return d ? d.map(i => ({ kind: "inv", index: i })) : { kind: "tab" }; }),
        text:   openHint("Drag your two Energy Cells together to merge them into a bigger one — enough to forge a whole gem."),
        complete: () => t._mergedBoost,
        gate:   (c) => c.drag.type === "boost" && c.target && c.target.kind === "inv",
      },
      {
        // 7 — burn the merged cell to forge a second gem. Completes the instant the
        // burn starts; the NEXT step waits out the brew.
        id: "fuelAgain",
        active: () => t.done.mergeCells && !t._burning() && t._gemIndex() < 0,
        // Ring the merged cell (grab) + the synth (drop).
        anchor: inPanel(() => [{ kind: "synthBody", gem: t._firstUnlocked() }, t._invAnchor(it => it.type === "boost")]),
        text:   openHint("Drop the bigger Energy Cell onto your synthesizer to forge another gem."),
        complete: () => t._burning() || t._gemIndex() >= 0,
        gate:   (c) => c.drag.type === "boost" && c.target && c.target.kind === "fuel",
      },
      {
        // 8 — merge the new gem INTO your equipped weapon to level it up (waits for
        // the gem to finish brewing, then rings the gem + the weapon slot).
        id: "mergeIntoWeapon",
        active: () => t.done.fuelAgain && !t._mergedGem,
        anchor: inPanel(() => {
          var i = t._gemIndex();
          return i >= 0
            ? [{ kind: "inv", index: i }, { kind: "equip", slot: "primary" }]
            : { kind: "synthBody", gem: t._firstUnlocked() };
        }),
        text:   openHint(() => t._gemIndex() >= 0
          ? "Drag the new gem onto the gem in your Weapon slot to merge them — that levels up your weapon."
          : "Your synthesizer is forging the gem… give it a moment."),
        complete: () => t._mergedGem,
        gate:   (c) => c.drag.type === "gem" && c.target && c.target.kind === "equip" && c.target.slot === "primary",
      },
      {
        // 9 — eventually, when a spare gem is on hand, load it as IDLE fuel so the
        // synth grows gems passively. Waits until such a gem exists (the previous
        // step merged the last one away), then rings the matching synth slot.
        id: "idleFuel",
        active: () => t.done.mergeIntoWeapon && !!t._idleCandidate() && !t._anyLoaded(),
        // Ring the spare gem (grab) + the matching synth's fuel slot (drop).
        anchor: inPanel(() => { var c = t._idleCandidate(); return c ? [{ kind: "synthSlot", gem: c.gem }, { kind: "inv", index: c.index }] : { kind: "tab" }; }),
        text:   openHint(() => {
          var c = t._idleCandidate();
          var gem = c && t.inv.items[c.index];
          var tier = gem ? gem.tier : 1;
          var rate = idleFuelForTier(tier);
          return "Drop this spare gem into its matching synthesizer slot — it feeds the synth +" + rate
            + " fuel/s, slowly forging new gems on its own even while you play.";
        }),
        complete: () => t._anyLoaded(),
        gate:   (c) => c.drag.type === "gem" && c.target && c.target.kind === "synth",
      },
    ];
  }

  // Parallel "side" lessons — triggered by their OWN condition (a new item/event),
  // NOT the linear chain. They show only in the GAPS between core lessons (never
  // interrupt one), and their completion is recorded every frame so it persists.
  // Kept gate-free (soft): they instruct, but don't lock the player down.
  sideSteps() {
    var t = this;
    return [
      {
        // First Green Key (earned by beating Level 2) → unlock the Effect slot.
        // A green key only opens the Effect lock anyway (helper locks aren't reachable
        // until Effect is open), so no drop-gate is needed.
        id: "unlockEffect",
        active: () => t.done.mergeIntoWeapon && t._has("greenKey") && t.inv.isLocked("effect"),
        anchor: () => t._panelOpen()
          ? [{ kind: "equip", slot: "effect" }, t._invAnchor(it => it.name === "greenKey")]
          : { kind: "tab" },
        text:   () => t._panelOpen()
          ? "You earned a Green Key! Drag it onto your locked Effect slot to open it — equip a gem there to add an element to every shot."
          : "You earned a Green Key! Open your gear — tap the SYNTH tab on the right edge.",
        complete: () => !t.inv.isLocked("effect"),
      },
    ];
  }

  // Drop-gating: while a guided step is showing, only its intended drag is allowed —
  // everything else snaps back. Called by InventoryMenu._resolveDrop with the dragged
  // item and the normalised drop target. No current step / no gate → unrestricted
  // (so returning players and the post-tutorial game play normally).
  allowDrop(drag, target) {
    var s = this.current;
    if ( !s || !s.gate ) return true;
    return !!s.gate({ drag, target, inv: this.inv });
  }

  // True while the active lesson locks the synth panel CLOSED (the "farm two cells"
  // step). InventoryMenu's tab honours this: it can still CLOSE an open panel, but
  // won't RE-OPEN a closed one — so the player can't slip into the synth and burn
  // their single Energy Cell before farming the second. Read off the frontier (not
  // `current`) so it holds even while the coach card is briefly suppressed.
  panelLockedClosed() {
    return !!(this._frontier && this._frontier.lockPanel);
  }

  update() {
    this.pulse += 0.09;

    // Advance the linear frontier: walk the steps in order and mark each completed
    // one done. Crucially this is INDEPENDENT of active() — performing a step's
    // action frequently flips its own active() false the same frame (spending the
    // key, burning the cell, equipping the gem), and the 2nd farm cell can even land
    // while the coach is hidden mid-level. Checking complete() in order catches all
    // of those. The first not-done, not-complete step is the `frontier`.
    var frontier = null;
    for ( var i = 0; i < this._steps.length; i++ ) {
      var s = this._steps[i];
      if ( this.done[s.id] ) continue;
      if ( s.complete() ) {
        this.done[s.id] = true;
        this.engine.trigger("saveRequested");
        continue;
      }
      frontier = s;
      break;
    }
    // Remember the live frontier independently of the on-screen coach: panelLockedClosed()
    // reads it so the panel stays locked even while the card is suppressed (settle/level).
    this._frontier = frontier;

    // Level-2 discovery is sticky: selecting it ever = "found it" → stop nudging.
    if ( !this.triedLevelTwo && this.engine.globals.levels.selected >= 2 ) {
      this.triedLevelTwo = true;
      this._nudgeTimer = 0;
      this.engine.trigger("saveRequested");
    }

    // Hide the coach during combat / the death cinematic, and briefly after (settle)
    // so the ring/card doesn't flash over the title-screen slide. Progress above
    // still advances; only the on-screen coaching is gated here.
    if ( this._suppress() ) { this._settle = SETTLE_FRAMES; this.current = null; this._nudge = false; return; }
    if ( this._settle > 0 ) { this._settle--; this.current = null; this._nudge = false; return; }

    // Coach the frontier step only once it's ready to show (active() lets a step
    // wait — e.g. idle-fuel holds until a spare gem actually exists).
    this.current = ( frontier && frontier.active() ) ? frontier : null;

    // Side lessons (parallel, item-triggered — e.g. "unlock your Effect slot"):
    // record completion every frame, and surface one only in a gap (never over a
    // core lesson).
    for ( var j = 0; j < this._sideSteps.length; j++ ) {
      var ss = this._sideSteps[j];
      if ( this.done[ss.id] ) continue;
      if ( ss.complete() ) { this.done[ss.id] = true; this.engine.trigger("saveRequested"); continue; }
      if ( !this.current && ss.active() ) this.current = ss;
    }

    // The optional Level-2 nudge runs ONLY in the gaps between lessons (no current
    // step) and on the level-select (panel closed, Level 1 up). It burns its ~6s
    // timer only while actually visible, so a lesson or open panel just pauses it.
    this._nudge = false;
    if ( !this.current && !this._panelOpen() && this._nudgeTimer > 0 && this._nudgeEligible() ) {
      this._nudgeTimer--;
      this._nudge = true;
    }
  }

  // Eligible to suggest World 2: core loop learned, haven't found Level 2 yet, and
  // sitting on Level 1 in the level-select (so ▶ is the real "next").
  _nudgeEligible() {
    return this.done.mergeIntoWeapon && !this.triedLevelTwo
        && this.engine.globals.levels.selected === 1;
  }

  draw(ctx) {
    // No lesson active → maybe draw the optional Level-2 nudge instead, then stop.
    if ( !this.current ) {
      if ( this._nudge ) this._drawNudge(ctx);
      return;
    }

    var W = this.engine.window.width;
    // Ring the target(s). A step may point at one slot or several (e.g. all three
    // synths — unlock any). Visibility is gated per anchor kind, and any rect that
    // maps off-screen is skipped (the card still guides).
    var spec = this.current.anchor();
    var specs = Array.isArray(spec) ? spec : [spec];
    for ( var i = 0; i < specs.length; i++ ) {
      var s = specs[i];
      if ( !s ) continue;
      if ( s.kind === "play" ) { if ( this._panelOpen() ) continue; }      // Start: title up
      else if ( s.kind !== "tab" ) { if ( !this._panelOpen() ) continue; } // panel slots: panel open
      var r = this._resolveAnchor(s);
      if ( r && r.x + r.w > 0 && r.x < W ) this._drawRing(ctx, r);
    }
    this._drawCard(ctx, this.current.text());
  }

  // The optional Level-2 suggestion: a soft pulse on the ▶ arrow + a permission-
  // giving card that blesses staying on Level 1. Drawn only between lessons.
  _drawNudge(ctx) {
    var W = this.engine.window.width;
    var r = this.title ? this.title.nextArrowRect() : null;
    if ( r && r.x + r.w > 0 && r.x < W ) this._drawRing(ctx, r);
    this._drawCard(ctx,
      "When you're ready, tap ▶ to try Level 2 — or keep powering up here first. No rush.",
      "▸ TIP");
  }

  // Resolve an anchor spec to a screen rect. Panel slots come from the InventoryMenu;
  // the Start button comes from the TitleScreen.
  _resolveAnchor(spec) {
    if ( !spec ) return null;
    if ( spec.kind === "play" ) return this.title ? this.title.startButtonRect() : null;
    return this.menu.anchorRect(spec);
  }

  _drawRing(ctx, r) {
    var pad = 6 + 2 * Math.sin(this.pulse);
    var glow = 12 + 6 * (0.5 + 0.5 * Math.sin(this.pulse));
    ctx.save();
    ctx.strokeStyle = "#ffe066";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffe066";
    ctx.shadowBlur = glow;
    roundedRectPath(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 9);
    ctx.stroke();
    ctx.restore();
  }

  _drawCard(ctx, text, label) {
    var W = this.engine.window.width, H = this.engine.window.height;
    var x = 18, w = W - 36;

    // Measure-then-size: wrap with the body font FIRST, then grow the box to fit so
    // long copy never spills out the bottom. Pinned to the bottom (taller cards rise).
    ctx.font = "15px Lucida Console, Menlo, monospace";
    var lines = this._wrap(ctx, text, w - 28);
    var bodyTop = 32, lineH = 18;
    var h = Math.max(60, bodyTop + lines.length * lineH + 12);
    var y = H - h - 14;

    ctx.save();
    roundedRectPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = "rgba(9,13,26,0.93)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#3a4a6a";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#7ee787";
    ctx.font = "bold 12px Lucida Console, Menlo, monospace";
    ctx.fillText(label || "▸ TUTORIAL", x + 14, y + 11);

    ctx.fillStyle = "#e7edf7";
    ctx.font = "15px Lucida Console, Menlo, monospace";
    for ( var i = 0; i < lines.length; i++ ) {
      ctx.fillText(lines[i], x + 14, y + bodyTop + i * lineH);
    }
    ctx.restore();
  }

  // Greedy word-wrap to a pixel width (ctx.font must be set by the caller).
  _wrap(ctx, text, maxW) {
    var words = text.split(" "), lines = [], line = "";
    for ( var i = 0; i < words.length; i++ ) {
      var test = line ? line + " " + words[i] : words[i];
      if ( ctx.measureText(test).width > maxW && line ) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if ( line ) lines.push(line);
    return lines;
  }
}
