import { useRef, useState } from 'react'
import { buildShareUrl } from '../sim/share.js'

const KEY = 'physics-sim-scenes'

function listScenes() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

export function exportScene(objs) {
  return objs.map(o => {
    const { _a, _b, ...props } = o.props   // 连接记录是内部 id，导出时丢掉
    return { type: o.type, x: Math.round(o.x), y: Math.round(o.y), props }
  })
}

export default function SceneIO({ sim, onClose, onNotify }) {
  const fileRef = useRef(null)
  const [naming, setNaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [link, setLink] = useState('')
  const say = onNotify || (() => {})
  const save = () => {
    const name = (draft || '').trim()
    if (!name) { say('请输入场景名称'); return }
    const all = listScenes()
    all[name] = exportScene(sim.objsRef.current)
    try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { say('保存失败：本地存储已满'); return }
    setNaming(false); setDraft('')
    say('已保存场景：' + name)
  }
  const load = (name) => {
    const all = listScenes()
    if (all[name]) sim.loadScene(all[name])
  }
  const del = (name) => {
    const all = listScenes()
    delete all[name]
    localStorage.setItem(KEY, JSON.stringify(all))
    onClose()
  }
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(exportScene(sim.objsRef.current), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'scene.json'
    a.click()
  }
  const importJSON = (e) => {
    const f = e.target.files[0]
    if (!f) return
    f.text().then(t => {
      try { sim.loadScene(JSON.parse(t)) } catch { say('JSON 解析失败：文件内容不是有效的场景数据') }
    })
  }
  // 复制到剪贴板：优先 async clipboard，失败退回到「隐藏 textarea + execCommand」，
  // 再不济把链接塞进输入框让用户手动复制——全程不用阻塞式 prompt
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true } catch { /* 降级 */ }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;left:-9999px;top:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { return false }
  }
  const share = async () => {
    const url = buildShareUrl(exportScene(sim.objsRef.current))
    if (await copyText(url)) {
      say('分享链接已复制，可直接发给同学（场景随链接走，无需服务器）')
    } else {
      setDraft(url)
      setNaming(false)
      setLink(url)
      say('浏览器不允许自动复制，请手动复制下面的链接')
    }
  }
  const snapshot = () => {
    const cv = document.querySelector('.canvas-wrap > canvas')
    if (!cv) return
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = 'physics-' + Date.now() + '.png'
    a.click()
  }
  const saved = Object.keys(listScenes())
  return (
    <div className="sceneio">
      {naming ? (
        <span className="savebox">
          <input autoFocus value={draft} placeholder="场景名称"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setNaming(false); setDraft('') } }} />
          <button onClick={save}>存</button>
          <button onClick={() => { setNaming(false); setDraft('') }}>取消</button>
        </span>
      ) : (
        <button onClick={() => { setNaming(true); setDraft('') }}>💾 存场景</button>
      )}
      {saved.map(n => (
        <span key={n} className="saved">
          <button onClick={() => load(n)}>{n}</button>
          <button className="danger" onClick={() => del(n)}>×</button>
        </span>
      ))}
      <button onClick={share}>🔗 分享链接</button>
      {link && (
        <span className="savebox">
          <input readOnly value={link} onFocus={e => e.target.select()} />
          <button onClick={() => setLink('')}>好</button>
        </span>
      )}
      <button onClick={snapshot}>📷 截图</button>
      <button onClick={exportJSON}>导出 JSON</button>
      <button onClick={() => fileRef.current?.click()}>导入 JSON</button>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={importJSON} />
    </div>
  )
}