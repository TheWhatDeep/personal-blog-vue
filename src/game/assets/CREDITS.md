# Art Credits

The sprite, tile and font assets in this directory come from freely
licensed packs (free for non-commercial and commercial use):

- **Tiny RPG Character Asset Pack v2.0** by **Zerie** (itch.io) — all
  heroes, most enemies and every boss, with their idle / walk / attack /
  hurt / death animation strips (`rpg/`), plus the arrow projectile.
- **2D Pixel Dungeon Asset Pack v2.0** by **Pixel Poem** (itch.io) —
  dungeon tileset, torches, chests, crates, spike traps, flasks, coins,
  and the wisp flame.
- **2D Dungeon Asset Pack v5.2 (Dungeon Tileset II)** by **Pixel Poem**
  (itch.io) — the connected-wall tileset (caps, faces, corners), prop
  sheet, and the animated torch/gate/spike/chest/coin/key/flag strips
  (`v5/`).
- **Bold Pixels** font (`BoldPixels.ttf`) from itch.io — display typeface
  for titles and headers, rasterized into the texture atlas at its native
  16px grid.

Files were renamed (and a subset selected) for this project; pixels are
unmodified except for palette tints/hue shifts applied at atlas-compose
time.

Everything not present in these packs (spell orbs, skill icons, most item
icons, particles, the compact body font, and all audio) is generated
procedurally at load — see `../gfx/PixelArt.js`, `../gfx/MicroFont.js`
and `../audio/`.
