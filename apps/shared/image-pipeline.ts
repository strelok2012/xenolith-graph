// A tiny real WebGL image pipeline used by ImagePipelineDemo. Each filter node is one GLSL
// fragment pass; the runner chains them with ping-pong framebuffers (source → pass → pass → … →
// canvas) and hands back a PNG data URL. GLSL ES 1.00, single fullscreen triangle, no deps.

export interface Filter {
  type: string
  title: string
  /** Slider widgets shown on the node; values live in node.state keyed by `key`. */
  widgets: { id: string; label: string; type: 'slider'; key: string; min: number; max: number; step: number; freeFloating?: boolean }[]
  /** Default state for a freshly-instantiated node. */
  defaults: Record<string, number>
  /** GLSL declarations (uniforms) injected before main(). */
  uniforms: string
  /** GLSL body that mutates `vec4 c` (the current pixel, pre-sampled from u_tex at v_uv). */
  body: string
  /** Push this node's state into the program's uniforms for one pass. */
  setUniforms(gl: WebGLRenderingContext, prog: WebGLProgram, state: Record<string, unknown>): void
}

const num = (s: Record<string, unknown>, k: string, d: number): number =>
  typeof s[k] === 'number' ? (s[k] as number) : d

function f1(gl: WebGLRenderingContext, prog: WebGLProgram, name: string, v: number): void {
  const loc = gl.getUniformLocation(prog, name)
  if (loc) gl.uniform1f(loc, v)
}

