'use client'

import { useEffect, useState } from 'react'

interface VipCard {
  id: string
  code: string
  duration_days: number
  is_used: boolean
  used_by: string | null
  used_by_username: string | null
  used_at: string | null
  note: string | null
  created_at: string
}

export default function AdminVipCardsPage() {
  const [cards, setCards] = useState<VipCard[]>([])
  const [count, setCount] = useState(1)
  const [durationDays, setDurationDays] = useState(30)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newCodes, setNewCodes] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const fetchCards = () => {
    fetch('/api/admin/vip-cards').then(r => r.json()).then(res => {
      if (res.success) setCards(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchCards() }, [])

  const handleGenerate = async () => {
    setGenerating(true)
    setNewCodes([])
    try {
      const res = await fetch('/api/admin/vip-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, durationDays, note }),
      })
      const data = await res.json()
      if (data.success) {
        setNewCodes(data.data.map((c: { code: string }) => c.code))
        fetchCards()
      } else {
        alert(data.error || '生成失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setGenerating(false)
    }
  }

  const copyAll = () => {
    const text = newCodes.join('\n')
    navigator.clipboard.writeText(text).then(() => alert('已复制所有卡密'))
  }

  const exportCsv = (mode: 'selected' | 'all' | 'used') => {
    let target = cards
    if (mode === 'selected') target = cards.filter(c => selected.has(c.id))
    else if (mode === 'used') target = cards.filter(c => c.is_used)
    if (mode === 'selected' && target.length === 0) { alert('请先勾选卡密'); return }
    const rows = target.map(c => [c.code, c.duration_days, c.is_used ? '已使用' : '未使用', c.used_by_username || '', c.note || '', c.created_at].join(','))
    const csv = 'code,duration_days,status,used_by,note,created_at\n' + rows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vip_cards_${mode}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteUsed = async () => {
    if (!confirm('确定删除所有已使用的卡密？')) return
    await fetch('/api/admin/vip-cards', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'used' }) })
    setSelected(new Set())
    fetchCards()
  }

  const allSelected = cards.length > 0 && cards.every(c => selected.has(c.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(cards.map(c => c.id)))
  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">VIP 卡密管理</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => exportCsv('selected')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出选中 ({selected.size})</button>
          )}
          <button onClick={() => exportCsv('used')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出已使用</button>
          <button onClick={() => exportCsv('all')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出全部</button>
          <button onClick={deleteUsed} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">删除已使用</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">生成新卡密</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">数量</label>
            <input type="number" min={1} max={100} value={count}
              onChange={e => setCount(parseInt(e.target.value) || 1)}
              className="w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">有效期 (天)</label>
            <input type="number" min={1} max={3650} value={durationDays}
              onChange={e => setDurationDays(parseInt(e.target.value) || 30)}
              className="w-28 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">备注</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="可选" className="w-40 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          </div>
          <button onClick={handleGenerate} disabled={generating}
            className="bg-yellow-500 text-black px-6 py-2 rounded-lg text-sm hover:bg-yellow-400 disabled:opacity-50 font-medium">
            {generating ? '生成中...' : '生成卡密'}
          </button>
        </div>

        {newCodes.length > 0 && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-green-800">已生成 {newCodes.length} 个卡密：</p>
              <button onClick={copyAll} className="text-xs text-[#1a73e8] hover:underline">复制全部</button>
            </div>
            <div className="space-y-1">
              {newCodes.map((code, i) => (
                <div key={i} className="flex items-center justify-between bg-white px-3 py-1.5 rounded text-sm font-mono">
                  <span>{code}</span>
                  <button onClick={() => { navigator.clipboard.writeText(code); alert('已复制') }}
                    className="text-xs text-gray-500 hover:text-[#1a73e8]">复制</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <h2 className="text-lg font-semibold px-4 py-4 border-b">卡密列表</h2>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} title="全选" /></th>
              <th className="text-left px-4 py-3 font-medium">卡密</th>
              <th className="text-left px-4 py-3 font-medium">天数</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">使用者</th>
              <th className="text-left px-4 py-3 font-medium">备注</th>
              <th className="text-left px-4 py-3 font-medium">使用时间</th>
              <th className="text-left px-4 py-3 font-medium">创建时间</th>
            </tr>
          </thead>
          <tbody>
            {cards.map(c => (
              <tr key={c.id} className={`border-b hover:bg-gray-50 ${selected.has(c.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-3"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                <td className="px-4 py-3">{c.duration_days} 天</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${c.is_used ? 'bg-gray-100 text-gray-500' : 'bg-green-50 text-green-600'}`}>
                    {c.is_used ? '已使用' : '未使用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{c.used_by_username || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{c.note || '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{c.used_at ? new Date(c.used_at).toLocaleDateString('zh-CN') : '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.created_at).toLocaleDateString('zh-CN')}</td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-500">暂无卡密</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
