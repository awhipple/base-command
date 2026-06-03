import GameObject from "../engine/objects/GameObject.js";
import Item from "./Item.js";

export default class Cursor extends GameObject {
  z = 105;
  constructor(engine) {
    super(engine, { x: 0, y: 0, w: Item.ICON_SIZE, h: Item.ICON_SIZE });

    engine.onMouseMove(event => {
      this.x = event.pos.x;
      this.y = event.pos.y;
    });

    engine.onMouseUp(event => {
      if (this.engine.globals.dragItem) {
        this.engine.trigger("stopDragItem", this.engine.globals.dragItem);
        this.engine.globals.dragItem = null;
        this.engine.globals.dragSource = null;
      }
    })
  }

  draw(ctx) {
    if (this.engine.globals.dragItem) {
      this.engine.globals.dragItem.icon.draw(ctx, this.rect);
      this.rect.draw(ctx, this.engine.globals.dragItem.borderColor);
    }
  }
}