import { useEffect, useRef } from 'react'
import Matter from 'matter-js'
import { registry, setLineScale } from '../sim/registry.js'
import { traceRays } from '../sim/optics.js'
import { hitTest } from '../sim/hit.js'
import { inclineGeom, inTriangle } from '../sim/incline.js'
import { CIRCUIT_TYPES, pins } from '../sim/circuit.js'
import { drawVectors, drawForceAnalysis } from './Vectors.jsx'

const TAP_SLOP = 8    // 屏幕像素：超过它算拖动
const GRID = 10       // 放置吸附栅格


// 线段类元件（电路/光学）选中高亮用的端子
const endsOf = (o) => {
  if (CIRCUIT_TYPES.includes(o.type)) return pins(o)
  const p = o.props || {}, len = p.len ?? 90, a = ((p.angle ?? 0) * Math.PI) / 180
  const dx = (len / 2) * Math.cos(a), dy = (len / 2) * Math.sin(a)
  return [{ x: o.x - dx, y: o.y - dy }, { x: o.x + dx, y: o.y + dy }]
}

const ghostCache = new Map()
function ghostOf(tool) {
  if (ghostCache.has(tool)) return ghostCache.get(tool)
  const reg = registry[tool]
  let g = { kind: 'circle', r: 18 }
  if (reg) {
    const p = reg.defaults()
    if (tool === 'incline') g = { kind: 'tri', len: p.len, angle: p.angle }
    else if (tool === 'track') g = { kind: 'rect', w: p.len, h: 14 }
    else if (p.w && p.h) g = { kind: 'rect', w: p.w, h: p.h }
    else if (p.r) g = { kind: 'circle', r: p.r }
    else if (p.len) g = { kind: 'seg', len: p.len, angle: p.angle ?? 0 }
    else if (tool === 'block') g = { kind: 'rect', w: 50, h: 30 }
    else if (tool === 'ground') g = { kind: 'rect', w: 400, h: 20 }
    else if (tool === 'spring' || tool === 'rope' || tool === 'pulley') g = { kind: 'seg', len: 120, angle: 0 }
  }
  ghostCache.set(tool, g)
  return g
}

