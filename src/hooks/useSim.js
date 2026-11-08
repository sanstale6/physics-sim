import { useCallback, useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import { createWorld, applyForces, postStep, VEL_SCALE, GRAV, gravityState } from '../sim/engine.js'
import { registry } from '../sim/registry.js'
import { snapToPin, snapJunction, CIRCUIT_TYPES, pins } from '../sim/circuit.js'

const LINK_TYPES = new Set(['rope', 'spring', 'pulley', 'pendulum'])

const STEP_MS = 1000 / 60      // 固定步长：保证不同刷新率（60/90/120Hz）下物理一致
const MAX_STEPS = 5

let nextId = 1

export function useSim() {
  const engineRef = useRef(null)
  const objsRef = useRef([])
  const runningRef = useRef(false)
  const timeRef = useRef(0)

  const [running, setRunningState] = useState(false)
  const [time, setTime] = useState(0)
  const [count, setCount] = useState(0)
  const [tick, setTick] = useState(0)
  const [epoch, setEpoch] = useState(0)   // 场景重置计数（画布据此清轨迹）
  const [gravity, setGravityState] = useState(true)
  const [speed, setSpeedState] = useState(1)   // 时间倍率 0.25 / 0.5 / 1 / 2 / 4
  const speedRef = useRef(1)
  const historyRef = useRef([])           // 撤销栈（快照）
  const futureRef = useRef([])            // 重做栈
  const [histVer, setHistVer] = useState(0)

  const ensureWorld = () => (engineRef.current ||= createWorld())

  const setSpeed = useCallback((v) => { speedRef.current = v; setSpeedState(v) }, [])

  const setGravity = useCallback((on) => {
    gravityState.on = on
    setGravityState(on)
    if (engineRef.current) engineRef.current.gravity.y = on ? GRAV.y : 0
    bump()
  }, [])

  const makeBody = (o) => {
    const reg = registry[o.type]
    if (!reg?.body) return null
    const def = reg.body(o.x, o.y, o.props)
    const opts = { frictionAir: 0, ...def.options, label: def.label }
    let body = null
    if (def.type === 'rectangle') body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, opts)
    else if (def.type === 'rotRect') {
      body = Matter.Bodies.rectangle(o.x, o.y, def.w, def.h, opts)
      Matter.Body.setAngle(body, def.angle ?? 0)
    }
    else if (def.type === 'circle') body = Matter.Bodies.circle(o.x, o.y, def.r, opts)
    else if (def.type === 'vertices') body = Matter.Bodies.fromVertices(o.x, o.y, [def.verts], opts)
    else if (def.type === 'compound') {
      // 部件按「有 r 是圆、否则是矩形」判定（不依赖显式 type，避免漏写导致构造崩溃）
      const parts = def.parts.map(p => (p.r != null
        ? Matter.Bodies.circle(o.x + p.x, o.y + p.y, p.r, p.options ?? opts)
        : Matter.Bodies.rectangle(o.x + p.x, o.y + p.y, p.w, p.h, p.options ?? opts)))
      body = Matter.Body.create({ parts, ...opts, isStatic: true })
    }
    if (body && o.props.m != null && !body.isStatic) Matter.Body.setMass(body, o.props.m)
    if (body && !body.isStatic && o.angle) Matter.Body.setAngle(body, o.angle)
    return body
  }

  // 初速度：v0x/v0y 是 m/s（向上为正），matter 速度是 px/step、y 向下
  const applyV0 = (o) => {
    if (!o.body || o.body.isStatic) return
    const { v0x = 0, v0y = 0 } = o.props
    Matter.Body.setVelocity(o.body, { x: v0x / VEL_SCALE, y: -v0y / VEL_SCALE })
  }

  const spawn = useCallback((type, x, y, props, angle = 0, explicitId = null) => {
    const reg = registry[type]
    if (!reg) return null
    const p = { ...reg.defaults(), ...props }
    if (angle) p.angle = angle
    const obj = { id: explicitId ?? nextId++, type, props: p, x, y, angle, body: null, home: { x, y, angle } }
    if (explicitId != null && explicitId >= nextId) nextId = explicitId + 1
    // 绳 / 弹簧 / 滑轮 / 单摆：放置时记住最近的两个动态物体作为两端
    if (LINK_TYPES.has(type) && p._a == null) {
      const near = objsRef.current
        .filter(o => o.body && !o.body.isStatic)
        .map(o => ({ o, d: Math.hypot(o.body.position.x - x, o.body.position.y - y) }))
        .filter(e => e.d < 480)
        .sort((u, v) => u.d - v.d)
        .slice(0, 2)
      if (near.length === 2) { p._a = near[0].o.id; p._b = near[1].o.id }
      else if (near.length === 1) { p._a = near[0].o.id }
    }
    const engine = ensureWorld()
    const body = makeBody(obj)
    if (body) { Matter.Composite.add(engine.world, body); obj.body = body; applyV0(obj) }
    return obj
  }, [])

  const bump = () => setTick(t => (t + 1) % 1e6)

  // —— 撤销 / 重做 ——
  const snapshot = () => objsRef.current.map(o => ({
    type: o.type, x: Math.round(o.x), y: Math.round(o.y), angle: o.angle || 0, props: { ...o.props },
  }))
  const pushHistory = () => {
    historyRef.current.push(snapshot())
    if (historyRef.current.length > 50) historyRef.current.shift()
    futureRef.current = []
    setHistVer(v => v + 1)
  }

  const restore = useCallback((items) => {
    const engine = ensureWorld()
    Matter.Composite.clear(engine.world, false)
    objsRef.current = items.map((it, i) => spawn(it.type, it.x, it.y, it.props, it.angle || 0, it.id ?? i + 1)).filter(Boolean)
    timeRef.current = 0; setTime(0)
    setCount(objsRef.current.length); setEpoch(e => e + 1); bump()
  }, [spawn])

  const undo = useCallback(() => {
    if (!historyRef.current.length) return
    futureRef.current.push(snapshot())
    restore(historyRef.current.pop())
    setHistVer(v => v + 1)
  }, [restore])

  const redo = useCallback(() => {
    if (!futureRef.current.length) return
    historyRef.current.push(snapshot())
    restore(futureRef.current.pop())
    setHistVer(v => v + 1)
  }, [restore])

  const add = useCallback((type, x, y, props, angle = 0) => {
    pushHistory()
    const obj = spawn(type, x, y, props, angle)
    if (!obj) return null
    objsRef.current = [...objsRef.current, obj]
    setCount(objsRef.current.length); bump()
    return obj.id
  }, [spawn])

  const loadScene = useCallback((items) => {
    pushHistory()
    restore(items)
  }, [restore])

  const remove = useCallback((id) => {
    pushHistory()
    const engine = engineRef.current
    objsRef.current = objsRef.current.filter(o => {
      if (o.id !== id) return true
      if (o.body && engine) Matter.Composite.remove(engine.world, o.body)
      return false
    })
    setCount(objsRef.current.length); bump()
  }, [])

  // 属性编辑的撤销：连续拖动滑杆只记一次（800ms 内的连续修改合并）
  const lastPropRef = useRef(0)
  const update = useCallback((id, key, value) => {
    const o = objsRef.current.find(o => o.id === id)
    if (!o) return
    const now = Date.now()
    if (now - lastPropRef.current > 800) { pushHistory(); lastPropRef.current = now }
    const prevLen = o.props.len
    if (o.props._par && (key === 'len' || key === 'angle')) delete o.props._par
    o.props[key] = value
    // 线段元件调长度：若某端已吸附到其他端子，则保持该端不动，沿另一端伸长
    if (key === 'len' && CIRCUIT_TYPES.includes(o.type)) {
      const a = ((o.props.angle ?? 0) * Math.PI) / 180
      const ux = Math.cos(a), uy = Math.sin(a)
      const others = objsRef.current.filter(t => t.id !== o.id)
      const L0 = prevLen ?? 90
      // 端点是否已「接上东西」：吸到别的端子，或落在别的元件线段上
      const onSeg = (ex, ey) => {
        for (const t of others) {
          if (!CIRCUIT_TYPES.includes(t.type)) continue
          const ps = pins(t)
          if (ps.length !== 2) continue
          const dx = ps[1].x - ps[0].x, dy = ps[1].y - ps[0].y
          const L2 = dx * dx + dy * dy
          if (L2 < 1) continue
          let tt = ((ex - ps[0].x) * dx + (ey - ps[0].y) * dy) / L2
          tt = Math.max(0, Math.min(1, tt))
          if (Math.hypot(ex - (ps[0].x + tt * dx), ey - (ps[0].y + tt * dy)) < 10) return true
        }
        return false
      }
      const attached = [-1, 1].map(sg => {
        const ex = o.x + sg * ux * L0 / 2, ey = o.y + sg * uy * L0 / 2
        return !!snapToPin(ex, ey, others, 10) || onSeg(ex, ey)
      })
      if (attached[0] !== attached[1]) {   // 恰有一端依附 → 该端固定，只朝另一端伸长
        const keep = attached[0] ? -1 : 1  // 依附端方向（-1 或 +1）
        // 依附端坐标 F = 中心 + keep*u*L0/2，伸长后新中心 = F - keep*u*value/2
        o.x += keep * ux * (L0 - value) / 2
        o.y += keep * uy * (L0 - value) / 2
        if (o.home) { o.home.x = o.x; o.home.y = o.y }
      }
      // 两端都依附或都自由 → 居中伸长，不做特殊处理
    }
    if (key === 'angle') {
      o.props.angle = value
      if (o.home) o.home.angle = (value * Math.PI) / 180
      if (o.body) Matter.Body.setAngle(o.body, (value * Math.PI) / 180)
      bump()
      return
    }
    if (o.body) {
      if (key === 'm') { Matter.Body.setMass(o.body, Math.max(0.01, value)) }
      else if (key === 'mu') { /* 摩擦力自己算（contacts.js），matter 摩擦保持 0 */ }
      else if (key === 'v0x' || key === 'v0y') {
        const { v0x = 0, v0y = 0 } = o.props
        Matter.Body.setVelocity(o.body, { x: v0x / VEL_SCALE, y: -v0y / VEL_SCALE })
      }
      else {
        // 几何参数变化 → 重建刚体（保留位置/速度，避免形状改了但碰撞体没变）
        const engine = engineRef.current
        const pos = { ...o.body.position }, vel = { ...o.body.velocity }, av = o.body.angularVelocity, ang = o.body.angle
        Matter.Composite.remove(engine.world, o.body)
        const nb = makeBody({ ...o, x: pos.x, y: pos.y })
        if (nb) {
          Matter.Body.setAngle(nb, nb.isStatic ? 0 : ang)
          Matter.Body.setVelocity(nb, vel)
          Matter.Body.setAngularVelocity(nb, av)
          Matter.Composite.add(engine.world, nb)
          o.body = nb
        } else o.body = null
      }
    }
    bump()
  }, [])

  // 拖拽：直接设位置并清零速度（不切换 static，避免质量/速度丢失）
  const dragTo = useCallback((id, x, y) => {
    const o = objsRef.current.find(o => o.id === id)
    if (!o) return
    // 改动并联态元件（拖动/改尺寸）→ 视为解除并联，恢复普通形态
    if (o.props._par) delete o.props._par
    // 电路线段元件：拖动时若附近（26px）有其他端子，则平移使该端子精确对齐（保持连接不断）
    if (o.type === 'junction') {
      const snap = snapJunction(x, y, objsRef.current.filter(t => t.id !== id))
      if (snap) { x = snap.x; y = snap.y }
    }
    if (CIRCUIT_TYPES.includes(o.type) && o.type !== 'junction') {
      const len = o.props.len ?? 90
      const a = ((o.props.angle ?? 0) * Math.PI) / 180
      const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2
      const others = objsRef.current.filter(t => t.id !== id)
      for (const [sx, sy] of [[-dx, -dy], [dx, dy]]) {   // 两端各自尝试吸附
        const snap = snapToPin(x + sx, y + sy, others)
        if (snap) { x = snap.x - sx; y = snap.y - sy; break }
      }
    }
    const ox = o.x, oy = o.y
    o.x = x; o.y = y
    o.home = { x, y, angle: o.home?.angle ?? 0 }   // 拖到新位置后，重置就回到这里
    // 并联态跟随：移动某个元件后，把「两端吸附在该元件端子附近」的并联态元件的 a1/a2 同步平移
    if (CIRCUIT_TYPES.includes(o.type) && (ox !== x || oy !== y)) {
      const a = ((o.props.angle ?? 0) * Math.PI) / 180
      const len = o.props.len ?? 90
      const dxh = (Math.cos(a) * len) / 2, dyh = (Math.sin(a) * len) / 2
      const oldPins = [{ x: ox - dxh, y: oy - dyh }, { x: ox + dxh, y: oy + dyh }]
      const ddx = x - ox, ddy = y - oy
      for (const t of objsRef.current) {
        const par = t.props?._par
        if (!par || t.id === id) continue
        for (const key of ['a1', 'a2']) {
          const q = par[key]
          if (!q) continue
          if (oldPins.some(pn => Math.hypot(pn.x - q.x, pn.y - q.y) < 14)) { q.x += ddx; q.y += ddy }
        }
      }
    }
    const b = o.body
    if (b) {
      Matter.Body.setPosition(b, { x, y })
      Matter.Body.setVelocity(b, { x: 0, y: 0 })
      applyV0(o)
      Matter.Body.setAngularVelocity(b, 0)
    }
  }, [])

  const getObject = useCallback((id) => {
    const o = objsRef.current.find(o => o.id === id)
    return o ? { id: o.id, type: o.type, ...o.props } : null
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const reset = useCallback(() => {
    timeRef.current = 0; setTime(0)
    for (const o of objsRef.current) {
      const b = o.body
      if (!b) { o.x = o.home.x; o.y = o.home.y; continue }
      Matter.Body.setPosition(b, { x: o.home.x, y: o.home.y })
      Matter.Body.setAngle(b, o.home.angle || 0)
      Matter.Body.setVelocity(b, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(b, 0)
      o.x = o.home.x; o.y = o.home.y
      applyV0(o)   // 重置 = 回到初始条件（位置 + 初速度）
    }
    setEpoch(e => e + 1); bump()
  }, [])

  const clear = useCallback(() => {
    pushHistory()
    const engine = engineRef.current
    if (engine) Matter.Composite.clear(engine.world, false)
    objsRef.current = []
    timeRef.current = 0; setTime(0)
    setCount(0); setEpoch(e => e + 1); bump()
  }, [])

  const setRunning = useCallback((v) => { runningRef.current = v; setRunningState(v) }, [])

  useEffect(() => {
    ensureWorld()
    let raf, last = performance.now(), acc = 0, lastPub = 0
    const loop = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (runningRef.current) {
        acc += dt * 1000 * speedRef.current
        let n = 0
        while (acc >= STEP_MS && n < MAX_STEPS) {
          applyForces(objsRef.current)
          Matter.Engine.update(engineRef.current, STEP_MS)
          postStep(objsRef.current)
          acc -= STEP_MS
          n++
        }
        if (n === MAX_STEPS) acc = 0
        if (n) {
          timeRef.current += (n * STEP_MS) / 1000
          // 面板 10Hz 刷新即可，避免每帧重渲染整个 React 树（手机上会卡点击）
          if (now - lastPub > 120) { lastPub = now; setTime(timeRef.current); bump() }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return {
    add, remove, update, dragTo, getObject, loadScene, reset, clear, undo, redo,
    canUndo: historyRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    histVer,
    running, setRunning, time, timeRef, count, tick, epoch, engineRef, objsRef,
    gravity, setGravity, speed, setSpeed,
  }
}
