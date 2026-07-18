'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import type { Article } from '@/lib/types'

interface SeriesVideo {
  bvid: string
  title: string
  cover_url: string
  duration?: number
  page?: number
}

export default function SeriesDetailPage() {
  const params = useParams()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<SeriesVideo[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [played, setPlayed] = useState(0)
  const [autoplay, setAutoplay] = useState(true)

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(res => {
      if (res.success) {
        setArticle(res.data)
        try {
          const parsed = JSON.parse(res.data.content || '{}')
          if (Array.isArray(parsed.videos)) setVideos(parsed.videos)
        } catch {}
      }
    }).finally(() => setLoading(false))
  }, [params.id])

  // Restore playback position
  useEffect(() => {
    if (!article) return
    const key = `series_${article.id}`
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      if (typeof saved.index === 'number') setCurrentIndex(saved.index)
    } catch {}
  }, [article])

  const saveProgress = useCallback((idx: number) => {
    if (!article) return
    const key = `series_${article.id}`
    localStorage.setItem(key, JSON.stringify({ index: idx, updated_at: Date.now() }))
  }, [article])

  // Listen for Bilibili player ended event
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'ended' && autoplay) {
        playNext()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentIndex, autoplay, videos.length])

  const playNext = useCallback(() => {
    if (currentIndex < videos.length - 1) {
      const next = currentIndex + 1
      setCurrentIndex(next)
      setPlayed(prev => prev + 1)
      saveProgress(next)
    } else {
      setAutoplay(false)
    }
  }, [currentIndex, videos.length, saveProgress])

  const playPrev = useCallback(() => {
    if (currentIndex > 0) {
      const prev = currentIndex - 1
      setCurrentIndex(prev)
      saveProgress(prev)
    }
  }, [currentIndex, saveProgress])

  const jumpTo = (idx: number) => {
    if (idx !== currentIndex) {
      setCurrentIndex(idx)
      saveProgress(idx)
    }
  }

  const currentVideo = videos[currentIndex]
  const currentBvid = currentVideo?.bvid
  const currentPage = currentVideo?.page || 1
  const currentEmbedUrl = currentBvid
    ? `https://player.bilibili.com/player.html?bvid=${currentBvid}&p=${currentPage}&high_quality=1&autoplay=1&danmaku=0`
    : ''

  if (loading) return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="animate-pulse"><div className="aspect-video bg-gray-200 rounded-xl mb-6" /><div className="h-8 bg-gray-200 rounded w-1/2 mb-4" /><div className="h-4 bg-gray-200 rounded w-1/4 mb-6" /><div className="space-y-2"><div className="h-12 bg-gray-200 rounded" /><div className="h-12 bg-gray-200 rounded" /><div className="h-12 bg-gray-200 rounded" /></div></div>
      </main>
      <Footer />
    </>
  )

  if (!article || videos.length === 0) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-4xl mb-4">📺</p><p className="text-gray-500">合集不存在</p><Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link></div></main>
      <Footer />
    </>
  )

  return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] mb-4 inline-block">&larr; 返回首页</Link>

        <h1 className="text-xl font-bold mb-1">{article.title}</h1>
        {article.category_name && (
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
            <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>
            <span>{videos.length} 集</span>
            <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
        )}

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-3">
              <iframe
                key={currentBvid}
                src={currentEmbedUrl}
                scrolling="no"
                frameBorder="0"
                allowFullScreen
                allow="autoplay"
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

            <div className="flex items-center gap-3 mb-4">
              <button onClick={playPrev} disabled={currentIndex === 0}
                className="px-4 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                上一集
              </button>
              <span className="text-sm text-gray-500">
                {currentIndex + 1} / {videos.length}
              </span>
              <button onClick={playNext} disabled={currentIndex >= videos.length - 1 || !currentVideo}
                className="px-4 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                下一集
              </button>
              <label className="flex items-center gap-1.5 text-sm text-gray-500 ml-auto cursor-pointer">
                <input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} />
                自动连播
              </label>
            </div>

            {currentVideo && (
              <>
                <h2 className="font-semibold text-base mb-1">{currentVideo.title}</h2>
                {article.summary && <p className="text-sm text-gray-600 mb-4">{article.summary}</p>}
              </>
            )}
          </div>

          <div className="xl:w-80 shrink-0">
            <div className="bg-white rounded-xl border overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <div className="p-3 border-b bg-gray-50 text-sm font-medium flex items-center gap-2">
                <span>📋</span>
                <span>播放列表</span>
                <span className="text-gray-400 font-normal">{videos.length} 集</span>
              </div>
              <div className="divide-y">
                {videos.map((v, i) => (
                  <button key={v.bvid} onClick={() => jumpTo(i)}
                    className={`w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50 transition-colors ${
                      i === currentIndex ? 'bg-blue-50 ring-1 ring-blue-200' : ''
                    }`}>
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      i === currentIndex
                        ? 'bg-[#1a73e8] text-white'
                        : i < played
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}>
                      {i === currentIndex ? '▶' : i + 1}
                    </span>
                    {v.cover_url && (
                      <img src={v.cover_url} alt="" className="w-14 h-9 object-cover rounded shrink-0" referrerPolicy="no-referrer" />
                    )}
                    <span className={`text-sm line-clamp-2 ${
                      i === currentIndex ? 'font-medium text-[#1a73e8]' : 'text-gray-700'
                    }`}>
                      {v.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
