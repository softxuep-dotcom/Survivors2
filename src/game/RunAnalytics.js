// 本地运行分析：每 30 秒留存快照 + 关键事件 + 死亡位置。不上报外部服务。
export class RunAnalytics {
  constructor({ character, difficulty, startedAt = Date.now() }) {
    this.run = { version: 1, startedAt, character, difficulty, snapshots: [], events: [] };
    this.nextSnapshot = 30;
  }

  event(type, time, data = {}) {
    this.run.events.push({ type, time: Math.floor(time), ...data });
  }

  shouldSnapshot(time) {
    return time >= this.nextSnapshot;
  }

  update(time, snapshot) {
    while (time >= this.nextSnapshot) {
      this.run.snapshots.push({ at: this.nextSnapshot, ...snapshot });
      this.nextSnapshot += 30;
    }
  }

  finish({ victory, reason, time, x, y, kills, level, damage }) {
    return {
      ...this.run,
      endedAt: Date.now(), victory, reason, duration: Math.floor(time),
      endPosition: { x: Math.round(x), y: Math.round(y) }, kills, level,
      damage: { ...damage },
    };
  }
}