export default function SimCanvas(props) {
  const canvasRef = useRef(null)
  const P = useRef(props)
  P.current = props
  const trailRef = useRef({})
  const hoverRef = useRef(null)
  const epochRef = useRef(props.epoch)

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv.getContext('2d')
    let dpr = Math.min(2, window.devicePixelRatio || 1)   // 上限 2，手机上 3x 屏逐帧重绘会明显掉帧
    const view = { scale: 1, tx: 0, ty: 0 }

    const resize = () => {
      const r = cv.parentElement.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      cv.style.width = r.width + 'px'
      cv.style.height = r.height + 'px'
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv.parentElement)

    const screenOf = (e) => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const worldOf = (s) => ({ x: (s.x - view.tx) / view.scale, y: (s.y - view.ty) / view.scale })
    const snap = (v) => Math.round(v / GRID) * GRID

    const zoomAt = (sx, sy, k0) => {
      const ns = Math.min(4, Math.max(0.3, view.scale * k0))
      const k = ns / view.scale
      view.tx = sx - (sx - view.tx) * k
      view.ty = sy - (sy - view.ty) * k
      view.scale = ns
    }

    // —— 手势状态机 ——
    // idle | pan（拖空白处平移视角）| press（按住元件待判）| drag（拖元件）| pinch（双指缩放）
    const pointers = new Map()
    let mode = 'idle'
    let objDrag = null      // { id, dx, dy, sx, sy, moved }
    let pan = null          // { sx, sy, tx, ty, moved }
    let tapObj = null
    let pinchPrev = null

    const posOf = (o) => (o.body ? o.body.position : o)

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button > 0) return
      try { cv.setPointerCapture(e.pointerId) } catch { /* 忽略 */ }
      const s = screenOf(e)
      pointers.set(e.pointerId, s)

      if (pointers.size === 2) {
        mode = 'pinch'; objDrag = null; pan = null; tapObj = null
        const [a, b] = [...pointers.values()]
        pinchPrev = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
        return
      }
      if (pointers.size > 2) return

      const w = worldOf(s)
      const o = hitTest(P.current.sim.objsRef.current, w.x, w.y, (e.pointerType === 'touch' ? 18 : 6) / view.scale)
      tapObj = o
      if (o) {
        const bp = posOf(o)
        objDrag = { id: o.id, dx: bp.x - w.x, dy: bp.y - w.y, sx: s.x, sy: s.y, moved: false }
        pan = null
        mode = 'press'
      } else {
        objDrag = null
        pan = { sx: s.x, sy: s.y, tx: view.tx, ty: view.ty, moved: false }
        mode = 'pan'
      }
      cv.style.cursor = 'grabbing'
    }

    const onMove = (e) => {
      const s = screenOf(e)
      if (!pointers.has(e.pointerId)) {
        hoverRef.current = worldOf(s)
        cv.style.cursor = P.current.tool !== 'select' ? 'crosshair' : 'grab'
        return
      }
      pointers.set(e.pointerId, s)
      hoverRef.current = worldOf(s)

      if (mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
        if (pinchPrev) {
          zoomAt(cx, cy, d / pinchPrev.d)
          view.tx += cx - pinchPrev.cx
          view.ty += cy - pinchPrev.cy
        }
        pinchPrev = { d, cx, cy }
        return
      }

      if (mode === 'pan' && pan) {
        const dx = s.x - pan.sx, dy = s.y - pan.sy
        if (!pan.moved && Math.hypot(dx, dy) > TAP_SLOP) pan.moved = true
        if (pan.moved) { view.tx = pan.tx + dx; view.ty = pan.ty + dy }
        return
      }

      if (objDrag) {
        if (!objDrag.moved && Math.hypot(s.x - objDrag.sx, s.y - objDrag.sy) > TAP_SLOP) {
          objDrag.moved = true; mode = 'drag'
        }
        if (objDrag.moved) {
          const w = worldOf(s)
          P.current.sim.dragTo(objDrag.id, w.x + objDrag.dx, w.y + objDrag.dy)
        }
      }
    }

    const finish = (e, cancelled) => {
      const s = screenOf(e)
      pointers.delete(e.pointerId)
      const touch = e.pointerType !== 'mouse'
      if (mode === 'pinch') {
        if (pointers.size < 2) { mode = 'idle'; pinchPrev = null; objDrag = null; pan = null; tapObj = null }
        return
      }
      if (cancelled) { objDrag = null; pan = null; tapObj = null; mode = 'idle'; if (touch) hoverRef.current = null; return }

      const tool = P.current.tool
      const placing = tool && tool !== 'select'
      const movedByPan = pan?.moved
      const movedByDrag = objDrag?.moved

      if (mode === 'pan') {
        if (!movedByPan) {
          if (placing) {
            const w = worldOf(s)
            P.current.onPlace?.(snap(w.x), snap(w.y))
          } else P.current.onSelectEmpty?.()
        }
      } else if (mode === 'press' || mode === 'drag') {
        if (!movedByDrag) {
          if (placing) {
            const w = worldOf(s)
            P.current.onPlace?.(snap(w.x), snap(w.y))
          } else if (tapObj) P.current.onTap?.(tapObj.id)
        } else if (tapObj) {
          // 拖动结束：选中它，方便看参数
          P.current.onTap?.(tapObj.id)
        }
      }
      objDrag = null; pan = null; tapObj = null; mode = 'idle'
      if (touch) hoverRef.current = null
      cv.style.cursor = P.current.tool !== 'select' ? 'crosshair' : 'grab'
    }

    const onUp = (e) => finish(e, false)
    const onCancel = (e) => finish(e, true)

    const wheel = (e) => {
      e.preventDefault()
      const s = screenOf(e)
      zoomAt(s.x, s.y, e.deltaY < 0 ? 1.12 : 1 / 1.12)
    }

    const onLeave = (e) => { if (!pointers.has(e.pointerId)) hoverRef.current = null }

    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onCancel)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', wheel, { passive: false })
    cv.addEventListener('contextmenu', (e) => e.preventDefault())

    const onZoom = (ev) => zoomAt(cv.clientWidth / 2, cv.clientHeight / 2, ev.detail)
    const onZoomReset = () => { view.scale = 1; view.tx = 0; view.ty = 0 }
    const onZoomFit = () => {
      const objs = P.current.sim.objsRef.current || []
      const cv = canvasRef.current
      if (!cv) return
      const cw = cv.clientWidth, ch = cv.clientHeight
      if (!objs.length) { view.scale = 1; view.tx = 0; view.ty = 0; return }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const o of objs) {
        let x0, y0, x1, y1
        if (o.body) {
          const b = o.body.bounds
          x0 = b.min.x; y0 = b.min.y; x1 = b.max.x; y1 = b.max.y
        } else {
          const ext = o.props?.len ?? o.props?.w ?? 90
          x0 = o.x - ext / 2 - 20; x1 = o.x + ext / 2 + 20
          y0 = o.y - ext / 2 - 20; y1 = o.y + ext / 2 + 20
        }
        if (x0 < minX) minX = x0
        if (y0 < minY) minY = y0
        if (x1 > maxX) maxX = x1
        if (y1 > maxY) maxY = y1
      }
      if (!isFinite(minX)) return
      const bw = Math.max(1, maxX - minX), bh = Math.max(1, maxY - minY)
      const sc = Math.min(3, Math.max(0.3, Math.min(cw / (bw + 90), ch / (bh + 90))))
      view.scale = sc
      view.tx = cw / 2 - (minX + maxX) / 2 * sc
      view.ty = ch / 2 - (minY + maxY) / 2 * sc
    }
    window.addEventListener('sim-zoom', onZoom)
    window.addEventListener('sim-zoom-reset', onZoomReset)
    window.addEventListener('sim-fit', onZoomFit)

    let raf, frame = 0
    const loop = () => {
      const w = cv.width / dpr, h = cv.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.tx, dpr * view.ty)

      // 网格
      const x0 = -view.tx / view.scale, y0 = -view.ty / view.scale
      const x1 = x0 + w / view.scale, y1 = y0 + h / view.scale
      ctx.lineWidth = 1 / view.scale
      ctx.strokeStyle = 'rgba(255,255,255,.045)'
      for (let gx = Math.floor(x0 / 40) * 40; gx < x1; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke() }
      for (let gy = Math.floor(y0 / 40) * 40; gy < y1; gy += 40) { ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke() }
      ctx.strokeStyle = 'rgba(255,255,255,.075)'
      for (let gx = Math.floor(x0 / 200) * 200; gx < x1; gx += 200) { ctx.beginPath(); ctx.moveTo(gx, y0); ctx.lineTo(gx, y1); ctx.stroke() }
      for (let gy = Math.floor(y0 / 200) * 200; gy < y1; gy += 200) { ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke() }

      if (epochRef.current !== P.current.epoch) { epochRef.current = P.current.epoch; trailRef.current = {} }
      const objs = P.current.sim.objsRef.current
      const running = P.current.sim.running

      if (running && (frame++ % 3 === 0)) {
        for (const o of objs) {
          if (!o.body || o.body.isStatic) continue
          const tr = (trailRef.current[o.id] ||= [])
          tr.push({ x: o.body.position.x, y: o.body.position.y })
          if (tr.length > 220) tr.shift()
        }
      }
      for (const tr of Object.values(trailRef.current)) {
        if (tr.length < 2) continue
        ctx.strokeStyle = 'rgba(56,189,248,.32)'; ctx.lineWidth = 1.6 / view.scale
        ctx.beginPath(); ctx.moveTo(tr[0].x, tr[0].y)
        for (const p of tr) ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      ctx.lineWidth = 1 / view.scale
      setLineScale(view.scale)

      for (const o of objs) {
        if (o.type === 'incline') drawIncline(ctx, o, P.current.selectedId, view.scale)
        else if (o.body) {
          if (o.type !== 'pulley') drawBody(ctx, o, P.current.selectedId, view.scale)
          registry[o.type]?.overlay?.(ctx, o, objs)   // pulley 有 body 也画自定义轮体外观
        }
        else registry[o.type]?.overlay?.(ctx, o, objs)
        if (o.id === P.current.selectedId && !o.body) {
          const p = o.props || {}
          const bw = p.w ?? 64, bh = p.h ?? 64
          ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = 'rgba(56,189,248,.8)'; ctx.lineWidth = 1.5 / view.scale
          if (p.w && p.h) ctx.strokeRect(o.x - bw / 2, o.y - bh / 2, bw, bh)
          else { ctx.beginPath(); ctx.arc(o.x, o.y, 30, 0, 7); ctx.stroke() }
          ctx.restore()
        }
      }

      // 光线追迹
      for (const ray of traceRays(objs)) {
        ctx.strokeStyle = ray.color; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.2 / view.scale
        ctx.beginPath()
        ray.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.stroke()
      }
      ctx.globalAlpha = 1; ctx.lineWidth = 1 / view.scale

      drawVectors(ctx, objs, { showVectors: P.current.sim.running })
      if (P.current.showForces && P.current.selectedId != null) {
        const sel = objs.find(o => o.id === P.current.selectedId)
        if (sel) drawForceAnalysis(ctx, sel, objs)
      }

      if (!P.current.sim.objsRef.current.length) drawEmptyHint(ctx, w, h)
      drawScaleBar(ctx, w, h, view.scale)

      // 放置预览（鼠标悬停时）
      const tool = P.current.tool
      if (tool && tool !== 'select' && hoverRef.current && mode === 'idle') {
        drawGhost(ctx, tool, snap(hoverRef.current.x), snap(hoverRef.current.y), view.scale)
      }
    }
    // 单帧绘制出错不能让整个动画循环停掉（否则画布会「冻住」，看起来像卡死）
    const rafLoop = (now) => {
      try { loop() } catch (e) { console.error('[draw]', e) }
      raf = requestAnimationFrame(rafLoop)
    }
    raf = requestAnimationFrame(rafLoop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onCancel)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', wheel)
      window.removeEventListener('sim-zoom', onZoom)
      window.removeEventListener('sim-zoom-reset', onZoomReset)
      window.removeEventListener('sim-fit', onZoomFit)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} />
      <div className="zoomctl">
        <button onPointerDown={() => window.dispatchEvent(new CustomEvent('sim-zoom', { detail: 1.25 }))} aria-label="放大">＋</button>
        <button onPointerDown={() => window.dispatchEvent(new CustomEvent('sim-zoom', { detail: 0.8 }))} aria-label="缩小">－</button>
        <button onPointerDown={() => window.dispatchEvent(new CustomEvent('sim-fit'))} aria-label="显示全部">⤢</button>
        <button onPointerDown={() => window.dispatchEvent(new CustomEvent('sim-zoom-reset'))} aria-label="复位">⟲</button>
      </div>
    </>
  )
}

