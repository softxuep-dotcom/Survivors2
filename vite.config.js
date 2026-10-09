import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default ({ mode }) => {
  const portal = mode === 'itch'
    ? 'itch'
    : mode === 'gamedistribution'
      ? 'gamedistribution'
      : 'crazygames';
  const outputDirectories = {
    crazygames: 'dist/client',
    gamedistribution: 'dist/gamedistribution',
    itch: 'dist/itch',
  };
  const gdGameId = (process.env.GD_GAME_ID || '').trim();
  if (gdGameId && !/^[a-f0-9]{32}$/iu.test(gdGameId)) {
    throw new Error('GD_GAME_ID must be the 32-character GameDistribution game ID');
  }

  return {
    base: './',
    build: {
      outDir: outputDirectories[portal],
    },
    define: {
      __GAME_VERSION__: JSON.stringify(packageJson.version),
      __GAME_PORTAL__: JSON.stringify(portal),
    },
    plugins: [{
      name: 'horde-spark-portal-html',
      transformIndexHtml(html) {
        const portalMeta = `<meta name="horde-spark:portal" content="${portal}">`;
        const withPortal = html.replace('<meta charset="UTF-8">', `<meta charset="UTF-8">\n${portalMeta}`);
        if (portal === 'crazygames') return withPortal;
        const withoutCrazyGames = withPortal.replace(
          /\s*<script src="https:\/\/sdk\.crazygames\.com\/crazygames-sdk-v3\.js"><\/script>\s*/u,
          '\n',
        );
        if (portal !== 'gamedistribution') return withoutCrazyGames;

        const gameId = gdGameId || '__GD_GAME_ID_REQUIRED__';
        const sdkMarkup = `<script>
window["GD_OPTIONS"] = {
  "gameId": ${JSON.stringify(gameId)},
  "onEvent": function (event) {
    if (typeof window.__GD_EVENT_BRIDGE__ === "function") window.__GD_EVENT_BRIDGE__(event);
    else (window.__GD_EVENT_QUEUE__ = window.__GD_EVENT_QUEUE__ || []).push(event);
  }
};
</script>
<script id="gamedistribution-jssdk" async src="https://html5.api.gamedistribution.com/main.min.js"></script>`;
        return withoutCrazyGames.replace('</head>', `${sdkMarkup}\n</head>`);
      },
    }],
  };
};
