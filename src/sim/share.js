// 场景分享：把场景压成 URL 的 hash（纯静态部署也能分享，不需要后端）
function toB64(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(s)
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeScene(items) {
  return toB64(JSON.stringify(items))
}
export function decodeScene(code) {
  try {
    const items = JSON.parse(fromB64(code))
    return Array.isArray(items) && items.length ? items : null
  } catch { return null }
}
export function sceneFromHash(hash = location.hash) {
  const m = /[#&]scene=([^&]+)/.exec(hash || '')
  return m ? decodeScene(m[1]) : null
}
export function buildShareUrl(items, href = location.href) {
  const u = new URL(href)
  u.hash = 'scene=' + encodeScene(items)
  return u.toString()
}
