export type FixtureFormat = 'litegraph' | 'native'

export type FixtureSize = 's' | 'm' | 'l' | 'xl' | 'xxl'

export interface FixtureRecord {
  id: string
  format: FixtureFormat
  size: FixtureSize
  path: string
  nodes: number
  links: number
  bytes: number
  source: string
  license: string
  description: string
}

export const MANIFEST: readonly FixtureRecord[] = [
  {
    id: 'litegraph/s-basic',
    format: 'litegraph',
    size: 's',
    path: 'fixtures/litegraph/s-basic.json',
    nodes: 11,
    links: 76,
    bytes: 8887,
    source:
      'https://github.com/wyrde/wyrde-comfyui-workflows/blob/main/basics/building-up/basic-workflow-v03.json',
    license: 'MIT',
    description: 'Smallest sanity-check workflow. Useful for unit tests and quick render checks.',
  },
  {
    id: 'litegraph/m-lora-upscale',
    format: 'litegraph',
    size: 'm',
    path: 'fixtures/litegraph/m-lora-upscale.json',
    nodes: 26,
    links: 113,
    bytes: 21387,
    source:
      'https://github.com/wyrde/wyrde-comfyui-workflows/blob/main/basics/building-up/basic-wf-vae-lora-latemt-upscale-x2.json',
    license: 'MIT',
    description: 'Realistic single-image workflow with LoRA and 2× latent upscale.',
  },
  {
    id: 'litegraph/l-token-random',
    format: 'litegraph',
    size: 'l',
    path: 'fixtures/litegraph/l-token-random.json',
    nodes: 79,
    links: 88,
    bytes: 63001,
    source:
      'https://github.com/wyrde/wyrde-comfyui-workflows/blob/main/basics/token-random-example/token%20random%20values%20example.json',
    license: 'MIT',
    description: 'Mid-size workflow with branching prompts and token shuffling. Multiple groups.',
  },
  {
    id: 'litegraph/xl-model-compare',
    format: 'litegraph',
    size: 'xl',
    path: 'fixtures/litegraph/xl-model-compare.json',
    nodes: 171,
    links: 374,
    bytes: 136933,
    source:
      'https://github.com/wyrde/wyrde-comfyui-workflows/blob/main/compare/model-vae/model-compare-hrf-pixel-v0.3.json',
    license: 'MIT',
    description: 'Model/VAE comparison grid. Stresses connection density.',
  },
  {
    id: 'litegraph/xxl-prompt-diff',
    format: 'litegraph',
    size: 'xxl',
    path: 'fixtures/litegraph/xxl-prompt-diff.json',
    nodes: 230,
    links: 702,
    bytes: 363407,
    source:
      'https://github.com/wyrde/wyrde-comfyui-workflows/blob/main/compare/prompts-x4/compare-prompt-diff-x4-v0.8-lora.json',
    license: 'MIT',
    description:
      'Canonical stress benchmark. 230 nodes / 702 links across a 4-way prompt-diff comparison with LoRA branches.',
  },
] as const
