import Image from "./Image.js";

export default class Text {
  static _singleton = new Text('', 0, 0);

  alpha = 1;

  constructor(str, x, y, options = {}) {
    this.x = x;
    this.y = y;
    this.center = options.center;

    this.fontWeight = options.fontWeight ? options.fontWeight + ' ' : '';
    this.fontSize = options.fontSize ?? 50;
    this.fontStyle = options.fontStyle ?? "Lucida Console,Menlo,monospace";
    this.fontColor = options.fontColor ?? "#000";
    this.maxWidth = options.maxWidth ?? null;

    this.z = options.z ?? this.z;

    this._updateStyle();
    this.setText(str);
  }

  draw(ctx) {
    ctx.save();

    ctx.globalAlpha = this.alpha;
    ctx.font = this.style;
    ctx.fillStyle = this.fontColor;

    if ( !this.lines ) {
      this._generateLines(ctx);
    }

    this.lines?.forEach((str, y) => {
      var xShow = this.x - (this.center ? ctx.measureText(this.str).width/2 : 0);
      ctx.fillText(str, xShow, this.y + this.fontSize*(y+1));
    });

    ctx.restore();
  }

  static draw(ctx, str, x, y, options = {}) {
    this._singleton.setText(str);
    this._singleton.x = x;
    this._singleton.y = y;
    this._singleton.fontSize = options.fontSize ?? 50;
    this._singleton.fontWeight = options.fontWeight ? options.fontWeight + ' ' : '';
    this._singleton.fontColor = options.fontColor ?? "#000";
    this._singleton.center = options.center ?? false;
    this._singleton._updateStyle();
    this._singleton.draw(ctx);
  }

  getWidth(ctx) {
    ctx.font = this.style;
    return ctx.measureText(this.str).width;
  }

  setText(str) {
    this.str = str;

    this._updateImage();
  }

  asImage(width, height) {
    if ( !this.textImage ) {
      var canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      var ctx = canvas.getContext("2d");
      this.draw(ctx);
      this.textImage = new Image(canvas);
    }

    return this.textImage;    
  }

  get str() {
    return this._str;
  }

  set str(val) {
    this._str = val;

    this.lines = null;
  }

  get fontSize() {
    return this._fontSize;
  }

  set fontSize(val) {
    this._fontSize = val;
    this._updateStyle();
  }

  get fontColor() {
    return this._fontColor;
  }

  set fontColor(val) {
    this._fontColor = val;
    this._updateStyle();
  }

  get height() {
    if ( this.str === "" ) {
      return 0;
    }
    return (this.lines?.length ?? 0) * this.fontSize;
  }

  _updateStyle() {
    this.style = this.fontWeight + this.fontSize + "px " + this.fontStyle;
  }

  _updateImage() {
    if ( this.textImage ) {
      var ctx = this.textImage.img.getContext("2d");
      ctx.clearRect(0, 0, 400, 400);
      this.draw(ctx);
    }
  }

  _generateLines(ctx) {
    ctx.save();
    ctx.font = this.style;

    if ( !this.maxWidth ) {
      this.lines = [ this.str ];
      return;
    }
    this.lines = [];
    var words = this.str?.split(" ");
    var numWords = 0;
    while ( words.length > 0 ) {
      if ( numWords === words.length ) {
        this.lines.push(words.join(" "));
        break;
      }
      numWords++;
      if ( ctx.measureText(words.slice(0, numWords + 1).join(" ")).width > this.maxWidth) {
        this.lines.push(words.slice(0, numWords).join(" "));
        words.splice(0, numWords);
        numWords = 0;
      }
    }

    ctx.restore();
  }
}