function triPath(ctx, g) {
  ctx.beginPath()
  ctx.moveTo(g.apex.x, g.apex.y)
  ctx.lineTo(g.baseL.x, g.baseL.y)
  ctx.lineTo(g.baseR.x, g.baseR.y)
  ctx.closePath()
}

// 斜面：真题里的直角三角形 + θ 角标
// 比例尺：100px = 1m（屏幕空间绘制，底部居中）
function drawEmptyHint(ctx, w, h) {
  ctx.save()
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(219,230,245,.55)'
  ctx.font = '600 15px system-ui'
  ctx.fillText('从下方元件栏选一个元件，点在画布上放置', w / 2, h / 2 - 8)
  ctx.fillStyle = 'rgba(148,163,184,.6)'
  ctx.font = '13px system-ui'
  ctx.fillText('或点 📖 真题预设 载入一道题的整套装置（可拖动、可调参）', w / 2, h / 2 + 18)
  ctx.restore()
}

function drawScaleBar(ctx, w, h, scale) {
  const cands = [0.5, 1, 2, 5, 10]
  let m = 1
  for (const c of cands) { m = c; if (c * 100 * scale >= 60) break }
  const px = m * 100 * scale
  const x = w / 2 - px / 2, y = h - 16
  ctx.save()
  ctx.strokeStyle = 'rgba(219,230,245,.75)'; ctx.fillStyle = 'rgba(219,230,245,.85)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4)
  ctx.moveTo(x, y); ctx.lineTo(x + px, y)
  ctx.moveTo(x + px, y - 4); ctx.lineTo(x + px, y + 4)
  ctx.stroke()
  ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'
  ctx.fillText(m + ' m', x + px / 2, y - 5)
  ctx.restore()
}

