// AssemblyScript compilation pipeline. Takes the AS source produced by `emit.ts`, hands it to
// `asc` (the AssemblyScript compiler) via its programmatic API, and returns the resulting WASM
// bytes. asc is async, so this function is too.
//
// Build flags: `--optimize` gives release-grade output (Binaryen passes), `--runtime stub` skips
// the AS GC runtime (we don't allocate AS objects in the numeric subset, so we don't need it —
// shaves ~5 KB off the module). `--initialMemory 1` keeps the module's memory section minimal.

import asc from 'assemblyscript/asc'

export interface CompileResult {
  wasm: Uint8Array
  /** AS compiler stdout — useful for debugging when something blows up. */
  stdout: string
  /** AS compiler stderr — actual errors land here. */
  stderr: string
}

/** Compile the given AS source to a WASM binary. Throws if asc reports any error. */
export async function compileAS(source: string): Promise<CompileResult> {
  // Output sinks: asc invokes our `writeFile` for every artefact it generates (.wasm, .wat, .d.ts).
  // We only care about the wasm.
  let wasm: Uint8Array | null = null
  // Buffer stdout/stderr per-compile so concurrent compiles don't interleave.
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const { error } = await asc.main(
    [
      'input.ts',
      '--outFile',       'output.wasm',
      '--runtime',       'stub',         // no GC — numeric subset doesn't allocate
      '--optimize',
      '--optimizeLevel', '3',
      '--shrinkLevel',   '0',
      '--converge',                       // run Binaryen passes to fixpoint
    ],
    {
      stdout: { write: (s: string) => { stdoutChunks.push(s); return true } } as unknown as NodeJS.WriteStream,
      stderr: { write: (s: string) => { stderrChunks.push(s); return true } } as unknown as NodeJS.WriteStream,
      readFile: (name: string, _baseDir: string): string | null => {
        if (name === 'input.ts') return source
        // Returning null tells asc to fall back to its bundled stdlib resolver.
        return null
      },
      writeFile: (name: string, data: Uint8Array | string): void => {
        if (name === 'output.wasm' && data instanceof Uint8Array) wasm = data
      },
      listFiles: (_dir: string, _baseDir: string): string[] | null => null,
    },
  )

  const stdout = stdoutChunks.join('')
  const stderr = stderrChunks.join('')
  if (error) throw new Error(`asc compile failed: ${String(error)}\n${stderr}`)
  if (!wasm) throw new Error(`asc produced no wasm output\n${stderr}`)
  return { wasm, stdout, stderr }
}
