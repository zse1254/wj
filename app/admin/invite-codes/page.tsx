'use client'

import { useEffect, useState } from 'react'

interface InviteCode {
  id: string
  code: string
  max_uses: number
  used_count: number
  enabled: number
  note: string | null
  created_by_username: string | null
  created_at: string
  expires_at: string | null
}

export default function AdminInviteCodesPage() {
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [count, setCount] = useState(1)
  const [maxUses, setMaxUses] = useState(1)
  const [note, setNote] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [newCodes, setNewCodes] = useState<string[]>([])
  const [inviteRequired, setInviteRequired] = useState(false)
  const [savingSetting, setSavingSetting] = useState(false)
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const fetchCodes = () => {
    fetch('/api/admin/invite-codes').then(r => r.json()).then(res => {
      if (res.success) setCodes(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCodes()
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.success) setInviteRequired(d.data.invite_required === '1')
    })
  }, [])

  const generate = async () => {
    setGenerating(true)
    setMsg('')
    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, maxUses, note, expiresAt }),
      })
      const data = await res.json()
      if (data.success) {
        setNewCodes(data.data.map((c: { code: string }) => c.code))
        fetchCodes()
      } else {
        setMsg(data.error || '生成失败')
      }
    } finally {
      setGenerating(false)
    }
  }

  const toggle = async (id: string, enabled: number) => {
    await fetch('/api/admin/invite-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: enabled ? 0 : 1 }),
    })
    fetchCodes()
  }

  const remove = async (id: string) => {
    if (!confirm('确定删除该邀请码？')) return
    await fetch('/api/admin/invite-codes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchCodes()
  }

  const saveSetting = async () => {
    setSavingSetting(true)
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'invite_required', value: inviteRequired ? '1' : '0' }),
    })
    setSavingSetting(false)
  }

  const exportCsv = (mode: 'selected' | 'all' | 'used') => {
    let target = codes
    if (mode === 'selected') target = codes.filter(c => selected.has(c.id))
    else if (mode === 'used') target = codes.filter(c => c.used_count >= c.max_uses)
    if (mode === 'selected' && target.length === 0) { alert('请先勾选要导出的邀请码'); return }
    const rows = target.map(c => [c.code, c.max_uses, c.used_count, c.enabled ? '启用' : '禁用', c.note || '', c.expires_at || '', c.created_at].join(','))
    const csv = 'code,max_uses,used_count,status,note,expires_at,created_at\n' + rows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invite_codes_${mode}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteUsed = async () => {
    if (!confirm('确定删除所有已用完的邀请码？')) return
    await fetch('/api/admin/invite-codes/export', { method: 'DELETE' })
    setSelected(new Set())
    fetchCodes()
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const allSelected = codes.length > 0 && codes.every(c => selected.has(c.id))
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(codes.map(c => c.id)))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">邀请码管理</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => exportCsv('selected')} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
              导出选中 ({selected.size})
            </button>
          )}
          <button onClick={() => exportCsv('used')} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出已用完</button>
          <button onClick={() => exportCsv('all')} className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出全部</button>
          <button onClick={deleteUsed} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">删除已用完</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 space-y-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={inviteRequired} onChange={e => setInviteRequired(e.target.checked)} />
            开启邀请码注册（关闭则开放注册）
          </label>
          <button onClick={saveSetting} disabled={savingSetting}
            className="px-3 py-1.5 bg-[#1a4a7a] text-white rounded-lg text-sm hover:bg-[#0d2b4a] disabled:opacity-50">
            {savingSetting ? '保存中' : '保存设置'}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">生成数量</label>
            <input type="number" min={1} max={50} value={count} onChange={e => setCount(Number(e.target.value))}
              className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">单个使用次数</label>
            <input type="number" min={1} max={100000} value={maxUses} onChange={e => setMaxUses(Number(e.target.value))}
              className="w-28 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">备注</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              className="w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="可选" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">过期时间</label>
            <input type="datetime-local" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <button onClick={generate} disabled={generating}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
            {generating ? '生成中' : '生成邀请码'}
          </button>
        </div>

        {newCodes.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <p className="text-green-700 font-medium mb-1">新生成：</p>
            <div className="flex flex-wrap gap-2">
              {newCodes.map(c => <code key={c} className="bg-white px-2 py-1 rounded border border-green-200">{c}</code>)}
            </div>
          </div>
        )}
        {msg && <p className="text-red-500 text-sm">{msg}</p>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} title="全选" />
              </th>
              <th className="text-left px-4 py-3 font-medium">邀请码</th>
              <th className="text-left px-4 py-3 font-medium">使用</th>
              <th className="text-left px-4 py-3 font-medium">状态</th>
              <th className="text-left px-4 py-3 font-medium">备注</th>
              <th className="text-left px-4 py-3 font-medium">过期</th>
              <th className="text-left px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : codes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">暂无邀请码</td></tr>
            ) : codes.map(c => (
              <tr key={c.id} className={selected.has(c.id) ? 'bg-blue-50' : ''}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                </td>
                <td className="px-4 py-3 font-mono">{c.code}</td>
                <td className="px-4 py-3">{c.used_count} / {c.max_uses}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${c.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {c.enabled ? '启用' : '禁用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{c.note || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{c.expires_at || '-'}</td>
                <td className="px-4 py-3 space-x-2">
                  <button onClick={() => toggle(c.id, c.enabled)} className="text-blue-600 hover:underline">
                    {c.enabled ? '禁用' : '启用'}
                  </button>
                  <button onClick={() => remove(c.id)} className="text-red-600 hover:underline">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
