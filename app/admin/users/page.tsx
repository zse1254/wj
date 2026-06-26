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

  useEffect(() => {
    fetch(`/api/admin/users?page=${page}&limit=50`).then(r => r.json()).then(res => {
      if (res.success) {
        setUsers(res.data.users)
        setTotal(res.data.total)
      }
    }).finally(() => setLoading(false))
  }, [page])

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">用户管理</h1>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
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
              <tr key={u.id} className="border-b hover:bg-gray-50">
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
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">暂无用户</td></tr>
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
