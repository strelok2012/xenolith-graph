declare const NodeIdBrand: unique symbol
declare const EdgeIdBrand: unique symbol
declare const PinIdBrand: unique symbol
declare const CommentIdBrand: unique symbol
declare const TypeIdBrand: unique symbol

export type NodeId    = string & { readonly [NodeIdBrand]: true }
export type EdgeId    = string & { readonly [EdgeIdBrand]: true }
export type PinId     = string & { readonly [PinIdBrand]: true }
export type CommentId = string & { readonly [CommentIdBrand]: true }
export type TypeId    = string & { readonly [TypeIdBrand]: true }

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let lastIssuedMs = 0n

function uuidV7(): string {
  const now = BigInt(Date.now())
  const ms = now > lastIssuedMs ? now : lastIssuedMs + 1n
  lastIssuedMs = ms

  const bytes = new Uint8Array(16)
  bytes[0] = Number((ms >> 40n) & 0xffn)
  bytes[1] = Number((ms >> 32n) & 0xffn)
  bytes[2] = Number((ms >> 24n) & 0xffn)
  bytes[3] = Number((ms >> 16n) & 0xffn)
  bytes[4] = Number((ms >> 8n) & 0xffn)
  bytes[5] = Number(ms & 0xffn)
  crypto.getRandomValues(bytes.subarray(6))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex: string[] = []
  for (let i = 0; i < 16; i++) hex.push((bytes[i] ?? 0).toString(16).padStart(2, '0'))
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export function createNodeId(): NodeId       { return uuidV7() as NodeId }
export function createEdgeId(): EdgeId       { return uuidV7() as EdgeId }
export function createPinId(): PinId         { return uuidV7() as PinId }
export function createCommentId(): CommentId { return uuidV7() as CommentId }
export function createTypeId(value: string): TypeId { return value as TypeId }

export function isUuidV7(value: unknown): boolean {
  return typeof value === 'string' && UUID_V7_PATTERN.test(value)
}
