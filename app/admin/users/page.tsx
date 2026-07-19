'use client'

import { useEffect, useState } from 'react'

interface User {
  id: string
  username: string
  email: string
  is_admin: boolean
  is_vip: boolean
  vip_expires_at: string | null
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [vipDays, setVipDays] = useState(365)
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoading(true)
    fetch(`/api/admin/users?page=${page}&limit=50`).then(r => r.json()).then(res => {
      if (res.success) {
        setUsers(res.data.users)
        setTotal(res.data.total)
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page])

  const allSelected = users.length > 0 && users.every(u => selected.has(u.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(users.map(u => u.id)))
  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const batch = async (action: string) => {
    if (selected.size === 0) { alert('请先勾选用户'); return }
    if (action === 'delete' && !confirm('确定删除选中的用户？此操作不可恢复')) return
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], action, vipDays }),
    })
    const data = await res.json()
    setMsg(data.success ? '操作成功' : (data.error || '操作失败'))
    setSelected(new Set())
    load()
  }

  const deleteSelected = async () => {
    if (selected.size === 0) { alert('请先勾选用户'); return }
    if (!confirm('确定删除选中的用户？')) return
    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected] }),
    })
    const data = await res.json()
    setMsg(data.success ? '已删除' : (data.error || '删除失败'))
    setSelected(new Set())
    load()
  }

  const exportCsv = (mode: 'selected' | 'all') => {
    const target = mode === 'selected' ? users.filter(u => selected.has(u.id)) : users
    if (mode === 'selected' && target.length === 0) { alert('请先勾选用户'); return }
    const rows = target.map(u => [u.username, u.email, u.is_admin ? '管理员' : '用户', u.is_vip ? 'VIP' : '普通', u.vip_expires_at || '', u.created_at].join(','))
    const csv = 'username,email,role,vip,vip_expires_at,created_at\n' + rows.join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users_${mode}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">用户管理</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <span className="text-sm text-gray-500">已选 {selected.size}</span>
          )}
          <button onClick={() => exportCsv('selected')} disabled={selected.size === 0} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">导出选中</button>
          <button onClick={() => exportCsv('all')} className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">导出全部</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bg-white rounded-xl border p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">批量操作：</span>
          <input type="number" min={1} value={vipDays} onChange={e => setVipDays(parseInt(e.target.value) || 365)}
            className="w-24 px-2 py-1 border rounded text-sm" title="VIP 天数" />
          <span className="text-sm text-gray-500">天</span>
          <button onClick={() => batch('grant_vip')} className="px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600">开通 VIP</button>
          <button onClick={() => batch('revoke_vip')} className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm hover:bg-gray-300">取消 VIP</button>
          <button onClick={() => batch('ban')} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100">封禁</button>
          <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">删除用户</button>
        </div>
      )}

      {msg && <p className="text-sm text-green-600 mb-2">{msg}</p>}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} title="全选" />
              </th>
              <th className="text-left px-4 py-3 font-medium">用户名</th>
              <th className="text-left px-4 py-3 font-medium">邮箱</th>
              <th className="text-left px-4 py-3 font-medium">角色</th>
              <th className="text-left px-4 py-3 font-medium">VIP 状态</th>
              <th className="text-left px-4 py-3 font-medium">VIP 到期</th>
              <th className="text-left px-4 py-3 font-medium">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className={`border-b hover:bg-gray-50 ${selected.has(u.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggleSelect(u.id)} disabled={u.is_admin} title={u.is_admin ? '管理员不可选' : ''} />
                </td>
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_admin ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-500'}`}>
                    {u.is_admin ? '管理员' : '用户'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${u.is_vip ? 'bg-yellow-50 text-yellow-700' : 'bg-gray-50 text-gray-500'}`}>
                    {u.is_vip ? 'VIP' : '普通'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{u.vip_expires_at ? new Date(u.vip_expires_at).toLocaleDateString('zh-CN') : '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString('zh-CN')}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-500">暂无用户</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > 50 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50">上一页</button>
          <span className="text-sm text-gray-500">第 {page} 页 / 共 {Math.ceil(total / 50)} 页</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50">下一页</button>
        </div>
      )}
    </div>
  )
}
