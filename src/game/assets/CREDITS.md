# Art Credits

The sprite and tile art in this directory comes from two asset packs by
**Pixel Poem** (https://pixel-poem.itch.io/), free for use in
non-commercial and commercial projects:

- **2D Pixel Dungeon Asset Pack v2.0**
  (https://pixel-poem.itch.io/dungeon-assetpuck)
  — dungeon tileset, characters, items, traps and interface art.
- **Enemy Animations Set**
  — the large animated skeleton and vampire sprites used for bosses.

Files were renamed (and a subset selected) for this project; the pixels
are unmodified except for palette tints applied at runtime.

Everything not present in these packs (spell orbs, skill icons, most item
icons, particles, fonts, audio) is generated procedurally at load — see
`../gfx/PixelArt.js` and `../audio/`.
- **Bold Pixels** font (`BoldPixels.ttf`) from itch.io — UI typeface,
  rasterized into the texture atlas at its native 8px grid.
