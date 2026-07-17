// 通用对象池：运行时零 new（GDD §8.2）。
// 用法：pool = new Pool(() => makeThing(), (thing, ...args) => resetThing(thing, ...args))
export class Pool {
  constructor(create, reset = null) {
    this.create = create;
    this.reset = reset;
    this.free = [];
    this.created = 0;
  }

  // 取出一个对象（池空则新建）；reset 负责把对象初始化为可用状态
  get(...args) {
    let item = this.free.pop();
    if (!item) {
      item = this.create();
      this.created++;
    }
    if (this.reset) this.reset(item, ...args);
    return item;
  }

  release(item) {
    this.free.push(item);
  }

  // 预热：提前创建 n 个，避免局内首次分配卡顿
  warm(n) {
    while (this.free.length < n) {
      this.free.push(this.create());
      this.created++;
    }
  }
}
