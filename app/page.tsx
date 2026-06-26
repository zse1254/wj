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

  return (
    <>
      <Header />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? 'bg-[#1a73e8] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {t.label}
            </button>
          ))}
          {categories.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(category === c.slug ? '' : c.slug)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                category === c.slug
                  ? 'bg-[#1a73e8] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {loading && articles.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-video bg-gray-200" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {articles.map(a => (
                <ArticleCard key={a.id} article={a} />
              ))}
            </div>
            {articles.length === 0 && (
              <div className="text-center py-20 text-gray-500">
                <p className="text-4xl mb-4">📭</p>
                <p>暂无内容</p>
              </div>
            )}
            {articles.length < total && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={loading}
                  className="bg-white border border-gray-300 px-8 py-2 rounded-full text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? '加载中...' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  )
}
