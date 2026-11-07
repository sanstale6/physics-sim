import { useCallback, useEffect, useRef, useState } from 'react'
import Matter from 'matter-js'
import { createWorld, applyForces, postStep, VEL_SCALE, GRAV, gravityState } from '../sim/engine.js'
import { registry } from '../sim/registry.js'

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

  const spawn = useCallback((type, x, y, props, angle = 0) => {
    const reg = registry[type]
    if (!reg) return null
    const p = { ...reg.defaults(), ...props }
    const obj = { id: nextId++, type, props: p, x, y, angle, body: null, home: { x, y, angle } }
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
    objsRef.current = items.map(it => spawn(it.type, it.x, it.y, it.props, it.angle || 0)).filter(Boolean)
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
    o.props[key] = value
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
    o.x = x; o.y = y
    o.home = { x, y, angle: o.home?.angle ?? 0 }   // 拖到新位置后，重置就回到这里
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
