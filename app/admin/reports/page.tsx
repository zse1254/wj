'use client'

import { useEffect, useState } from 'react'

interface Report {
  report_id: string
  reason: string
  report_at: string
  post_id: string
  post_title: string
  bilibili_url: string
  author_id: string
  owner_username: string
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/admin/reports').then(r => r.json()).then(res => {
      if (res.success) setReports(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const removePost = async (postId: string) => {
    if (!confirm('确定删除该帖子？举报记录将一并清除')) return
    await fetch(`/api/admin/reports?postId=${postId}`, { method: 'DELETE' })
    setMsg('已删除帖子')
    load()
  }

  const dismiss = async (reportId: string) => {
    await fetch(`/api/admin/reports?id=${reportId}`, { method: 'DELETE' })
    setMsg('已忽略该举报')
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">举报处理</h1>
      {msg && <p className="text-sm text-green-600 mb-3">{msg}</p>}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">帖子</th>
              <th className="text-left px-4 py-3 font-medium">作者</th>
              <th className="text-left px-4 py-3 font-medium">举报理由</th>
              <th className="text-left px-4 py-3 font-medium">时间</th>
              <th className="text-right px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.report_id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 line-clamp-1 max-w-xs">{r.post_title}</div>
                  {r.bilibili_url && (
                    <a href={r.bilibili_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[#1a73e8] hover:underline">查看来源</a>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-500">{r.owner_username || '-'}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs">{r.reason || '（未填写）'}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">{new Date(r.report_at).toLocaleString('zh-CN')}</td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <button onClick={() => removePost(r.post_id)} className="text-red-600 hover:underline text-xs">删除帖子</button>
                  <button onClick={() => dismiss(r.report_id)} className="text-gray-500 hover:underline text-xs">忽略</button>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-gray-500">暂无举报</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