function drawIncline(ctx, o, selectedId, scale) {
  const g = inclineGeom(o)
  const sel = o.id === selectedId
  ctx.save()
  triPath(ctx, g)
  ctx.fillStyle = sel ? 'rgba(56,189,248,.16)' : 'rgba(232,234,240,.09)'
  ctx.fill()
  ctx.strokeStyle = sel ? '#38bdf8' : 'rgba(232,234,240,.8)'
  ctx.lineWidth = (sel ? 1.8 : 1.2) / scale
  ctx.lineJoin = 'round'
  ctx.stroke()

  // 直角标记
  const q = Math.min(16, g.L * 0.12)
  ctx.beginPath()
  ctx.moveTo(g.baseL.x + q, g.baseL.y)
  ctx.lineTo(g.baseL.x + q, g.baseL.y - q)
  ctx.lineTo(g.baseL.x, g.baseL.y - q)
  ctx.strokeStyle = 'rgba(232,234,240,.45)'
  ctx.lineWidth = 1 / scale
  ctx.stroke()

  // θ 角弧
  const r0 = Math.max(14, Math.min(44, g.L * 0.16))
  ctx.beginPath()
  ctx.arc(g.baseR.x, g.baseR.y, r0, -Math.PI, g.a - Math.PI)
  ctx.strokeStyle = 'rgba(246,224,94,.9)'
  ctx.lineWidth = 1.1 / scale
  ctx.stroke()

  const midA = g.a / 2 - Math.PI
  const lx = g.baseR.x + Math.cos(midA) * (r0 + 16)
  const ly = g.baseR.y + Math.sin(midA) * (r0 + 16)
  ctx.fillStyle = '#f6e05e'
  ctx.font = `${Math.round(12 / scale)}px system-ui`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('θ=' + (o.props.angle ?? 30) + '°', lx, ly)
  ctx.restore()
}

