'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import FavoriteButton from '@/components/FavoriteButton'
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const requestedBvidsRef = useRef<Set<string>>(new Set())
  const [durations, setDurations] = useState<Record<number, number>>({})
  const [remaining, setRemaining] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    fetch(`/api/articles/${params.id}`).then(r => r.json()).then(res => {
      if (res.success) {
        setArticle(res.data)
        let list: SeriesVideo[] = []
        try {
          const parsed = JSON.parse(res.data.content || '{}')
          if (Array.isArray(parsed.videos)) list = parsed.videos
        } catch {}
        if (list.length === 0 && res.data.bilibili_url) {
          const bvid = res.data.bilibili_url.match(/BV[a-zA-Z0-9]+/)?.[0] || ''
          list = [{ bvid, title: res.data.title || '视频', cover_url: res.data.cover_image || '' }]
        }
        if (list.length > 0) {
          setVideos(list)
          const preset: Record<number, number> = {}
          list.forEach((v: SeriesVideo, i: number) => {
            if (typeof v.duration === 'number' && v.duration > 0) preset[i] = v.duration
          })
          if (Object.keys(preset).length > 0) setDurations(preset)
        }
      }
    }).finally(() => setLoading(false))
  }, [params.id])

  // Fallback: fetch exact per-page durations from Bilibili view API (via CORS proxies)
  // or fall back to Deno proxy total/count if exact unavailable.
  useEffect(() => {
    if (videos.length === 0) return
    ;(async () => {
      const bvids = Array.from(new Set(videos.map(v => v.bvid)))
      const exactByIndex: Record<number, number> = {}

      for (const bvid of bvids) {
        // Only fetch for videos that DON'T already have a duration from the article
        const idxNeeding = videos.reduce<number[]>((acc, v, i) => {
          if (v.bvid === bvid && !v.duration) acc.push(i)
          return acc
        }, [])
        if (idxNeeding.length === 0) continue

        // Try Bilibili view API through CORS proxies for exact pages durations
        let gotExact = false
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
        const corsProxies = [
          (u: string) => `https://api.allorigins.cn/raw?url=${encodeURIComponent(u)}`,
          (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
          (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u: string) => `https://api.allorigins.io/raw?url=${encodeURIComponent(u)}`,
          (u: string) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
        ]
        for (const buildProxy of corsProxies) {
          try {
            const c1 = new AbortController()
            const t1 = setTimeout(() => c1.abort(), 8000)
            const res = await fetch(buildProxy(apiUrl), { signal: c1.signal }).finally(() => clearTimeout(t1))
            if (!res.ok) continue
            const json = await res.json()
            if (json.code === 0 && Array.isArray(json.data?.pages)) {
              for (const p of json.data.pages) {
                const pg = Number(p.page) || 0
                const dur = Number(p.duration) || 0
                if (pg && dur) {
                  videos.forEach((v, i) => {
                    if (v.bvid === bvid && (v.page || i + 1) === pg && exactByIndex[i] == null) {
                      exactByIndex[i] = dur
                    }
                  })
                }
              }
              gotExact = true
              break
            }
          } catch {}
        }
        if (gotExact) continue

        // Fallback: Deno proxy — per-page exact durations if available, otherwise total/count
        if (requestedBvidsRef.current.has(bvid)) continue
        requestedBvidsRef.current.add(bvid)
        try {
          const c = new AbortController()
          const t = setTimeout(() => c.abort(), 8000)
          const res = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `https://www.bilibili.com/video/${bvid}` }),
            signal: c.signal,
          }).finally(() => clearTimeout(t))
          const data = await res.json()
          if (data.success && Array.isArray(data.data?.series?.videos)) {
            const pagesByPage: Record<number, number> = {}
            for (const v of data.data.series.videos as Array<{ page?: number; duration?: number }>) {
              if (v.page && v.duration) pagesByPage[v.page] = v.duration
            }
            if (Object.keys(pagesByPage).length > 0) {
              for (let i = 0; i < videos.length; i++) {
                if (videos[i].bvid === bvid && exactByIndex[i] == null) {
                  const pg = videos[i].page || i + 1
                  if (pagesByPage[pg]) exactByIndex[i] = pagesByPage[pg]
                }
              }
              continue
            }
          }
          // Fallback: total duration only → average
          if (data.success && data.data?.video?.duration) {
            const count = videos.filter(v => v.bvid === bvid).length
            const per = Math.max(30, Math.round(data.data.video.duration / count))
            idxNeeding.forEach(i => { if (exactByIndex[i] == null) exactByIndex[i] = per })
          }
        } catch {}
      }

      if (Object.keys(exactByIndex).length === 0) return
      setDurations(prev => ({ ...prev, ...exactByIndex }))
    })()
  }, [videos])

  // Restore playback position
  useEffect(() => {
    if (!article) return
    const key = `series_${article.id}`
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}')
      if (typeof saved.index === 'number') queueMicrotask(() => setCurrentIndex(saved.index))
    } catch {}
  }, [article])

  const saveProgress = useCallback((idx: number) => {
    if (!article) return
    const key = `series_${article.id}`
    localStorage.setItem(key, JSON.stringify({ index: idx, updated_at: Date.now() }))
  }, [article])

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

  // Listen ALL postMessage from Bilibili to find ended event
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.origin?.includes('bilibili.com')) return
      console.log('[Bili msg]', JSON.stringify(e.data).slice(0, 200))
      if (autoplay && currentIndex < videos.length - 1) {
        const raw = e.data
        const msg = typeof raw === 'string' ? (() => { try { return JSON.parse(raw) } catch { return null } })() : raw
        if (msg && (msg.type === 'ended' || msg.event === 'ended' || msg.state === 'ended')) {
          console.log('[Bili msg] -> playNext!')
          playNext()
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentIndex, autoplay, videos.length, playNext])

  // beforeunload: do NOT advance episode on refresh/navigation.
  // (Previously this called playNext, causing a refresh to skip to the next episode.)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Countdown timer with pause/resume support
  const remainingRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeKeyRef = useRef<string>('')

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
        playNext()
      }
    }, 1000)
  }, [stopTimer, playNext])

  const togglePause = useCallback(() => {
    if (remainingRef.current === null) return
    if (paused) {
      // resume: continue from remaining
      if (remainingRef.current > 0) startTimer(remainingRef.current)
    } else {
      // pause: freeze remaining
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
      setPaused(true)
    }
  }, [paused, startTimer])

  const currentVideo = videos[currentIndex]
  const currentBvid = currentVideo?.bvid
  const currentPage = currentVideo?.page || 1
  // 极简模式: html5mobileplayer 天然无 logo/标题/进入按钮/推荐, hideCoverInfo 隐藏播放量, danmaku 关弹幕
  const currentEmbedUrl = currentBvid
    ? `https://www.bilibili.com/blackboard/html5mobileplayer.html?isOutside=true&bvid=${currentBvid}&p=${currentPage}&autoplay=1&muted=1&danmaku=0&hideCoverInfo=1&noFullScreenButton=0`
    : ''

  useEffect(() => {
    if (!autoplay || !currentVideo) {
      stopTimer()
      remainingRef.current = null
      setRemaining(null)
      setPaused(false)
      activeKeyRef.current = ''
      return
    }
    const dur = durations[currentIndex] ?? currentVideo.duration ?? 0
    if (!dur) {
      stopTimer()
      remainingRef.current = null
      setRemaining(null)
      setPaused(false)
      activeKeyRef.current = ''
      return
    }
    // Only (re)start when the active episode changes — NOT when durations state updates,
    // otherwise the countdown resets on every fetch and pause appears broken.
    const key = `${currentIndex}:${currentBvid}`
    if (activeKeyRef.current === key && remainingRef.current !== null) return
    activeKeyRef.current = key
    startTimer(dur + 5)
    return () => { stopTimer() }
  }, [currentIndex, autoplay, currentBvid, currentVideo, startTimer, stopTimer])

  if (loading) return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="animate-pulse"><div className="aspect-video bg-gray-200 rounded-xl mb-6" /><div className="h-8 bg-gray-200 rounded w-1/2 mb-4" /><div className="h-4 bg-gray-200 rounded w-1/4 mb-6" /><div className="space-y-2"><div className="h-12 bg-gray-200 rounded" /><div className="h-12 bg-gray-200 rounded" /><div className="h-12 bg-gray-200 rounded" /></div></div>
      </main>
      <Footer />
    </>
  )

  if (!article) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="text-center"><p className="text-4xl mb-4">📺</p><p className="text-gray-500">合集不存在</p><Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link></div></main>
      <Footer />
    </>
  )

  if (videos.length === 0) return (
    <>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">
        <div className="text-center py-12">
          <p className="text-4xl mb-4">📺</p>
          <p className="text-gray-500 mb-2">合集内容为空</p>
          <pre className="text-left text-xs bg-gray-100 p-4 rounded max-w-xl mx-auto overflow-auto mt-4">
            <code>{JSON.stringify({ id: article.id, title: article.title, content_len: (article.content||'').length, content_preview: (article.content||'').slice(0,200), bilibili_url: article.bilibili_url }, null, 2)}</code>
          </pre>
          <Link href="/" className="text-[#1a73e8] hover:underline mt-4 inline-block">返回首页</Link>
        </div>
      </main>
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
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
            <span className="bg-blue-50 text-[#1a73e8] px-2 py-0.5 rounded">{article.category_name}</span>
            <span>{videos.length} 集</span>
            <span>{new Date(article.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
        )}
        <div className="flex items-center gap-3 mb-5">
          <FavoriteButton type="series" id={String(article.id)} />
          <button onClick={() => {
            const reason = prompt('请填写举报理由（如侵权/违规）：')
            if (!reason) return
            fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId: article.id, reason }) })
              .then(r => r.json()).then(res => { if (res.success) alert('已收到举报'); else alert(res.error || '提交失败') })
              .catch(() => alert('网络错误'))
          }} className="text-xs text-gray-400 hover:text-red-500">举报</button>
        </div>

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
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin"
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
                本集播完自动连播
              </label>
              {autoplay && remaining != null && (
                <button onClick={() => setAutoplay(false)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500 ml-2">
                  取消连播
                </button>
              )}
            </div>

            {autoplay && remaining != null && (
              <p className="text-xs text-amber-600 mb-4">
                本集约 <span className="font-semibold">{remaining}</span> 秒后自动连播下一集{remaining <= 8 ? '…' : ''}（如需暂停视频请用播放器控件）
              </p>
            )}

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
