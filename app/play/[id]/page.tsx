'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface SeriesVideo {
  bvid: string
  title: string
  cover_url: string
  duration?: number
  page?: number
}

interface ArticleLite {
  id: number
  title: string
  summary?: string
  type?: string
  content?: string
  bilibili_url?: string
  cover_image?: string
}

export default function PlayPage() {
  const params = useParams()
  const sp = useSearchParams()
  const [article, setArticle] = useState<ArticleLite | null>(null)
  const [loading, setLoading] = useState(true)
  const [videos, setVideos] = useState<SeriesVideo[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [autoplay, setAutoplay] = useState(true)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const remainingRef = useRef<number | null>(null)
  const activeKeyRef = useRef<string>('')

  const isMobileUA = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
  const pParam = sp.get('p')

  useEffect(() => {
    document.title = '视频播放'
    document.documentElement.style.cssText = document.body.style.cssText = 'margin:0;background:#000'
    return () => { document.documentElement.style.cssText = document.body.style.cssText = '' }
  }, [])

  useEffect(() => {
    const id = params.id as string
    // /api/play/[id] 不区分发布状态：UUID 直链即访问凭证，未发布文章不进站点列表
    fetch(`/api/play/${id}`).then(r => r.json()).then(res => {
      if (!res.success || !res.data) { setLoading(false); return }
      const a = res.data as ArticleLite
      setArticle(a)
      let list: SeriesVideo[] = []
      if (a.content) {
        try {
          const parsed = JSON.parse(a.content)
          if (Array.isArray(parsed.videos)) list = parsed.videos
        } catch {}
      }
      if (list.length === 0 && a.bilibili_url) {
        const bvid = a.bilibili_url.match(/BV[a-zA-Z0-9]+/)?.[0] || ''
        list = [{ bvid, title: a.title || '视频', cover_url: a.cover_image || '' }]
      }
      if (list.length > 0) {
        setVideos(list)
        const rp = parseInt(sp.get('p') || '1', 10)
        const idx = rp > 1 ? list.findIndex(v => (v.page || 1) === rp) : -1
        setCurrentIndex(idx >= 0 ? idx : 0)
      }
    }).catch(() => {}).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  const currentVideo = videos[currentIndex]
  const currentBvid = currentVideo?.bvid
  const currentPage = currentVideo?.page || 1
  const currentEmbedUrl = currentBvid
    ? `https://www.bilibili.com/blackboard/html5mobileplayer.html?isOutside=true&bvid=${currentBvid}&p=${currentPage}&autoplay=1&danmaku=0&hideCoverInfo=1&hideDanmakuButton=1`
    : ''

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }, [])

  const startTimer = useCallback((seconds: number) => {
    stopTimer()
    remainingRef.current = seconds
    setRemaining(seconds)
    setPaused(false)
    tickRef.current = setInterval(() => {
      if (remainingRef.current === null) return
      remainingRef.current -= 1
      setRemaining(remainingRef.current)
      if (remainingRef.current <= 0) {
        stopTimer()
        remainingRef.current = null
        setRemaining(null)
        if (currentIndex < videos.length - 1) {
          const next = currentIndex + 1
          setCurrentIndex(next)
        } else {
          setAutoplay(false)
        }
      }
    }, 1000)
  }, [stopTimer, currentIndex, videos.length])

  const togglePause = useCallback(() => {
    if (remainingRef.current === null) return
    if (paused) {
      if (remainingRef.current > 0) startTimer(remainingRef.current)
    } else {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
      setPaused(true)
    }
  }, [paused, startTimer])

  // 用时长倒计时自动连播；时长缺失则退化为 postMessage ended 监听
  useEffect(() => {
    if (!autoplay || !currentVideo || !article) {
      stopTimer(); remainingRef.current = null; setRemaining(null); setPaused(false); activeKeyRef.current = ''
      return
    }
    const dur = currentVideo.duration || 0
    const key = `${currentIndex}:${currentBvid}`
    if (activeKeyRef.current === key && remainingRef.current !== null) return
    activeKeyRef.current = key
    if (dur > 0) {
      startTimer(dur + 5)
      return () => { stopTimer() }
    }
    remainingRef.current = null
    setRemaining(null)
    setPaused(false)
  }, [currentIndex, autoplay, currentBvid, currentVideo, article, startTimer, stopTimer])

  // B站 postMessage ended 事件兜底连播
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.origin?.includes('bilibili.com')) return
      if (autoplay && currentIndex < videos.length - 1 && !remainingRef.current) {
        const raw = e.data
        const msg = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
        if (msg && (msg.type === 'ended' || msg.event === 'ended' || msg.state === 'ended')) {
          const next = currentIndex + 1
          setCurrentIndex(next)
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentIndex, autoplay, videos.length])

  const jumpTo = (idx: number) => {
    if (idx === currentIndex) return
    stopTimer(); remainingRef.current = null; setRemaining(null); setPaused(false)
    setCurrentIndex(idx)
  }

  const playNext = () => {
    if (currentIndex < videos.length - 1) jumpTo(currentIndex + 1)
  }
  const playPrev = () => {
    if (currentIndex > 0) jumpTo(currentIndex - 1)
  }

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white/50 text-sm">加载中...</div>
    </div>
  )

  if (!article || videos.length === 0) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <p className="text-5xl mb-4">🎬</p>
        <p className="text-white/60">视频不存在或已下架</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold mb-3 line-clamp-2">{article.title}</h1>
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden mb-3">
              {currentEmbedUrl ? (
                <iframe
                  key={currentBvid}
                  src={currentEmbedUrl}
                  scrolling="no"
                  frameBorder="0"
                  allowFullScreen
                  allow="autoplay; fullscreen; encrypted-media"
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-fullscreen"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">无法播放</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={playPrev} disabled={currentIndex === 0}
                className="px-4 py-1.5 text-sm border border-white/20 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                上一集
              </button>
              <span className="text-sm text-white/50">
                {videos.length > 1 ? `${currentIndex + 1} / ${videos.length}` : '单集'}
              </span>
              <button onClick={playNext} disabled={currentIndex >= videos.length - 1 || !currentVideo}
                className="px-4 py-1.5 text-sm border border-white/20 rounded-lg hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed">
                下一集
              </button>
              {videos.length > 1 && (
                <label className="flex items-center gap-1.5 text-sm text-white/50 ml-auto cursor-pointer">
                  <input type="checkbox" checked={autoplay} onChange={e => setAutoplay(e.target.checked)} />
                  本集播完自动连播
                </label>
              )}
              {autoplay && remaining != null && (
                <button onClick={() => setAutoplay(false)}
                  className="px-3 py-1.5 text-sm border border-white/20 rounded-lg hover:bg-white/10 text-white/50 ml-2">
                  取消连播
                </button>
              )}
            </div>

            {autoplay && remaining != null && (
              <p className="text-xs text-amber-500 mb-4">
                本集约 <span className="font-semibold">{remaining}</span> 秒后自动连播下一集{remaining <= 8 ? '…' : ''}
              </p>
            )}
            {autoplay && remaining == null && videos.length > 1 && !currentVideo?.duration && (
              <p className="text-xs text-white/40 mb-4">本集时长未知，暂不自动连播（可手动切换）。</p>
            )}
            {paused && (
              <p className="text-xs text-amber-500 mb-4">连播已暂停。 <button onClick={togglePause} className="underline">继续</button></p>
            )}

            {currentVideo && (
              <>
                <h2 className="font-semibold text-base mb-1 text-white/90">{currentVideo.title}</h2>
                {article.summary && <p className="text-sm text-white/50 mb-4">{article.summary}</p>}
              </>
            )}
          </div>

          {videos.length > 1 && (
            <div className="xl:w-80 shrink-0">
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                <div className="p-3 border-b border-white/10 text-sm font-medium flex items-center gap-2">
                  <span>📋</span>
                  <span>播放列表</span>
                  <span className="text-white/40 font-normal">{videos.length} 集</span>
                </div>
                <div className="divide-y divide-white/5">
                  {videos.map((v, i) => (
                    <button key={v.bvid + (v.page || '')} onClick={() => jumpTo(i)}
                      className={`w-full flex items-center gap-3 p-3 text-left hover:bg-white/10 transition-colors ${
                        i === currentIndex ? 'bg-white/10 ring-1 ring-white/20' : ''
                      }`}>
                      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                        i === currentIndex ? 'bg-[#1a73e8] text-white' : 'bg-white/10 text-white/60'
                      }`}>
                        {i === currentIndex ? '▶' : i + 1}
                      </span>
                      {v.cover_url && (
                        <img src={v.cover_url.replace(/^http:\/\//, 'https://')} alt="" className="w-14 h-9 object-cover rounded shrink-0" referrerPolicy="no-referrer" />
                      )}
                      <span className={`text-sm line-clamp-2 ${i === currentIndex ? 'font-medium text-white' : 'text-white/70'}`}>
                        {v.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
