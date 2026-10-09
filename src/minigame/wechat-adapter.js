// Keep browser compatibility objects inside the game's own scope. In the IDE,
// globalThis is a Window with readonly window/document/navigation accessors.
export function createWechatHost(api, environment = globalThis) {
  const host = {
    performance: environment.performance,
    requestAnimationFrame: environment.requestAnimationFrame?.bind(environment),
    cancelAnimationFrame: environment.cancelAnimationFrame?.bind(environment),
  };
  installWechatAdapter(api, host);
  return host;
}

// A deliberately small Phaser host, not an HTML renderer. Install BEFORE Phaser.
// root must be a private mutable scope, never the native Window/GameGlobal.
export function installWechatAdapter(api, root = {}) {
  if (!api?.createCanvas) throw new Error('This build requires the Wechat mini-game wx runtime');
  if (root.__HORDE_MINIGAME__) return root.__HORDE_MINIGAME__;
  root.wx = api;
  const info = api.getSystemInfoSync();
  const width = info.windowWidth || info.screenWidth;
  const height = info.windowHeight || info.screenHeight;
  const canvases = new WeakSet();
  const images = new WeakSet();
  class HostEvent {
    constructor(type, options = {}) { this.type = type; Object.assign(this, options); }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() {}
  }
  class HostSearchParams {
    constructor(query = '') { this.values = new Map(String(query).replace(/^\?/, '').split('&').filter(Boolean)
      .map(part => { const [key, ...value] = part.split('='); return [decodeURIComponent(key), decodeURIComponent(value.join('='))]; })); }
    get(key) { return this.values.get(key) ?? null; }
    has(key) { return this.values.has(key); }
  }
  function events(target) {
    const listeners = new Map();
    target.addEventListener = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    };
    target.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    target.dispatchEvent = event => {
      if (!event.target) event.target = target;
      for (const fn of [...(listeners.get(event.type) || [])]) fn.call(target, event);
      target[`on${event.type}`]?.call(target, event);
      return !event.defaultPrevented;
    };
    return target;
  }
  const win = events({});
  function element(tagName) {
    const node = events({ tagName: tagName.toUpperCase(), nodeType: 1,
      style: {}, dataset: {}, children: [], parentNode: null,
      clientWidth: width, clientHeight: height, clientLeft: 0, clientTop: 0,
      classList: { add() {}, remove() {}, toggle() {} },
      setAttribute(key, value) { this[key] = value; },
      getAttribute(key) { return this[key]; },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
      removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; },
      contains(child) { return child === this || this.children.some(x => x.contains?.(child) || x === child); },
      getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, right: win.innerWidth,
        bottom: win.innerHeight, width: win.innerWidth, height: win.innerHeight }; },
      focus() {}, blur() {}, canPlayType() { return ''; },
    });
    return node;
  }
  function canvasElement() {
    const canvas = api.createCanvas();
    const node = element('canvas');
    for (const [key, value] of Object.entries(node)) {
      try { Object.defineProperty(canvas, key, { value, writable: true, configurable: true }); }
      catch (_) { /* Some hosts already expose readonly DOM-compatible fields. */ }
    }
    canvases.add(canvas);
    return canvas;
  }
  // The first createCanvas is the sole onscreen canvas. Device probes and Text
  // textures must use later, offscreen canvases.
  const canvas = canvasElement();
  canvas.width = width;
  canvas.height = height;
  let webgl = false;
  let context = null;
  // Probe offscreen first so unsupported WebGL does not lock the screen away
  // from Canvas2D. Phaser 4 needs VAO + instancing extensions on WebGL1.
  try {
    const probe = canvasElement().getContext('webgl');
    webgl = !!(probe?.getExtension('OES_vertex_array_object') && probe.getExtension('ANGLE_instanced_arrays'));
    if (webgl) context = canvas.getContext('webgl', { alpha: false, antialias: true, stencil: true });
    webgl = !!context;
  } catch (_) { webgl = false; }
  const doc = events({ readyState: 'complete', hidden: false, visibilityState: 'visible' });
  doc.documentElement = element('html');
  doc.documentElement.ontouchstart = null;
  doc.body = element('body');
  doc.documentElement.appendChild(doc.body);
  const gameRoot = element('div');
  gameRoot.id = 'game';
  doc.body.appendChild(gameRoot);
  doc.getElementById = id => id === 'game' ? gameRoot : null;
  doc.createElement = tag => tag === 'canvas' ? canvasElement() : tag === 'img' ? new HostImage() : element(tag);
  doc.createElementNS = (_, tag) => doc.createElement(tag);
  doc.querySelector = selector => selector === 'canvas' ? canvas : selector === '#game' ? gameRoot : null;
  doc.elementFromPoint = (x, y) => x >= 0 && y >= 0 && x < win.innerWidth && y < win.innerHeight ? canvas : null;
  doc.getElementsByTagName = tag => tag === 'canvas' ? [canvas] : tag === 'body' ? [doc.body] : [];
  class HostCanvas { static [Symbol.hasInstance](value) { return canvases.has(value); } }
  // Phaser uses instanceof to install its WebGL1 extension bridges. The host
  // need not expose browser constructors, so distinguish WebGL1 structurally.
  class HostWebGL { static [Symbol.hasInstance](value) { return !!value?.getExtension && !value.texStorage2D; } }
  const resourceErrors = [];
  function recordResourceError(kind, path, error) {
    const detail = error?.errMsg || error?.message || error?.detail?.errMsg || String(error?.type || error || 'unknown');
    const record = { kind, path, detail, code: error?.errNo ?? error?.errCode };
    resourceErrors.push(record);
    console.error('[wechat-resource]', JSON.stringify(record));
  }
  function HostImage() {
    const image = api.createImage();
    images.add(image);
    image.addEventListener?.('error', event => recordResourceError('image', image.src, event));
    return image;
  }
  Object.defineProperty(HostImage, Symbol.hasInstance, { value: value => images.has(value) });

  class HostXHR {
    constructor() { this.responseType = ''; this.readyState = 0; this.status = 0; this.headers = {}; }
    open(method, url) { this.method = method; this.url = url.replace(/^\.\//, ''); this.readyState = 1; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    overrideMimeType() {}
    getAllResponseHeaders() { return ''; }
    getResponseHeader() { return null; }
    abort() { this.aborted = true; clearTimeout(this.timer); this.task?.abort?.(); }
    send(data) {
      const fail = error => {
        if (this.aborted || this.done) return;
        this.done = true; clearTimeout(this.timer);
        recordResourceError('readFile', this.url, error);
        this.onerror?.({ target: this, error });
      };
      const success = (data, status = 200) => {
        if (this.aborted || this.done) return;
        this.done = true; clearTimeout(this.timer);
        this.status = status; this.readyState = 4;
        this.response = data;
        this.responseText = typeof data === 'string' ? data : '';
        this.onreadystatechange?.({ target: this });
        this.onload?.({ target: this });
      };
      if (this.timeout > 0) this.timer = setTimeout(() => {
        if (this.done || this.aborted) return;
        this.done = true; this.task?.abort?.(); this.ontimeout?.({ target: this });
      }, this.timeout);
      try {
        if (/^https?:\/\//.test(this.url)) {
          this.task = api.request({ url: this.url, method: this.method, data, header: this.headers,
            responseType: this.responseType === 'arraybuffer' ? 'arraybuffer' : 'text', dataType: 'text',
            success: result => success(result.data, result.statusCode), fail });
        } else {
          api.getFileSystemManager().readFile({ filePath: this.url,
            ...(this.responseType === 'arraybuffer' ? {} : { encoding: 'utf8' }),
            success: result => success(result.data), fail });
        }
      } catch (error) { fail(error); }
    }
  }
  const storage = {
    getItem(key) { const value = api.getStorageSync(key); return value === '' || value == null ? null : String(value); },
    setItem(key, value) { api.setStorageSync(key, String(value)); },
    removeItem(key) { api.removeStorageSync(key); },
  };
  const globals = {
    window: win, self: win, document: doc, Image: HostImage, HTMLImageElement: HostImage,
    HTMLCanvasElement: HostCanvas, HTMLElement: Object,
    CanvasRenderingContext2D: function () {}, WebGLRenderingContext: HostWebGL,
    Event: HostEvent, CustomEvent: HostEvent, XMLHttpRequest: HostXHR, localStorage: storage,
    URLSearchParams: root.URLSearchParams || HostSearchParams,
    navigator: { userAgent: /ios/i.test(info.platform) ? 'iPhone' : 'Android',
      appVersion: String(info.system || ''),
      platform: info.platform, language: 'zh-CN', languages: ['zh-CN'], maxTouchPoints: 5 },
    location: { href: 'game.js', search: '', protocol: 'file:' },
    // ScaleManager reads bare screen; GetScreenOrientation reads window.screen.
    // Share this object on both namespaces before Phaser boots.
    screen: { width: info.screenWidth || width, height: info.screenHeight || height },
    performance: root.performance || { now: () => Date.now() },
    requestAnimationFrame: root.requestAnimationFrame?.bind(root) || canvas.requestAnimationFrame?.bind(canvas),
    cancelAnimationFrame: root.cancelAnimationFrame?.bind(root) || canvas.cancelAnimationFrame?.bind(canvas),
  };
  Object.assign(win, globals, { innerWidth: width, innerHeight: height,
    devicePixelRatio: info.pixelRatio || 1,
    pageXOffset: 0, pageYOffset: 0, focus() {}, scrollTo() {},
    setTimeout: (...args) => setTimeout(...args), clearTimeout: id => clearTimeout(id),
    setInterval: (...args) => setInterval(...args), clearInterval: id => clearInterval(id),
    getComputedStyle: node => ({ ...node.style, getPropertyValue: key => node.style[key] || '' }),
  });
  // WeChat exposes WebAudio through createWebAudioContext.
  if (api.createWebAudioContext) win.AudioContext = function () { return api.createWebAudioContext(); };
  Object.assign(root, globals);
  for (const [hook, type] of [['onTouchStart', 'touchstart'], ['onTouchMove', 'touchmove'],
    ['onTouchEnd', 'touchend'], ['onTouchCancel', 'touchcancel']]) {
    api[hook]?.(event => {
      const points = list => (list || []).map(point => ({ ...point,
        clientX: point.clientX ?? point.x, clientY: point.clientY ?? point.y,
        pageX: point.clientX ?? point.x, pageY: point.clientY ?? point.y, target: canvas }));
      canvas.dispatchEvent(new HostEvent(type, { touches: points(event.touches),
        changedTouches: points(event.changedTouches), target: canvas, timeStamp: event.timeStamp || Date.now() }));
    });
  }
  const visibility = hidden => {
    doc.hidden = hidden; doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.dispatchEvent(new HostEvent('visibilitychange'));
    win.dispatchEvent(new HostEvent(hidden ? 'blur' : 'focus'));
  };
  api.onHide?.(() => visibility(true));
  api.onShow?.(() => visibility(false));
  api.onWindowResize?.(({ windowWidth, windowHeight }) => {
    win.innerWidth = windowWidth; win.innerHeight = windowHeight;
    for (const node of [doc.body, doc.documentElement, gameRoot]) {
      node.clientWidth = windowWidth; node.clientHeight = windowHeight;
    }
    win.dispatchEvent(new HostEvent('resize'));
  });
  api.setKeepScreenOn?.({ keepScreenOn: true });
  let capsule;
  try { capsule = api.getMenuButtonBoundingClientRect?.(); } catch (_) {}
  const runtime = { canvas, context, webgl, info, capsule, resourceErrors };
  root.__HORDE_MINIGAME__ = runtime;
  return runtime;
}