export const FILTERS: Record<string, Filter> = {
  Exposure: {
    type: 'Exposure', title: 'Exposure',
    widgets: [{ id: 'amt', label: 'EV', type: 'slider', key: 'amt', min: -2, max: 2, step: 0.01, freeFloating: true }],
    defaults: { amt: 0.25 },
    uniforms: 'uniform float u_amt;',
    body: 'c.rgb *= exp2(u_amt);',
    setUniforms: (gl, p, s) => f1(gl, p, 'u_amt', num(s, 'amt', 0)),
  },
  Saturation: {
    type: 'Saturation', title: 'Saturation',
    widgets: [{ id: 'amt', label: 'Amount', type: 'slider', key: 'amt', min: 0, max: 2, step: 0.01, freeFloating: true }],
    defaults: { amt: 1.45 },
    uniforms: 'uniform float u_amt;',
    body: 'float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)); c.rgb = mix(vec3(l), c.rgb, u_amt);',
    setUniforms: (gl, p, s) => f1(gl, p, 'u_amt', num(s, 'amt', 1)),
  },
  Hue: {
    type: 'Hue', title: 'Hue rotate',
    widgets: [{ id: 'amt', label: 'Degrees', type: 'slider', key: 'amt', min: -180, max: 180, step: 1, freeFloating: true }],
    defaults: { amt: 25 },
    uniforms: 'uniform float u_amt;',
    body: [
      'const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);',
      'const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);',
      'vec3 yiq = toYIQ * c.rgb;',
      'float hue = atan(yiq.z, yiq.y) + u_amt;',
      'float chroma = length(yiq.yz);',
      'yiq.y = chroma * cos(hue); yiq.z = chroma * sin(hue);',
      'c.rgb = toRGB * yiq;',
    ].join('\n'),
    setUniforms: (gl, p, s) => f1(gl, p, 'u_amt', (num(s, 'amt', 0) * Math.PI) / 180),
  },
  Blur: {
    type: 'Blur', title: 'Gaussian blur',
    widgets: [{ id: 'amt', label: 'Radius', type: 'slider', key: 'amt', min: 0, max: 5, step: 0.1, freeFloating: true }],
    defaults: { amt: 1.2 },
    uniforms: 'uniform float u_amt;',
    body: [
      'vec2 o = u_texel * u_amt;',
      'vec4 s = texture2D(u_tex, v_uv) * 4.0;',
      's += texture2D(u_tex, v_uv + vec2( o.x, 0.0)) * 2.0;',
      's += texture2D(u_tex, v_uv + vec2(-o.x, 0.0)) * 2.0;',
      's += texture2D(u_tex, v_uv + vec2(0.0,  o.y)) * 2.0;',
      's += texture2D(u_tex, v_uv + vec2(0.0, -o.y)) * 2.0;',
      's += texture2D(u_tex, v_uv + vec2( o.x,  o.y));',
      's += texture2D(u_tex, v_uv + vec2(-o.x,  o.y));',
      's += texture2D(u_tex, v_uv + vec2( o.x, -o.y));',
      's += texture2D(u_tex, v_uv + vec2(-o.x, -o.y));',
      'c = s / 16.0;',
    ].join('\n'),
    setUniforms: (gl, p, s) => f1(gl, p, 'u_amt', num(s, 'amt', 0)),
  },
  Vignette: {
    type: 'Vignette', title: 'Vignette',
    widgets: [{ id: 'amt', label: 'Amount', type: 'slider', key: 'amt', min: 0, max: 1, step: 0.01, freeFloating: true }],
    defaults: { amt: 0.55 },
    uniforms: 'uniform float u_amt;',
    body: [
      'vec2 d = v_uv - 0.5;',
      'float vig = smoothstep(0.8, 0.25, length(d) * 1.4);',
      'c.rgb *= mix(1.0, vig, u_amt);',
    ].join('\n'),
    setUniforms: (gl, p, s) => f1(gl, p, 'u_amt', num(s, 'amt', 0)),
  },
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const PASSTHROUGH = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
void main() { gl_FragColor = texture2D(u_tex, v_uv); }`

function fragFor(filter: Filter): string {
  return `precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
${filter.uniforms}
void main() {
  vec4 c = texture2D(u_tex, v_uv);
${filter.body}
  gl_FragColor = c;
}`
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile failed: ' + gl.getShaderInfoLog(sh))
  }
  return sh
}

/** A reusable WebGL image-filter runner. Create once, call `run` per pipeline evaluation. */
export class ImagePipelineRunner {
  readonly #canvas: HTMLCanvasElement
  readonly #gl: WebGLRenderingContext
  readonly #programs = new Map<string, WebGLProgram>() // fragment src → program
  readonly #vert: WebGLShader
  #w = 0
  #h = 0
  #fbo: WebGLFramebuffer[] = []
  #tex: WebGLTexture[] = []

  constructor() {
    this.#canvas = document.createElement('canvas')
    const gl = this.#canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    if (!gl) throw new Error('WebGL unavailable')
    this.#gl = gl
    this.#vert = compile(gl, gl.VERTEX_SHADER, VERT)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  }

  #program(fragSrc: string): WebGLProgram {
    const cached = this.#programs.get(fragSrc)
    if (cached) return cached
    const gl = this.#gl
    const prog = gl.createProgram()!
    gl.attachShader(prog, this.#vert)
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragSrc))
    gl.bindAttribLocation(prog, 0, 'a_pos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('program link failed: ' + gl.getProgramInfoLog(prog))
    }
    this.#programs.set(fragSrc, prog)
    return prog
  }

  #resize(w: number, h: number): void {
    if (w === this.#w && h === this.#h && this.#tex.length) return
    const gl = this.#gl
    this.#canvas.width = w
    this.#canvas.height = h
    for (const t of this.#tex) gl.deleteTexture(t)
    for (const f of this.#fbo) gl.deleteFramebuffer(f)
    this.#tex = []
    this.#fbo = []
    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      this.#tex.push(tex)
      this.#fbo.push(fbo)
    }
    this.#w = w
    this.#h = h
  }

  /** Run the chain of filters over `image` and return the result as a PNG data URL. */
  run(image: HTMLImageElement, passes: { filter: Filter; state: Record<string, unknown> }[]): string {
    const gl = this.#gl
    const w = image.naturalWidth || image.width
    const h = image.naturalHeight || image.height
    this.#resize(w, h)

    // Upload the source flipped so it renders upright through the framebuffer chain to the canvas.
    const srcTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, srcTex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.viewport(0, 0, w, h)

    const list = passes.length ? passes : [{ filter: null as Filter | null, state: {} }]
    let input = srcTex
    for (let i = 0; i < list.length; i++) {
      const last = i === list.length - 1
      const entry = list[i]!
      const prog = this.#program(entry.filter ? fragFor(entry.filter) : PASSTHROUGH)
      gl.useProgram(prog)
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : this.#fbo[i % 2]!)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, input)
      const texLoc = gl.getUniformLocation(prog, 'u_tex')
      if (texLoc) gl.uniform1i(texLoc, 0)
      const texelLoc = gl.getUniformLocation(prog, 'u_texel')
      if (texelLoc) gl.uniform2f(texelLoc, 1 / w, 1 / h)
      if (entry.filter) entry.filter.setUniforms(gl, prog, entry.state)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      input = this.#tex[i % 2]!
    }

    gl.deleteTexture(srcTex)
    return this.#canvas.toDataURL('image/png')
  }
}

/** Procedurally drawn default source image (no bundled asset) — a colorful test card. */
export function defaultSourceImage(): string {
  const w = 480, h = 320
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#1b2a4a'); g.addColorStop(0.5, '#7a3b9e'); g.addColorStop(1, '#e8a04b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const discs: [number, number, number, string][] = [
    [120, 110, 70, 'rgba(255, 90, 120, 0.85)'],
    [330, 90, 55, 'rgba(80, 220, 200, 0.85)'],
    [250, 220, 85, 'rgba(255, 215, 90, 0.8)'],
    [400, 250, 45, 'rgba(120, 160, 255, 0.85)'],
  ]
  for (const [x, y, r, fill] of discs) {
    ctx.fillStyle = fill
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 3
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo((w / 6) * i, 0); ctx.lineTo((w / 6) * i, h); ctx.stroke() }
  return cv.toDataURL('image/png')
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ─── Framework-agnostic showcase wiring ─────────────────────────────────────────────────────────
// Reused as-is by every framework demo. The only framework-supplied pieces are the two preview
// widget controllers (Source/Result); the schemas, layout, live re-processing and download are shared.

import type { XenolithEditor, NodeSchema, Node } from '@xenolith/editor'
import type { CustomWidgetController } from '@xenolith/render-pixi'
import { reachableFrom } from '@xenolith/core'

export const OUT_RESULT = 'result'

/** Follow the linear chain from the source node and collect the filter nodes (excluding output). */
function chainFilters(editor: XenolithEditor, srcId: string, outId: string): Node[] {
  const edges = [...editor.graph.edges()]
  const out: Node[] = []
  const seen = new Set<string>()
  let cur = srcId
  for (;;) {
    const edge = edges.find((e) => e.from.node === cur)
    if (!edge || edge.to.node === outId || seen.has(edge.to.node)) break
    seen.add(edge.to.node)
    const n = editor.graph.getNode(edge.to.node)
    if (!n) break
    out.push(n as Node)
    cur = edge.to.node
  }
  return out
}

export interface ImagePipelineWidgets {
  input: CustomWidgetController
  output: CustomWidgetController
}

export interface ImagePipelineHandle {
  outputId: string
  process(): Promise<void>
  download(): void
}

/** Register schemas, build the Source → filters → Result chain, wire live re-processing on every
 *  widget change, and return a handle the UI layer drives. Framework-agnostic. */
export function buildImagePipeline(editor: XenolithEditor, widgets: ImagePipelineWidgets): ImagePipelineHandle {
  editor.registerWidget('img-input', widgets.input)
  editor.registerWidget('img-output', widgets.output)

  editor.registry.register({
    type: 'Source', title: 'Source image',
    pins: [{ kind: 'data', direction: 'out', type: 'image', label: 'Out' }],
    widgets: [{ id: 'src', label: '', type: 'custom', renderer: 'img-input', key: 'src', height: 170 }],
  } satisfies NodeSchema)
  editor.registry.register({
    type: 'Output', title: 'Result',
    pins: [{ kind: 'data', direction: 'in', type: 'image', label: 'In' }],
    widgets: [{ id: OUT_RESULT, label: '', type: 'custom', renderer: 'img-output', key: OUT_RESULT, height: 170 }],
  } satisfies NodeSchema)
  const filters = Object.values(FILTERS)
  for (const f of filters) {
    editor.registry.register({
      type: f.type, title: f.title,
      pins: [
        { kind: 'data', direction: 'in', type: 'image', label: 'In' },
        { kind: 'data', direction: 'out', type: 'image', label: 'Out' },
      ],
      widgets: f.widgets,
    })
  }

  const source = editor.registry.instantiate('Source', { x: 0, y: 40 })
  source.size = { x: 300, y: 230 }
  source.state['src'] = defaultSourceImage()
  editor.addNode(source)

  let prev = source
  let prevOut = 0
  filters.forEach((f, i) => {
    const node = editor.registry.instantiate(f.type, { x: 360 + i * 200, y: 110 })
    for (const [k, v] of Object.entries(f.defaults)) node.state[k] = v
    editor.addNode(node)
    editor.connect(prev, prevOut, node, 0)
    prev = node
    prevOut = 1
  })

  const output = editor.registry.instantiate('Output', { x: 360 + filters.length * 200 + 40, y: 40 })
  output.size = { x: 300, y: 230 }
  output.state[OUT_RESULT] = ''
  editor.addNode(output)
  editor.connect(prev, prevOut, output, 0)

  const runner = new ImagePipelineRunner()
  let busy = false
  const process = async (): Promise<void> => {
    if (busy) return
    // If the Output is no longer wired up from the Source (an edge was cut), there is no result to
    // show — clear it. Otherwise the Result node would keep displaying a stale image that can't exist.
    if (!reachableFrom(editor.graph, source.id).has(output.id)) {
      editor.setWidgetValue(output.id, OUT_RESULT, '')
      return
    }
    const src = editor.graph.getNode(source.id)?.state['src']
    if (typeof src !== 'string' || !src) return
    busy = true
    try {
      const img = await loadImage(src)
      const passes = chainFilters(editor, String(source.id), String(output.id)).map((n) => ({ filter: FILTERS[n.type]!, state: n.state }))
      const url = runner.run(img, passes)
      editor.setWidgetValue(output.id, OUT_RESULT, url)
    } catch { /* decode/GL failure — keep the previous result */ } finally { busy = false }
  }

  // Re-process on any change that affects the result: a widget edit, OR the graph topology changing
  // (connect/disconnect/remove) — rewiring the chain (e.g. bypassing a filter) must update the output
  // immediately, not only after the next slider move.
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (): void => { clearTimeout(timer); timer = setTimeout(() => { void process() }, 140) }
  editor.on('widget:changed', (e) => { if (e.widgetId !== OUT_RESULT) schedule() })
  editor.on('edge:connected', schedule)
  editor.on('edge:disconnected', schedule)
  editor.on('node:removed', schedule)
  editor.on('node:added', schedule) // undo of a delete re-adds the node + its edges → re-process

  editor.fitView({ padding: 56, maxZoom: 1 })
  void process()

  const download = (): void => {
    const url = editor.graph.getNode(output.id)?.state[OUT_RESULT]
    if (typeof url !== 'string' || !url) return
    const a = document.createElement('a')
    a.href = url; a.download = 'result.png'
    document.body.appendChild(a); a.click(); a.remove()
  }

  return { outputId: String(output.id), process, download }
}

/** Trigger a PNG download of the current Result node's image. Standalone helper so a host can
 *  wire a Download button via just `useEditor()` — no need to thread a build-handle around. */
export function downloadImageResult(editor: XenolithEditor): void {
  const output = [...editor.graph.nodes()].find((n) => n.type === 'Output')
  if (!output) return
  const url = output.state[OUT_RESULT]
  if (typeof url !== 'string' || !url) return
  const a = document.createElement('a')
  a.href = url; a.download = 'result.png'
  document.body.appendChild(a); a.click(); a.remove()
}
