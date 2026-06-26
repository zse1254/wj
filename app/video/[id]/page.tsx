'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { extractBilibiliBvid } from '@/lib/bilibili'
import type { Article } from '@/lib/types'

export default function VideoDetailPage() {
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
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8"><div className="animate-pulse"><div className="aspect-video bg-gray-200 rounded-xl mb-6" /><div className="h-8 bg-gray-200 rounded w-3/4 mb-4" /><div className="h-4 bg-gray-200 rounded w-1/4" /></div></main>
      <Footer />
    </>
  )

  if (!article) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-4xl mb-4">🎬</p><p className="text-gray-500">视频不存在或已下架</p><Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link></div></main>
      <Footer />
    </>
  )

  const bvid = article.bilibili_url ? extractBilibiliBvid(article.bilibili_url) : null

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] mb-4 inline-block">&larr; 返回首页</Link>

        {bvid ? (
          <div className="bilibili-player rounded-xl overflow-hidden mb-6 bg-black">
            <iframe
              src={`https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0&danmaku=0`}
              scrolling="no"
              frameBorder="0"
              allowFullScreen
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </div>
        ) : article.video_url ? (
          <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-black">
            {article.is_m3u8 ? (
              <video controls className="w-full h-full" playsInline>
                <source src={article.video_url} type="application/x-mpegURL" />
                <p>您的浏览器不支持 HLS 视频播放，请使用最新版浏览器或下载视频观看。</p>
              </video>
            ) : (
              <video controls className="w-full h-full" playsInline>
                <source src={article.video_url} type="video/mp4" />
                <p>您的浏览器不支持视频播放。</p>
              </video>
            )}
          </div>
        ) : null}

        <h1 className="text-2xl font-bold mb-3">{article.title}</h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
          {article.category_name && <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>}
          <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
        </div>

        {article.summary && <p className="text-gray-600 mb-4">{article.summary}</p>}

        {article.content && (
          <div className="article-content prose max-w-none" dangerouslySetInnerHTML={{ __html: article.content }} />
        )}
      </main>
      <Footer />
    </>
  )
}
