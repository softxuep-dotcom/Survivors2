// 均匀空间网格（GDD §8.2：不用物理引擎，碰撞全走这里）。
// 每帧 clear() + 全量 insert()，查询用 forEachInCircle。
// 单元格数组复用避免 GC；玩家远行导致的空桶定期清理。
const KEY_SPAN = 1 << 20; // 支持约 ±5000 万 px 世界坐标（cell=96 时）

export class SpatialGrid {
  constructor(cellSize) {
    this.cell = cellSize;
    this.buckets = new Map(); // key -> array（数组复用）
    this._frame = 0;
  }

  _key(cx, cy) {
    return (cx + KEY_SPAN / 2) * KEY_SPAN + (cy + KEY_SPAN / 2);
  }

  clear() {
    this._frame++;
    // 每 600 帧整体重建一次，回收玩家走远后留下的空桶
    if (this._frame % 600 === 0 && this.buckets.size > 2048) {
      this.buckets.clear();
      return;
    }
    for (const arr of this.buckets.values()) arr.length = 0;
  }

  insert(entity) {
    const cx = Math.floor(entity.x / this.cell);
    const cy = Math.floor(entity.y / this.cell);
    const key = this._key(cx, cy);
    let arr = this.buckets.get(key);
    if (!arr) {
      arr = [];
      this.buckets.set(key, arr);
    }
    arr.push(entity);
  }

  // 对圆形范围内所有实体执行 fn(entity, distSq)；fn 返回 true 可提前终止
  forEachInCircle(x, y, r, fn) {
    const minX = Math.floor((x - r) / this.cell);
    const maxX = Math.floor((x + r) / this.cell);
    const minY = Math.floor((y - r) / this.cell);
    const maxY = Math.floor((y + r) / this.cell);
    const r2 = r * r;
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const arr = this.buckets.get(this._key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const e = arr[i];
          const dx = e.x - x, dy = e.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= r2 && fn(e, d2)) return;
        }
      }
    }
  }

  // 找圆形范围内最近实体（filter 可选）
  nearestInCircle(x, y, r, filter = null) {
    let best = null, bestD2 = Infinity;
    this.forEachInCircle(x, y, r, (e, d2) => {
      if (filter && !filter(e)) return false;
      if (d2 < bestD2) { bestD2 = d2; best = e; }
      return false;
    });
    return best;
  }
}
