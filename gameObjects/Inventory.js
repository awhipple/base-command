import Item from "./Item.js";

export default class Inventory {
  constructor(engine) {
    this.engine = engine;

    this.items = [];
    this.equipment = {
      primary: null,
    };

    if ( engine.dev ) {
      for ( var i = 0; i < 6; i++ ) {
        this.add("whiteGem");
      }
      for ( var i = 0; i < 6; i++ ) {
        this.add("blueGem");
      }
      for ( var i = 0; i < 6; i++ ) {
        this.add("greenGem");
      }
      this.equip("primary", this.add("zap"));
      this.sort();
    }
  }

  sort() {
    this.items = this.items.filter(item => item);
    this.items.sort((a, b) => a.type === b.type ? (a.name < b.name ? 1 : -1) : (a.type < b.type ? 1 : -1));
    this.engine.trigger("openInventory"); // Clear the inv menu and refreshes it
  }

  add(item) {
    if ( typeof item === "string" ) {
      item = new Item(this.engine, item);
    }
    var index = this.items.findIndex(item => !item);
    if ( index !== -1 ) {
      this.items[index] = item;
    } else {
      this.items.push(item);
    }
    this.engine.trigger("itemAcquired");
    return item;
  }

  remove(item) {
    var index = this.items.indexOf(item);
    if ( index !== -1 ) {
      this.items[index] = null;
    }
  }

  count(itemName) {
    return this.items.filter(item => item?.name === itemName).length;
  }

  equip(slot, item) {
    this.remove(item);
    this.unequip(slot);
    this.equipment[slot] = item;
    this.engine.trigger("itemEquipped");
  }

  unequip(slot) {
    if ( this.equipment[slot]) {
      this.add(this.equipment[slot]);
    }
    this.equipment[slot] = null;
    this.engine.trigger("openInventory"); // Clear the inv menu and refreshes it
  }

  attemptMerge(first, second) {
    if ( first !== second && first.stats.craft?.[second.name]) {
      var mergeIndex = this.items.indexOf(second);
      if ( mergeIndex >= 0) {
        this.remove(first);
        this.remove(second);
        this.engine.trigger("itemsMerged");
        return this.items[mergeIndex] = new Item(this.engine, first.stats.craft[second.name]);
      }
    }
    return null;
  }
}