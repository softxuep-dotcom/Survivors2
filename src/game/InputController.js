// 统一移动输入（GDD §3.1：唯一操作就是移动）
// 触屏：动态虚拟摇杆（按下处即原点）；鼠标：移动/点击到哪里就朝哪里走；键盘：WASD/方向键。
import Phaser from 'phaser';

const JOY_RADIUS = 70;      // 摇杆最大行程
const MOUSE_STOP_DIST = 10; // 鼠标跟随的"靠近即停"距离

export class InputController {
  // scene=GameScene（输入与世界坐标）；uiScene=UiScene（摇杆可视件，屏幕坐标）
  constructor(scene, uiScene) {
    this.scene = scene;
    this.mode = null;        // 'joystick' | 'mouse' | null
    this.origin = { x: 0, y: 0 };
    this.mouseTarget = null;
    this.vec = { x: 0, y: 0 }; // 输出移动向量（模长 0–1）
    this.moved = false;      // 是否发生过首次移动（教学提示用）

    this.keys = scene.input.keyboard.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT');

    this.joyBase = uiScene.joyBase;
    this.joyKnob = uiScene.joyKnob;

    // Phaser 4 弃用 on(event, fn, scope)，改用绑定引用（注销时用同一引用）
    this._onDown = this.onDown.bind(this);
    this._onMove = this.onMove.bind(this);
    this._onUp = this.onUp.bind(this);
    this._onCancel = this.clearPointer.bind(this);
    scene.input.on('pointerdown', this._onDown);
    scene.input.on('pointermove', this._onMove);
    scene.input.on('pointerup', this._onUp);
    scene.input.on('pointerupoutside', this._onUp);
    scene.input.on('gameout', this._onCancel);
    this._onWindowBlur = this.clearPointer.bind(this);
    window.addEventListener('blur', this._onWindowBlur);
  }

  onDown(pointer) {
    if (this.scene.inputLocked?.()) return;
    const isTouch = pointer.wasTouch || pointer.pointerType === 'touch';
    if (isTouch) {
      this.mode = 'joystick';
      this.origin.x = pointer.x;
      this.origin.y = pointer.y;
      this.joyBase.setPosition(pointer.x, pointer.y).setVisible(true).setAlpha(0.9);
      this.joyKnob.setPosition(pointer.x, pointer.y).setVisible(true);
    } else {
      this.mode = 'mouse';
      this.updateMouseTarget(pointer);
    }
    this.onMove(pointer);
  }

  updateMouseTarget(pointer) {
    const world = pointer.positionToCamera(this.scene.cameras.main);
    this.mouseTarget = { x: world.x, y: world.y };
  }

  onMove(pointer) {
    const isTouch = pointer.wasTouch || pointer.pointerType === 'touch';
    if (!this.mode || (isTouch && !pointer.isDown)) return;
    if (this.mode === 'joystick') {
      let dx = pointer.x - this.origin.x;
      let dy = pointer.y - this.origin.y;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(len, JOY_RADIUS);
      if (len > 0.001) { dx /= len; dy /= len; }
      this.vec.x = dx * (clamped / JOY_RADIUS);
      this.vec.y = dy * (clamped / JOY_RADIUS);
      this.joyKnob.setPosition(this.origin.x + dx * clamped, this.origin.y + dy * clamped);
      if (clamped > 6) this.moved = true;
    } else if (this.mode === 'mouse' && pointer.isDown) {
      this.updateMouseTarget(pointer);
    }
    // mouse 模式在 getMoveVector 里按世界坐标实时计算（玩家会动，指针不动也要更新方向）
  }

  onUp(pointer = this.scene.input.activePointer) {
    const isTouch = pointer?.wasTouch || pointer?.pointerType === 'touch';
    if (this.mode === 'mouse' && !isTouch) return;
    this.clearPointer();
  }

  clearPointer() {
    this.mode = null;
    this.mouseTarget = null;
    this.vec.x = 0;
    this.vec.y = 0;
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
  }

  // 返回本帧移动向量（模长 0–1），playerX/Y 为世界坐标（鼠标跟随用）
  getMoveVector(playerX, playerY) {
    // 键盘优先级最低，但没有指针输入时生效
    let kx = 0, ky = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) kx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) kx += 1;
    if (k.W.isDown || k.UP.isDown) ky -= 1;
    if (k.S.isDown || k.DOWN.isDown) ky += 1;

    // Physical keys always take over immediately and cancel a stale click target.
    if (kx || ky) {
      if (this.mode === 'mouse') {
        this.mode = null;
        this.mouseTarget = null;
      }
      const len = Math.hypot(kx, ky);
      this.moved = true;
      return { x: kx / len, y: ky / len };
    }

    if (this.mode === 'mouse' && this.mouseTarget) {
      const dx = this.mouseTarget.x - playerX, dy = this.mouseTarget.y - playerY;
      const len = Math.hypot(dx, dy);
      if (len > MOUSE_STOP_DIST) {
        this.moved = true;
        return { x: dx / len, y: dy / len };
      }
      this.mode = null;
      this.mouseTarget = null;
      return { x: 0, y: 0 };
    }

    if (this.mode === 'joystick' && (this.vec.x || this.vec.y)) {
      return this.vec;
    }

    return { x: 0, y: 0 };
  }

  destroy() {
    this.scene.input.off('pointerdown', this._onDown);
    this.scene.input.off('pointermove', this._onMove);
    this.scene.input.off('pointerup', this._onUp);
    this.scene.input.off('pointerupoutside', this._onUp);
    this.scene.input.off('gameout', this._onCancel);
    window.removeEventListener('blur', this._onWindowBlur);
  }
}
