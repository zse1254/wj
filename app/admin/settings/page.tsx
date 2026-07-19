'use client'

import { useEffect, useState } from 'react'

export default function AdminSettingsPage() {
  const [inviteRequired, setInviteRequired] = useState(false)
  const [maxFavorites, setMaxFavorites] = useState(10)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.success) {
        setInviteRequired(d.data.invite_required === '1')
        const mf = parseInt(d.data.max_favorites, 10)
        if (Number.isFinite(mf) && mf > 0) setMaxFavorites(mf)
      }
    })
  }, [])

  const save = async () => {
    setSaving(true)
    setMsg('')
    try {
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'invite_required', value: inviteRequired ? '1' : '0' }),
      })
      await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'max_favorites', value: String(maxFavorites) }),
      })
      setMsg('已保存')
    } catch {
      setMsg('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      <div className="bg-white rounded-xl border p-6 space-y-6 max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-800">邀请码注册</p>
            <p className="text-sm text-gray-500">开启后，新用户注册必须填写有效邀请码</p>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={inviteRequired} onChange={e => setInviteRequired(e.target.checked)} />
            <span className="text-sm text-gray-600">开启</span>
          </label>
        </div>

        <div>
          <label className="block font-medium text-gray-800 mb-1">用户收藏上限（个）</label>
          <input type="number" min={1} max={200} value={maxFavorites}
            onChange={e => setMaxFavorites(parseInt(e.target.value) || 10)}
            className="w-32 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" />
          <p className="text-sm text-gray-500 mt-1">每个用户最多可收藏的内容数量</p>
        </div>

        <button onClick={save} disabled={saving}
          className="bg-[#1a4a7a] text-white px-6 py-2 rounded-lg text-sm hover:bg-[#0d2b4a] disabled:opacity-50 font-medium">
          {saving ? '保存中...' : '保存设置'}
        </button>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
      </div>
    </div>
  )
}
