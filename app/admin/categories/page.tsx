'use client'

import { useEffect, useState } from 'react'

interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [parentId, setParentId] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchCategories = () => {
    fetch('/api/admin/categories').then(r => r.json()).then(res => {
      if (res.success) setCategories(res.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { fetchCategories() }, [])

  const nameOf = (id: string | null) => categories.find(c => c.id === id)?.name || '-'

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !slug) return
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slug: slug.toLowerCase().replace(/\s+/g, '-'), parent_id: parentId || null }),
    })
    const data = await res.json()
    if (data.success) {
      setName('')
      setSlug('')
      setParentId('')
      fetchCategories()
    } else {
      alert(data.error || '创建失败')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此分类？其子分类将变为顶级分类。')) return
    const res = await fetch(`/api/admin/categories?id=${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) fetchCategories()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">分类管理</h1>

      <form onSubmit={handleAdd} className="bg-white rounded-xl border p-6 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium mb-1">分类名称</label>
          <input type="text" value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value) }}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" required />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium mb-1">标识 (slug)</label>
          <input type="text" value={slug} onChange={e => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none" required />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-sm font-medium mb-1">上级分类</label>
          <select value={parentId} onChange={e => setParentId(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none bg-white">
            <option value="">（顶级分类）</option>
            {categories.filter(c => !c.parent_id).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-[#1a73e8] text-white px-6 py-2 rounded-lg text-sm hover:bg-[#1557b0]">添加</button>
      </form>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium">名称</th>
              <th className="text-left px-4 py-3 font-medium">上级</th>
              <th className="text-left px-4 py-3 font-medium">标识</th>
              <th className="text-right px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.parent_id ? nameOf(c.parent_id) : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{c.slug}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(c.id)} className="text-red-500 hover:underline text-xs">删除</button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr><td colSpan={4} className="text-center py-12 text-gray-500">暂无分类</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
