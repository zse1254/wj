'use client'

import { useEffect, useState } from 'react'

export default function AdminDashboard() {
  const [stats, setStats] = useState({ articles: 0, users: 0, vipCards: 0, categories: 0 })

  useEffect(() => {
    Promise.all([
      fetch('/api/admin/articles').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/vip-cards').then(r => r.json()),
      fetch('/api/admin/categories').then(r => r.json()),
    ]).then(([articles, users, vipCards, categories]) => {
      setStats({
        articles: articles.data?.total || 0,
        users: users.data?.total || 0,
        vipCards: vipCards.data?.length || 0,
        categories: categories.data?.length || 0,
      })
    })
  }, [])

  const cards = [
    { label: '内容总数', value: stats.articles, color: 'bg-blue-500', icon: '📝' },
    { label: '用户总数', value: stats.users, color: 'bg-green-500', icon: '👥' },
    { label: 'VIP 卡密', value: stats.vipCards, color: 'bg-yellow-500', icon: '💎' },
    { label: '分类数', value: stats.categories, color: 'bg-purple-500', icon: '🏷️' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">仪表盘</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map(card => (
          <div key={card.label} className="bg-white rounded-xl border p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-3xl font-bold">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">快速操作</h2>
        <div className="flex flex-wrap gap-3">
          <a href="/admin/articles" className="px-4 py-2 bg-[#1a73e8] text-white rounded-lg text-sm hover:bg-[#1557b0] transition-colors">管理内容</a>
          <a href="/admin/articles" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors" onClick={() => {
            localStorage.setItem('new-article', '1')
          }}>发布新内容</a>
          <a href="/admin/vip-cards" className="px-4 py-2 bg-yellow-500 text-black rounded-lg text-sm hover:bg-yellow-400 transition-colors">生成 VIP 卡密</a>
          <a href="/admin/categories" className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors">管理分类</a>
        </div>
      </div>
    </div>
  )
}
