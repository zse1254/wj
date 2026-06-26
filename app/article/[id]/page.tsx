'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Article } from '@/lib/types'

export default function ArticleDetailPage() {
  const params = useParams()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(res => {
      if (res.success) setArticle(res.data)
    }).finally(() => setLoading(false))
  }, [params.id])

  if (loading) return (
    <>
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-3/4" /><div className="h-4 bg-gray-200 rounded w-1/4" /><div className="h-64 bg-gray-200 rounded" /><div className="h-4 bg-gray-200 rounded" /><div className="h-4 bg-gray-200 rounded w-5/6" /><div className="h-4 bg-gray-200 rounded w-2/3" /></div></main>
      <Footer />
    </>
  )

  if (!article) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-4xl mb-4">📄</p><p className="text-gray-500">文章不存在或已下架</p><Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link></div></main>
      <Footer />
    </>
  )

  return (
    <>
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] mb-4 inline-block">&larr; 返回首页</Link>

        {article.cover_image && (
          <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-gray-100">
            <img src={article.cover_image} alt={article.title} className="w-full h-full object-cover" />
          </div>
        )}

        <h1 className="text-3xl font-bold mb-3">{article.title}</h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
          {article.category_name && <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>}
          <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
        </div>

        <div className="article-content prose max-w-none" dangerouslySetInnerHTML={{ __html: article.content }} />
      </main>
      <Footer />
    </>
  )
}
