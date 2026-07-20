'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FavoriteButton from '@/components/FavoriteButton'
import { extractBilibiliBvid } from '@/lib/bilibili'
import type { Article } from '@/lib/types'

export default function VideoDetailPage() {
  const params = useParams()
  const [article, setArticle] = useState<Article | null>(null)
  const [articleId, setArticleId] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(res => {
      if (res.success) { setArticle(res.data); setArticleId(res.data.id) }
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
  const pageParam = article.bilibili_url?.match(/[?&]p=(\d+)/)?.[1] || null

  function renderPlayer() {
    // 方案1: 有直链流 → 嵌入我们的播放器
    if (article.has_stream) {
      return (
        <iframe
          src={`/play/${articleId}`}
          allowFullScreen
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%', border: 'none',
          }}
        />
      )
    }

    // 方案2: B站 iframe 兜底
    if (bvid) {
      return (
        <iframe
          src={`https://player.bilibili.com/player.html?bvid=${bvid}${pageParam ? `&p=${pageParam}` : ''}&high_quality=1&autoplay=0&danmaku=0`}
          scrolling="no"
          frameBorder="0"
          allowFullScreen
          referrerPolicy="no-referrer"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%', border: 'none',
          }}
        />
      )
    }

    // 方案3: 直链视频
    if (article.video_url) {
      return article.is_m3u8 ? (
        <video controls className="w-full h-full" playsInline>
          <source src={article.video_url} type="application/x-mpegURL" />
        </video>
      ) : (
        <video controls className="w-full h-full" playsInline>
          <source src={article.video_url} type="video/mp4" />
        </video>
      )
    }

    return null
  }

  return (
    <>
      <Header />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] mb-4 inline-block">&larr; 返回首页</Link>

        <div className="relative aspect-video rounded-xl overflow-hidden mb-6 bg-black">
          {renderPlayer()}
        </div>

        <h1 className="text-2xl font-bold mb-3">{article.title}</h1>

        <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
          {article.category_name && <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>}
          <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <FavoriteButton type="video" id={String(article.id)} />
          <button onClick={() => {
            const reason = prompt('请填写举报理由（如侵权/违规）：')
            if (!reason) return
            fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId: article.id, reason }) })
              .then(r => r.json()).then(res => { if (res.success) alert('已收到举报'); else alert(res.error || '提交失败') })
              .catch(() => alert('网络错误'))
          }} className="text-xs text-gray-400 hover:text-red-500">举报</button>
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
