/// <reference types="vite/client" />

declare module 'gifenc' {
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array<ArrayBuffer>,
      width: number,
      height: number,
      opts?: { palette?: number[][]; delay?: number; transparent?: boolean },
    ): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
  }
  export function GIFEncoder(): GifEncoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): number[][]
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][]): Uint8Array<ArrayBuffer>
}
