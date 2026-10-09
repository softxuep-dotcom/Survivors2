# Horde Spark — CrazyGames covers

Final upload files:

- `final/horde-spark-cover-landscape-1920x1080.png`
- `final/horde-spark-cover-portrait-800x1200.png`
- `final/horde-spark-cover-square-800x800.png`

Portal asset variants (JPEG, ready to upload):

- `upload/horde-spark-main-thumbnail-512x384.jpg`
- `upload/horde-spark-main-thumbnail-512x512.jpg`
- `upload/horde-spark-main-thumbnail-200x120.jpg`
- `upload/horde-spark-marketing-1280x720.jpg`
- `upload/horde-spark-marketing-1280x550.jpg`

The 512x384 and 200x120 thumbnails use the compact single-line-title composition
from the itch.io cover so the game name remains readable at small display sizes.
The square asset uses the dedicated square composition. The two marketing assets
use the landscape cover; the 1280x550 banner is top-aligned to preserve the full
title and both characters' faces and attacks.

The unscaled image-generation outputs are retained in `source/`.

## Art direction and prompt set

All three covers use the same storefront identity: a dark emerald haunted forest,
the purple-robed fire witch as the foreground hero, the purple armored boss as a
secondary threat, green slime hordes, cyan experience crystals, and restrained
fire/ice/lightning trails. The title is exactly `HORDE SPARK` in two lines using
ivory-and-gold fantasy display lettering with a violet shadow.

Each aspect ratio was generated as a separate composition rather than cropped:

- Landscape: title upper-left, witch central-left, boss right-middle.
- Portrait: title upper quarter, boss upper-middle, witch lower-middle.
- Square: centered title, boss behind the centered foreground witch.

Common constraints: no border, no UI, no platform/store icons, no promotional
copy, no watermark, no gore, and no text other than the game title.

Generated with the built-in image generation workflow using the project's witch,
boss, slime, and gameplay art as visual references. Final PNGs were resampled to
the exact CrazyGames upload dimensions.

Official specification: <https://docs.crazygames.com/requirements/game-covers/>
