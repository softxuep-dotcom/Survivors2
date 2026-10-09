import { getLocale, t } from '../i18n.js';

// 当前微信包面向手机触屏；其他发行版保留原有的鼠标/键盘提示。
export const TOUCH_ONLY_HINTS = typeof __GAME_PORTAL__ === 'string' && __GAME_PORTAL__ === 'wechat';

const TOUCH_HINTS = {
  en: {
    'menu.howto': 'Touch and drag to move · weapons fire automatically',
    'tutorial.move': 'Touch and drag anywhere on the screen to move',
  },
  'zh-CN': {
    'menu.howto': '按住屏幕拖动移动，武器自动攻击',
    'tutorial.move': '按住屏幕任意位置，拖动控制角色移动',
  },
  fr: {
    'menu.howto': 'Maintenez et faites glisser pour vous déplacer · attaques automatiques',
    'tutorial.move': 'Maintenez le doigt sur l’écran et faites-le glisser pour vous déplacer',
  },
  it: {
    'menu.howto': 'Tocca e trascina per muoverti · attacchi automatici',
    'tutorial.move': 'Tieni premuto lo schermo e trascina per muovere il personaggio',
  },
  de: {
    'menu.howto': 'Zum Bewegen gedrückt halten und ziehen · automatischer Angriff',
    'tutorial.move': 'Halte den Finger auf dem Bildschirm und ziehe ihn, um dich zu bewegen',
  },
  es: {
    'menu.howto': 'Mantén pulsado y arrastra para moverte · ataque automático',
    'tutorial.move': 'Mantén pulsada cualquier zona de la pantalla y arrastra para moverte',
  },
  tr: {
    'menu.howto': 'Basılı tutup sürükleyerek hareket et · silahlar otomatik ateş eder',
    'tutorial.move': 'Hareket etmek için ekranda basılı tut ve parmağını sürükle',
  },
  ja: {
    'menu.howto': '画面を押したままドラッグで移動・武器は自動攻撃',
    'tutorial.move': '画面の好きな場所を押したままドラッグしてキャラクターを移動',
  },
  ko: {
    'menu.howto': '화면을 누른 채 드래그하여 이동 · 무기는 자동 공격',
    'tutorial.move': '화면의 아무 곳이나 누른 채 드래그하여 캐릭터를 이동하세요',
  },
  'pt-BR': {
    'menu.howto': 'Toque e arraste para mover · armas atacam automaticamente',
    'tutorial.move': 'Toque e segure em qualquer lugar da tela e arraste para mover',
  },
  ru: {
    'menu.howto': 'Удерживайте и перетаскивайте для движения · автоматическая атака',
    'tutorial.move': 'Коснитесь экрана и ведите пальцем, чтобы двигать персонажа',
  },
};

export function controlHint(key) {
  return (TOUCH_ONLY_HINTS && TOUCH_HINTS[getLocale()]?.[key]) || t(key);
}
