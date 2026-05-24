/** Number of nodes / links one SDXL pipeline tile contributes. */
export const NODES_PER_TILE = 7
export const LINKS_PER_TILE = 9

/** Synthetic XXL ComfyUI-shaped workflow for battle-testing at scale. Replicates the full SDXL
 *  pipeline `tiles` times in a grid, every tile fully wired — so the total is `tiles × 7` nodes
 *  and `tiles × 9` links. The stress comes from the tile count: e.g. 200 tiles ⇒ 1400 nodes /
 *  1800 links. Use `xxlWorkflowForNodeCount(n)` to size by target node count instead. */
export function generateXxlWorkflow(tiles: number): {
  nodes: unknown[]
  links: unknown[]
} {
  const nodes: unknown[] = []
  const links: unknown[] = []
  let nid = 0
  let lid = 0
  const cols = Math.ceil(Math.sqrt(tiles))
  const TILE_W = 1700
  const TILE_H = 560

  for (let t = 0; t < tiles; t++) {
    const ox = (t % cols) * TILE_W
    const oy = Math.floor(t / cols) * TILE_H
    const ck = ++nid, pos = ++nid, neg = ++nid, lat = ++nid, ks = ++nid, vd = ++nid, sv = ++nid

    nodes.push(
      { id: ck,  type: 'CheckpointLoaderSimple', pos: [ox + 40, oy + 60], outputs: [
        { name: 'MODEL', type: 'MODEL', slot_index: 0 }, { name: 'CLIP', type: 'CLIP', slot_index: 1 }, { name: 'VAE', type: 'VAE', slot_index: 2 }],
        widgets_values: ['sd_xl_base_1.0.safetensors'] },
      { id: pos, type: 'CLIPTextEncode', pos: [ox + 380, oy + 40], inputs: [{ name: 'clip', type: 'CLIP' }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', slot_index: 0 }], widgets_values: ['a castle'] },
      { id: neg, type: 'CLIPTextEncode', pos: [ox + 380, oy + 200], inputs: [{ name: 'clip', type: 'CLIP' }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', slot_index: 0 }], widgets_values: ['blurry'] },
      { id: lat, type: 'EmptyLatentImage', pos: [ox + 380, oy + 360],
        outputs: [{ name: 'LATENT', type: 'LATENT', slot_index: 0 }], widgets_values: [1024, 1024, 1] },
      { id: ks,  type: 'KSampler', pos: [ox + 700, oy + 120], inputs: [
        { name: 'model', type: 'MODEL' }, { name: 'positive', type: 'CONDITIONING' },
        { name: 'negative', type: 'CONDITIONING' }, { name: 'latent_image', type: 'LATENT' }],
        outputs: [{ name: 'LATENT', type: 'LATENT', slot_index: 0 }], widgets_values: [t, 20, 8] },
      { id: vd,  type: 'VAEDecode', pos: [ox + 1040, oy + 120], inputs: [
        { name: 'samples', type: 'LATENT' }, { name: 'vae', type: 'VAE' }],
        outputs: [{ name: 'IMAGE', type: 'IMAGE', slot_index: 0 }] },
      { id: sv,  type: 'SaveImage', pos: [ox + 1320, oy + 120], inputs: [{ name: 'images', type: 'IMAGE' }] },
    )
    links.push(
      [++lid, ck, 0, ks, 0, 'MODEL'],
      [++lid, ck, 1, pos, 0, 'CLIP'],
      [++lid, ck, 1, neg, 0, 'CLIP'],
      [++lid, pos, 0, ks, 1, 'CONDITIONING'],
      [++lid, neg, 0, ks, 2, 'CONDITIONING'],
      [++lid, lat, 0, ks, 3, 'LATENT'],
      [++lid, ks, 0, vd, 0, 'LATENT'],
      [++lid, ck, 2, vd, 1, 'VAE'],
      [++lid, vd, 0, sv, 0, 'IMAGE'],
    )
  }
  return { nodes, links }
}