function drawGhost(ctx, tool, x, y, scale) {
  const g = ghostOf(tool)
  ctx.save()
  ctx.setLineDash([6 / scale, 4 / scale])
  ctx.strokeStyle = 'rgba(56,189,248,.9)'
  ctx.fillStyle = 'rgba(56,189,248,.12)'
  ctx.lineWidth = 1.5 / scale
  if (g.kind === 'tri') {
    triPath(ctx, inclineGeom({ x, y, props: { angle: g.angle, len: g.len } }))
  } else {
    ctx.beginPath()
    if (g.kind === 'rect') { ctx.rect(x - g.w / 2, y - g.h / 2, g.w, g.h) }
    else if (g.kind === 'circle') { ctx.arc(x, y, g.r, 0, 7) }
    else if (g.kind === 'rotRect') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(g.angle); ctx.rect(-g.w / 2, -g.h / 2, g.w, g.h); ctx.restore()
    } else {
      const a = ((g.angle ?? 0) * Math.PI) / 180
      ctx.moveTo(x - Math.cos(a) * g.len / 2, y - Math.sin(a) * g.len / 2)
      ctx.lineTo(x + Math.cos(a) * g.len / 2, y + Math.sin(a) * g.len / 2)
    }
  }
  ctx.fill(); ctx.stroke()
  ctx.restore()
}

function drawBody(ctx, o, selectedId, scale) {
  const b = o.body
  const sel = o.id === selectedId
  ctx.save()
  ctx.translate(b.position.x, b.position.y)
  ctx.rotate(b.angle)
  if (o.type === 'particle') {
    ctx.beginPath(); ctx.arc(0, 0, b.circleRadius, 0, 7)
    ctx.fillStyle = sel ? '#38bdf8' : '#f2f4f8'; ctx.fill()
  } else if (o.type === 'charge') {
    ctx.beginPath(); ctx.arc(0, 0, b.circleRadius, 0, 7)
    ctx.fillStyle = o.props.q >= 0 ? '#ff5f56' : '#38bdf8'; ctx.fill()
    ctx.fillStyle = '#0d1117'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(o.props.q >= 0 ? '+' : '−', 0, 1)
  } else {
    ctx.beginPath()
    if (b.circleRadius) ctx.arc(0, 0, b.circleRadius, 0, 7)
    else if (b.vertices) {
      const vs = b.vertices
      ctx.moveTo(vs[0].x - b.position.x, vs[0].y - b.position.y)
      for (let i = 1; i < vs.length; i++) ctx.lineTo(vs[i].x - b.position.x, vs[i].y - b.position.y)
      ctx.closePath()
    }
    ctx.fillStyle = '#dbe6f5'
    ctx.fill()
    ctx.strokeStyle = sel ? '#38bdf8' : 'rgba(232,234,240,.55)'
    ctx.lineWidth = (sel ? 2 : 1) / scale
    ctx.stroke()
  }
  if (sel) {
    ctx.strokeStyle = 'rgba(56,189,248,.5)'; ctx.lineWidth = 1 / scale
    ctx.beginPath()
    if (b.circleRadius) ctx.arc(0, 0, b.circleRadius + 5, 0, 7)
    else ctx.rect(b.bounds.min.x - b.position.x - 4, b.bounds.min.y - b.position.y - 4, b.bounds.max.x - b.bounds.min.x + 8, b.bounds.max.y - b.bounds.min.y + 8)
    ctx.stroke()
  }
  ctx.restore()
}
