'use client'

import { useEffect, useState } from 'react'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import ArticleCard from '@/components/ArticleCard'
import type { Article } from '@/lib/types'

type TabType = '' | 'article' | 'video' | 'audio'

export default function HomePage() {
  const [articles, setArticles] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabType>('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string; slug: string }[]>([])

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(res => {
      if (res.success) setCategories(res.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tab) params.set('type', tab)
    if (category) params.set('category', category)
    params.set('page', String(page))
    params.set('limit', '20')

    fetch(`/api/articles?${params}`).then(r => r.json()).then(res => {
      if (res.success) {
        setArticles(prev => page > 1 ? [...prev, ...res.data.articles] : res.data.articles)
        setTotal(res.data.total)
      }
    }).finally(() => setLoading(false))
  }, [tab, category, page])

  useEffect(() => {
    setPage(1)
  }, [tab, category])

  const tabs: { key: TabType; label: string }[] = [
    { key: '', label: '推荐' },
    { key: 'article', label: '文章' },
    { key: 'video', label: '视频' },
    { key: 'audio', label: '音频' },
  ]

  const tabLabel = tabs.find(t => t.key === tab)?.label || '推荐'

  return (
    <>
      <Header />
      <main className="flex-1 w-full">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  tab === t.key
                    ? 'bg-[#1a4a7a] text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(category === c.slug ? '' : c.slug)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  category === c.slug
                    ? 'bg-[#d4a017] text-white shadow-md'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {loading && articles.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse border border-gray-100">
                  <div className="aspect-video bg-gray-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {articles.length > 0 && page === 1 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 bg-[#d4a017] rounded-full" />
                    <h2 className="text-lg font-bold text-gray-900">{tabLabel}</h2>
                    <span className="text-sm text-gray-400">共 {total} 篇</span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
                    {articles.slice(0, 2).map(a => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {articles.slice(2).map(a => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>
                </div>
              )}
              {articles.length > 0 && page > 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {articles.map(a => (
                    <ArticleCard key={a.id} article={a} />
                  ))}
                </div>
              )}
              {articles.length === 0 && (
                <div className="text-center py-24">
                  <div className="text-5xl mb-4 opacity-50">📭</div>
                  <p className="text-gray-400 text-lg">暂无内容</p>
                  <p className="text-gray-300 text-sm mt-1">管理员将在后台发布内容</p>
                </div>
              )}
              {articles.length > 0 && articles.length < total && (
                <div className="text-center mt-10 mb-6">
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={loading}
                    className="bg-white border border-gray-300 px-10 py-3 rounded-full text-sm text-gray-600 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 transition-all duration-200 shadow-sm hover:shadow"
                  >
                    {loading ? '加载中...' : '加载更多内容'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
