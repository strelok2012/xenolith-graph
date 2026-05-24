/** A believable SDXL txt2img ComfyUI workflow (litegraph export shape) used as the demo's
 *  default graph. Mirrors the canonical checkpoint → encode → sample → decode → save pipeline. */
export const sampleWorkflow = {
  last_node_id: 7,
  last_link_id: 9,
  nodes: [
    {
      id: 1, type: 'CheckpointLoaderSimple', pos: [40, 60], size: [280, 100],
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [1], slot_index: 0 },
        { name: 'CLIP',  type: 'CLIP',  links: [2, 3], slot_index: 1 },
        { name: 'VAE',   type: 'VAE',   links: [8], slot_index: 2 },
      ],
      widgets_values: ['sd_xl_base_1.0.safetensors'],
      properties: {},
    },
    {
      id: 2, type: 'CLIPTextEncode', pos: [380, 40], size: [260, 100],
      inputs: [{ name: 'clip', type: 'CLIP', link: 2 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [4], slot_index: 0 }],
      widgets_values: ['a cinematic castle on a cliff, golden hour'],
      properties: {},
    },
    {
      id: 3, type: 'CLIPTextEncode', pos: [380, 200], size: [260, 100],
      inputs: [{ name: 'clip', type: 'CLIP', link: 3 }],
      outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [5], slot_index: 0 }],
      widgets_values: ['blurry, low quality, watermark'],
      properties: {},
    },
    {
      id: 4, type: 'EmptyLatentImage', pos: [380, 360], size: [260, 100],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [6], slot_index: 0 }],
      widgets_values: [1024, 1024, 1],
      properties: {},
    },
    {
      id: 5, type: 'KSampler', pos: [700, 120], size: [280, 200],
      inputs: [
        { name: 'model', type: 'MODEL', link: 1 },
        { name: 'positive', type: 'CONDITIONING', link: 4 },
        { name: 'negative', type: 'CONDITIONING', link: 5 },
        { name: 'latent_image', type: 'LATENT', link: 6 },
      ],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [7], slot_index: 0 }],
      widgets_values: [156680208700286, 'randomize', 20, 8, 'euler', 'normal', 1],
      properties: {},
    },
    {
      id: 6, type: 'VAEDecode', pos: [1040, 120], size: [220, 80],
      inputs: [
        { name: 'samples', type: 'LATENT', link: 7 },
        { name: 'vae', type: 'VAE', link: 8 },
      ],
      outputs: [{ name: 'IMAGE', type: 'IMAGE', links: [9], slot_index: 0 }],
      properties: {},
    },
    {
      id: 7, type: 'SaveImage', pos: [1320, 120], size: [240, 100],
      inputs: [{ name: 'images', type: 'IMAGE', link: 9 }],
      widgets_values: ['ComfyUI'],
      properties: {},
    },
  ],
  links: [
    [1, 1, 0, 5, 0, 'MODEL'],
    [2, 1, 1, 2, 0, 'CLIP'],
    [3, 1, 1, 3, 0, 'CLIP'],
    [4, 2, 0, 5, 1, 'CONDITIONING'],
    [5, 3, 0, 5, 2, 'CONDITIONING'],
    [6, 4, 0, 5, 3, 'LATENT'],
    [7, 5, 0, 6, 0, 'LATENT'],
    [8, 1, 2, 6, 1, 'VAE'],
    [9, 6, 0, 7, 0, 'IMAGE'],
  ],
}
