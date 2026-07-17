export const UI_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
export const UI_FONT_BOLD = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial Black, sans-serif';

export function isPortrait(scene) {
  return scene.scale.height > scene.scale.width * 1.12;
}

export function mobileSafeArea(scene) {
  const portrait = isPortrait(scene);
  return {
    portrait,
    top: portrait ? 18 : 10,
    bottom: portrait ? 14 : 10,
    side: portrait ? 14 : 18,
  };
}
