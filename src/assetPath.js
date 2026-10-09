// Mini-game packaging uses PNG images and .txt shader sources. Browser builds
// continue loading the original WebP / GLSL files.
export function assetPath(path) {
  return typeof __GAME_PORTAL__ === 'string' && (__GAME_PORTAL__ === 'douyin' || __GAME_PORTAL__ === 'wechat')
    ? path.replace(/\.webp$/i, '.png').replace(/\.frag$/i, '.txt')
    : path;
}
