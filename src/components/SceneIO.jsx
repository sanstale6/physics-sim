import { useRef } from 'react'
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

export default function SceneIO({ sim, onClose }) {
  const fileRef = useRef(null)
  const save = () => {
    const name = prompt('场景名称：')
    if (!name) return
    const all = listScenes()
    all[name] = exportScene(sim.objsRef.current)
    localStorage.setItem(KEY, JSON.stringify(all))
    alert('已保存：' + name)
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
      try { sim.loadScene(JSON.parse(t)) } catch { alert('JSON 解析失败') }
    })
  }
  const share = async () => {
    const url = buildShareUrl(exportScene(sim.objsRef.current))
    try {
      await navigator.clipboard.writeText(url)
      alert('分享链接已复制，可直接发给同学打开（场景随链接走，无需服务器）')
    } catch {
      prompt('复制这个链接分享：', url)
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
      <button onClick={save}>💾 存场景</button>
      {saved.map(n => (
        <span key={n} className="saved">
          <button onClick={() => load(n)}>{n}</button>
          <button className="danger" onClick={() => del(n)}>×</button>
        </span>
      ))}
      <button onClick={share}>🔗 分享链接</button>
      <button onClick={snapshot}>📷 截图</button>
      <button onClick={exportJSON}>导出 JSON</button>
      <button onClick={() => fileRef.current?.click()}>导入 JSON</button>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={importJSON} />
    </div>
  )
}