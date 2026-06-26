'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Article } from '@/lib/types'

export default function AudioDetailPage() {
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
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8"><div className="animate-pulse"><div className="h-48 bg-gray-200 rounded-xl mb-6" /><div className="h-8 bg-gray-200 rounded w-3/4 mb-4" /><div className="h-4 bg-gray-200 rounded w-1/4" /></div></main>
      <Footer />
    </>
  )

  if (!article) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-4xl mb-4">🎧</p><p className="text-gray-500">音频不存在或已下架</p><Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link></div></main>
      <Footer />
    </>
  )

  return (
    <>
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] mb-4 inline-block">&larr; 返回首页</Link>

        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-8 mb-6 text-center">
          <div className="text-5xl mb-4">🎧</div>
          <h1 className="text-2xl font-bold mb-3">{article.title}</h1>
          <div className="flex items-center justify-center gap-3 text-sm text-gray-500 mb-6">
            {article.category_name && <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>}
            <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
          {article.audio_url && (
            <div className="max-w-xl mx-auto">
              <audio controls className="w-full" controlsList="nodownload">
                <source src={article.audio_url} type="audio/mpeg" />
                <source src={article.audio_url} type="audio/ogg" />
                <p>您的浏览器不支持音频播放。</p>
              </audio>
            </div>
          )}
        </div>

        {article.cover_image && (
          <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-gray-100">
            <img src={article.cover_image} alt={article.title} className="w-full h-full object-cover" />
          </div>
        )}

        {article.summary && <p className="text-gray-600 mb-4">{article.summary}</p>}

        {article.content && (
          <div className="article-content prose max-w-none" dangerouslySetInnerHTML={{ __html: article.content }} />
        )}
      </main>
      <Footer />
    </>
  )
}
