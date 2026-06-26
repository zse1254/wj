'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Article } from '@/lib/types'

export default function AdminArticlesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const fetchArticles = () => {
    setLoading(true)
    fetch(`/api/admin/articles?page=${page}&limit=20`).then(r => r.json()).then(res => {
      if (res.success) {
        setArticles(res.data.articles)
        setTotal(res.data.total)
      }
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchArticles() }, [page])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此内容？')) return
    const res = await fetch(`/api/admin/articles/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) fetchArticles()
  }

  const typeLabels: Record<string, string> = { article: '文章', video: '视频', audio: '音频' }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">内容管理</h1>
        <button
          onClick={() => router.push('/admin/articles/new')}
          className="bg-[#1a73e8] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#1557b0]"
        >
          发布新内容
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">标题</th>
              <th className="text-left px-4 py-3 font-medium w-20">类型</th>
              <th className="text-left px-4 py-3 font-medium w-20">状态</th>
              <th className="text-left px-4 py-3 font-medium w-24">分类</th>
              <th className="text-left px-4 py-3 font-medium w-32">时间</th>
              <th className="text-right px-4 py-3 font-medium w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {articles.map(a => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 max-w-md truncate">{a.title}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${a.type === 'video' ? 'bg-purple-50 text-purple-600' : a.type === 'audio' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                    {typeLabels[a.type]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded ${a.published ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500'}`}>
                    {a.published ? '已发布' : '草稿'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{a.category_name || '-'}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{new Date(a.created_at).toLocaleDateString('zh-CN')}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => router.push(`/admin/articles/${a.id}/edit`)} className="text-[#1a73e8] hover:underline text-xs mr-3">编辑</button>
                  <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:underline text-xs">删除</button>
                </td>
              </tr>
            ))}
            {articles.length === 0 && (
              <tr><td colSpan={6} className="text-center py-12 text-gray-500">暂无内容</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {total > 20 && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50">上一页</button>
          <span className="text-sm text-gray-500">第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)} className="px-4 py-2 border rounded-lg text-sm disabled:opacity-50">下一页</button>
        </div>
      )}
    </div>
  )
}
