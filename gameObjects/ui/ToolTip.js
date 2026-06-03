import GameObject from "../../engine/objects/GameObject.js";
import EffectRect from "../effects/EffectRect.js";
import Text from "../../engine/gfx/Text.js";
import { constrain } from "../../engine/GameMath.js";

export default class ToolTip extends GameObject {
  z = 200;

  constructor(engine) {
    super(engine, {x: 0, y: 0, w: 300, h: 300});

    this.iconRect = new EffectRect(this.engine, {x: 0, y: 0, w: 40, h: 40});
    this.itemName = new Text("", 0, 0, {
      fontColor: "white",
      fontSize: 25,
    });

    this.statText = new Text("", 0, 0, {
      fontColor: "yellow",
      fontSize: 15,
    });

    this.descriptionText = new Text("", 0, 0, {
      fontColor: "white",
      fontSize: 15,
      maxWidth: 280,
    });

    this.mergeText = new Text("Merge", 0, 0, {
      fontColor: "#99f",
      fontSize: 15,
    });
    this.noneText = new Text("none", 0, 0, {
      fontColor: "white",
      fontSize: 13,
    })

    engine.onMouseMove(() => {
      if ( this.item ) {
        this._recomputeTooltip();
      }
    });
  }

  update() {
    if ( this.item !== this.engine.globals.toolTipItem ) {
      this.item = this.engine.globals.toolTipItem;
      if ( this.item ) {
        this._recomputeTooltip();
      }
    }
  }

  // Tooltip title. Gems always show their tier (toolTipName already appends it for
  // T2+, so just add it for T1) so you can tell tiers apart at a glance.
  _title() {
    var it = this.item;
    return ( it.type === "gem" && it.tier === 1 ) ? it.toolTipName + " T1" : it.toolTipName;
  }

  draw(ctx) {
    if ( this.item ) {
      this.rect.draw(ctx, this.item.borderColor, "black");

      this.item.icon.draw(ctx, this.iconRect);
      this.iconRect.color = this.item.borderColor;
      this.iconRect.draw(ctx);

      this.itemName.str = this._title();
      this.itemName.draw(ctx);

      // Gems: compact tooltip — icon + name & tier only (no stats / effect / merge).
      if ( this.item.type === "gem" ) return;

      if ( this.item.type === "weapon" ) {
        this.statText.draw(ctx);
      } else {
        this.statText.str = "";
      }

      this.descriptionText.draw(ctx);

      var merges = this.item.merges;
      this.item.merges.forEach((merge, i) => {
        merge.borderIcon.draw(ctx, this.originX + 10 + 35*i, this.mergeTop + 30, 30, 30);
      });

      this.mergeText.draw(ctx);
      
      if ( merges.length === 0 ) {
        this.noneText.draw(ctx);
      }
    }
  }

  _recomputeTooltip() {
    var event = this.engine.mouse;

    // Gems use a narrower box than full item tooltips. Set width BEFORE `this.x`
    // (which derives the left edge from rect.w) so originX lands correctly.
    this.rect.w = this.item.type === "gem" ? 240 : 300;
    this.x = constrain(event.pos.x, this.rect.w/2 + 10, engine.window.width - this.rect.w/2 - 10);

    // Gems: compact icon + title only. Short box, no stat/description/merge layout.
    if ( this.item.type === "gem" ) {
      this.rect.h = 58;
      this.rect.y = event.pos.y + 40;
      if ( this.rect.y + this.rect.h > engine.window.height - 10 ) this.rect.y = event.pos.y - 40 - this.rect.h;
      this.iconRect.x = this.originX + 10;
      this.iconRect.y = this.originY + 9;
      this.itemName.x = this.originX + 62;
      this.itemName.y = this.originY + 16;
      return;
    }

    if ( this.item.type === "weapon" ) {
      this.statText.str = "Damage: " + Math.floor(this.item.projectile.damage*100) + "%   Rate: " + Math.floor(this.item.projectile.speed*100) + "%";
    }

    this.descriptionText.str = this.item.description;
    this.descriptionText._generateLines(engine.window.ctx, true);
    
    this.rect.h = (
      (this.statText.str === "" ? 50 : 95) +
      100 + this.descriptionText.height  
    );

    this.rect.y = event.pos.y + 40;
    if ( this.rect.y + this.rect.h > engine.window.height - 10 ) {
      this.rect.y = event.pos.y - 40 - this.rect.h;
    };

    var descriptionTop = this.originY + (this.statText.str === "" ? 50 : 95);
    this.mergeTop = descriptionTop + 25 + this.descriptionText.height;

    this.iconRect.x = this.originX + 10;
    this.iconRect.y = this.originY + 10;

    this.itemName.x = this.originX + 65;
    this.itemName.y = this.originY + 12;

    this.statText.x = this.originX + 10;
    this.statText.y = this.originY + 65;
    
    this.descriptionText.x = this.originX + 10;
    this.descriptionText.y = descriptionTop;

    this.mergeText.x = this.originX + 10;
    this.mergeText.y = this.mergeTop;

    this.noneText.x = this.originX + 10;
    this.noneText.y = this.mergeTop + 25;
  }
}