'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface SeriesVid { title: string; bvid: string; page: number; cover_url: string; duration: number }

// CDN host labels from PiliPalaX APK
const CDN_HOSTS = [
  { host: 'upos-sz-mirrorcos.bilivideo.com',   label: '腾讯 COS' },
  { host: 'upos-sz-mirrorcosb.bilivideo.com',  label: '腾讯 COS B' },
  { host: 'upos-sz-mirrorali.bilivideo.com',   label: '阿里云' },
  { host: 'upos-sz-mirroralib.bilivideo.com',  label: '阿里 B' },
  { host: 'upos-sz-mirrorhw.bilivideo.com',    label: '华为云' },
  { host: 'upos-sz-mirrorhwb.bilivideo.com',   label: '华为 B' },
  { host: 'upos-sz-mirrorhwer.bilivideo.com',  label: '华为 ER' },
  { host: 'upos-sz-mirror08h.bilivideo.com',   label: 'B站 08h' },
  { host: 'upos-sz-mirror08ct.bilivideo.com',  label: 'B站 08ct' },
  { host: 'upos-tf-all-tx.bilivideo.com',      label: '腾讯全节点' },
  { host: 'cn-hk-eq-bcache-01.bilivideo.com',  label: '香港' },
  { host: 'upos-hz-mirrorakam.akamaized.net',  label: 'Akamai' },
  { host: 'upos-sz-mirrorcosov.bilivideo.com', label: '腾讯 OV' },
  { host: 'upos-sz-mirrorcoso1.bilivideo.com', label: '腾讯 O1' },
  { host: 'upos-sz-mirroralio1.bilivideo.com', label: '阿里 O1' },
  { host: 'upos-sz-mirroraliov.bilivideo.com', label: '阿里 OV' },
  { host: 'upos-sz-mirrorhwo1.bilivideo.com',  label: '华为 O1' },
  { host: 'upos-sz-mirror08c.bilivideo.com',   label: 'B站 08c' },
  { host: 'upos-tf-all-hw.bilivideo.com',      label: '华为全节点' },
]

function fixUrl(u: string) { return u ? u.replace(/^http:\/\//, 'https://') : '' }

export default function PlayPage() {
  const params = useParams()
  const sp = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const errRef = useRef(0)
  const retryRef = useRef(0)
  const dashFallbackRef = useRef(false)
  const bvidRef = useRef('')
  const pageRef = useRef(1)
  const vsRef = useRef<SeriesVid[]>([])
  const ciRef = useRef(-1)
  const autoplayNextRef = useRef(true)
  const loadSeqRef = useRef(0)
  const MAX_ERR = 5

  const [status, setStatus] = useState('加载中...')
  const [vids, setVids] = useState<SeriesVid[]>([])
  const [seriesTitle, setSeriesTitle] = useState('')
  const [curIdx, setCurIdx] = useState(-1)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [autoplayNext, setAutoplayNext] = useState(true)
  const [menuOpen, setMenuOpen] = useState('')
  const [soundBlocked, setSoundBlocked] = useState(false)

  const isMobileUA = typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)

  useEffect(() => { vsRef.current = vids }, [vids])
  useEffect(() => { ciRef.current = curIdx }, [curIdx])
  useEffect(() => { autoplayNextRef.current = autoplayNext }, [autoplayNext])

  useEffect(() => {
    document.title = 'Video Player'
    document.documentElement.style.cssText = document.body.style.cssText = 'overflow:hidden;margin:0;padding:0;background:#000'
    return () => { document.documentElement.style.cssText = document.body.style.cssText = '' }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const h = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'BUTTON' || t.closest('button') || t.closest('[data-menu]')) return
      setMenuOpen(''); setSeriesOpen(false)
    }
    el.addEventListener('pointerdown', h)
    return () => el.removeEventListener('pointerdown', h)
  }, [])

  const pParam = sp.get('p')

  useEffect(() => { load() }, [params.id, pParam])

  // 原生 <video> 播完（手机 durl mp4 / CDN 换源后）自动连播下一集
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const handleEnded = () => {
      if (!autoplayNextRef.current) return
      const vs = vsRef.current; const ci = ciRef.current
      if (vs.length > 1 && ci >= 0 && ci < vs.length - 1) {
        playVid(vs[ci + 1].bvid, vs[ci + 1].page)
      }
    }
    v.addEventListener('ended', handleEnded)
    return () => v.removeEventListener('ended', handleEnded)
  }, [])

  function getCurPage(): number {
    const p = parseInt(sp.get('p') || '1', 10); return p > 0 ? p : 1
  }

  function destroy() {
    if (playerRef.current) { try { playerRef.current.reset() } catch {}; playerRef.current = null }
    const v = videoRef.current; if (v) { try { v.removeAttribute('src'); v.load() } catch {} }
    errRef.current = 0
    retryRef.current = 0
    dashFallbackRef.current = false
  }

  // 自动播放可能被浏览器（尤其手机/iframe）拦截带声音播放。
  // 先试正常播放；被拒则静音自动播，并提示用户点击开启声音。
  async function tryAutoplay(v: HTMLVideoElement) {
    try {
      const p = v.play()
      if (p) { await p; setSoundBlocked(false); return }
      setSoundBlocked(false)
    } catch {
      try {
        v.muted = true
        const p = v.play()
        if (p) await p
        setSoundBlocked(true)
      } catch { setSoundBlocked(false) }
    }
  }

  // 解析 Deno 直连 URL（?json=1 返回直链，避免 <video> 请求跨域 302 时浏览器剥离 Range 头）
  // 返回 null 表示直链不可用
  async function resolveDurl(bvid: string, page: number, i = 0): Promise<string | null> {
    try {
      const res = await fetch(`/api/durl/${bvid}?p=${page}&i=${i}&json=1`)
      if (!res.ok) return null
      const j = await res.json().catch(() => null)
      return j?.success && j.url ? j.url : null
    } catch { return null }
  }

  async function load() {
    const seq = ++loadSeqRef.current
    const id = params.id as string
    if (/^BV[a-zA-Z0-9]+$/.test(id)) return loadVideo(id, getCurPage())

    setStatus('加载视频信息...')
    const res = await fetch(`/api/articles/${id}`).catch(() => null)
    if (!res?.ok) { setStatus('视频不存在'); return }
    const json = await res.json()
    if (!json.success || !json.data) { setStatus('视频不存在'); return }
    if (loadSeqRef.current !== seq) return

    const article = json.data
    const isSeriesType = article.type === 'series'
    // 无论 content 解析结果如何，只要文章是合集类型且能从 /api/bvid 拿到多分P，
    // 就必须保证走"合集界面"，绝不能退化成单集播放器
    let items: SeriesVid[] = []
    if (article.content) {
      try {
        const content = typeof article.content === 'string' ? JSON.parse(article.content) : article.content
        let list: any[] = Array.isArray(content) ? content : content?.videos || []
        items = list.map((v: any) => ({
          title: v.title || '', bvid: v.bvid || '', page: v.page || 1,
          cover_url: fixUrl(v.cover_url || v.first_frame || ''), duration: v.duration || 0,
        })).filter((v: SeriesVid) => v.bvid)
      } catch {}
    }
    if (items.length > 1) {
      setVids(items); setSeriesTitle(article.title || '合集')
      const rp = getCurPage()
      const idx = rp > 1 ? items.findIndex((v) => v.page === rp) : 0
      setCurIdx(idx >= 0 ? idx : 0)
      vsRef.current = items; ciRef.current = idx >= 0 ? idx : 0
      return loadVideo(items[idx >= 0 ? idx : 0].bvid, items[idx >= 0 ? idx : 0].page)
    }
    if (items.length === 1) return loadVideo(items[0].bvid, items[0].page)
    if (isSeriesType && article.bilibili_url) {
      // 合集类型但 content.videos 解析失败/缺失 → 用 bvid 重新拉分P重建合集，
      // 避免退化成单集（手机上最常见的退化原因就是这里）
      const bvid = article.bilibili_url.match(/BV[a-zA-Z0-9]+/)?.[0]
      if (bvid) {
        const infoRes = await fetch(`/api/bvid/${bvid}`).catch(() => null)
        if (infoRes?.ok) {
          const ij = await infoRes.json().catch(() => ({}))
          const pages = ij?.success ? ij.data?.pages : null
          if (Array.isArray(pages) && pages.length > 1) {
            const rebuilt: SeriesVid[] = pages.map((p: any) => ({
              title: p.part || `第${p.page}集`, bvid, page: p.page || 1,
              cover_url: fixUrl(p.cover_url || ''), duration: p.duration || 0,
            }))
            setVids(rebuilt); setSeriesTitle(article.title || '合集')
            setCurIdx(0); vsRef.current = rebuilt; ciRef.current = 0
            return loadVideo(bvid, rebuilt[0].page)
          }
        }
      }
    }
    if (article.bilibili_url) {
      const bvid = article.bilibili_url.match(/BV[a-zA-Z0-9]+/)?.[0]
      if (bvid) return loadVideo(bvid, getCurPage())
    }
    setStatus('无法解析视频')
  }

  async function loadVideo(bvid: string, page: number) {
    if (!page) page = 1
    destroy(); bvidRef.current = bvid; pageRef.current = page

    // 1. Fetch video info
    setStatus('获取视频信息...')
    const infoRes = await fetch(`/api/bvid/${bvid}`).catch(() => null)
    let info: any = {}
    if (infoRes?.ok) { const ij = await infoRes.json().catch(() => ({})); if (ij.success) info = ij.data }
    if (info.title) document.title = info.title

    if (info.pages?.length > 1) {
      const items: SeriesVid[] = info.pages.map((p: any) => ({
        title: p.part || `第${p.page}集`, bvid, page: p.page || 1,
        cover_url: fixUrl(p.cover_url || ''), duration: p.duration || 0,
      }))
      setVids(items); setSeriesTitle(info.title || bvid)
      const idx = items.findIndex((v: SeriesVid) => v.page === page)
      setCurIdx(idx >= 0 ? idx : 0)
      vsRef.current = items; ciRef.current = idx >= 0 ? idx : 0
    } else if (vsRef.current.length === 0) {
      setVids([]); vsRef.current = []; ciRef.current = -1
    } else {
      // 已从 article.content 解析出合集列表，保留不动
      const idx = vsRef.current.findIndex((v: SeriesVid) => v.page === page)
      setCurIdx(idx >= 0 ? idx : 0)
      ciRef.current = idx >= 0 ? idx : 0
    }

    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isAndroid = /Android/i.test(navigator.userAgent)
    const isMobile = isiOS || isAndroid

    const video = videoRef.current

    // 1. 播放方案（以"省 Deno 额度"为核心）：
    //    durl 完整 mp4（360p）：仅 1-2 次 Deno 请求/视频，浏览器原生流式播放（mp4 渐进式/可seek）。
    //    所有设备（含手机）优先 durl；dash.js 分片（每片都走 Deno，300+次/视频）只作最后兜底。
    setStatus('加载视频...')
    if (video) {
      const oldIframe = video.parentElement?.querySelector('iframe'); if (oldIframe) oldIframe.remove()
      video.style.display = 'block'
      if (playerRef.current) { try { playerRef.current.reset() } catch {}; playerRef.current = null }
    }

    let mp4Failed = false
    let stallTimer: ReturnType<typeof setInterval> | null = null
    let lastProgress = 0
    // durl 失败统一入口：手机端优先换 Deno 代理重试（Deno 代理速度波动大，换一个可能质变），
    // 桌面端直接走 dash.js（720p 高清更好）。手机端代理穷尽后才退 dash。（用 let 延迟绑定 retryDurl/startDashPlay）
    let handleDurlFailure: () => any = () => startDashPlay()
    // 手机端 Deno 慢，但也不能让它无限重试拖太久；手机端 stall 更短、重试上限更低，
    // 尽快切到 dash.js（720p 分片顺序加载，抗慢网更稳）兜底
    const stallMs = isMobile ? 12000 : 10000
    const MAX_MOBILE_RETRY = 2
    const clearStall = () => { if (stallTimer) { clearInterval(stallTimer); stallTimer = null } }
    const armStall = () => {
      clearStall()
      lastProgress = Date.now()
      stallTimer = setInterval(() => {
        if (mp4Failed) return
        if (Date.now() - lastProgress > stallMs) {
          mp4Failed = true
          clearStall()
          setStatus('直链超时，尝试其他节点...')
          handleDurlFailure()
        }
      }, 3000)
    }
    const progressHandler = () => { lastProgress = Date.now() }

    const mp4ErrorHandler = async () => {
      if (mp4Failed) return
      mp4Failed = true
      clearStall()
      setStatus('直链失败，尝试其他节点...')
      await handleDurlFailure()
    }
    const mp4LoadHandler = () => {
      clearStall()
      setStatus('')
      if (video) tryAutoplay(video)
    }

    if (video) {
      video.removeEventListener('error', mp4ErrorHandler)
      video.removeEventListener('loadeddata', mp4LoadHandler)
      video.removeEventListener('progress', progressHandler)
      video.addEventListener('error', mp4ErrorHandler)
      video.addEventListener('loadeddata', mp4LoadHandler)
      video.addEventListener('progress', progressHandler)
      const direct = await resolveDurl(bvid, page)
      if (direct) {
        video.src = direct
        video.load()
        armStall()
      } else {
        mp4Failed = true
        setStatus('直链不可用，尝试其他节点...')
        await handleDurlFailure()
      }
    }

    // durl 失败统一入口：所有设备都优先换 Deno 代理重试（Deno 代理速度波动大，换一个可能质变），
    // 重试耗尽后才退 dash.js（dash 每分片都走 Deno，300+次/视频，极其烧额度，仅作最后兜底）。
    handleDurlFailure = () => retryDurl()
    // durl 失败 → 轮换 Deno 节点重试；全部失败且支持 MSE 才退到 dash.js，绝不再跳官方 iframe
    async function retryDurl() {
      const v = videoRef.current
      if (!v) return
      retryRef.current++
      const retryLimit = MAX_MOBILE_RETRY
      if (retryRef.current >= retryLimit) {
        const hasMSE = typeof window !== 'undefined' && 'MediaSource' in window
        if (hasMSE && !dashFallbackRef.current) {
          dashFallbackRef.current = true
          await startDashPlay()
          return
        }
        setStatus('直链播放失败，请稍后重试')
        return
      }
      mp4Failed = false
      v.removeEventListener('error', mp4ErrorHandler)
      v.removeEventListener('loadeddata', mp4LoadHandler)
      v.removeEventListener('progress', progressHandler)
      // i 固定为 0：每次重新 resolveDurl 会随机挑一个 Deno 代理，
      // 且主源永远是 loadAndCachePlayurl 重排后的健康源（换 backup 反而更慢）
      const direct = await resolveDurl(bvid, page)
      if (!direct) {
        v.addEventListener('error', mp4ErrorHandler)
        v.addEventListener('loadeddata', mp4LoadHandler)
        v.addEventListener('progress', progressHandler)
        armStall()
        await tryAutoplay(v)
        return
      }
      v.src = direct
      v.load()
      v.addEventListener('error', mp4ErrorHandler)
      v.addEventListener('loadeddata', mp4LoadHandler)
      v.addEventListener('progress', progressHandler)
      armStall()
      await tryAutoplay(v)
    }

    // 桌面端 durl 失败 → dash.js 高清（720p）兜底；手机端 durl 节点全失败也退到 dash.js。
    // 失败也只换节点不再跳 iframe
    async function startDashPlay() {
      const v = videoRef.current
      const hasMSE = typeof window !== 'undefined' && 'MediaSource' in window
      if (!v || !hasMSE) {
        await retryDurl(); return
      }
      setStatus('加载高清流...')
      errRef.current = 0
      const mpdUrl = `/api/mpd/${bvid}?p=${page}`
      try {
        const dashjs = await import('dashjs')
        const player = dashjs.MediaPlayer().create()
        playerRef.current = player
        player.updateSettings({
          streaming: {
            abr: {
              // 手机慢速网络下自动降码率（480p→360p），保证流畅不断
              autoSwitchBitrate: { video: true, audio: true },
              maxBitrate: { video: 200000, audio: 140000 },
            },
            buffer: { fastSwitchEnabled: true },
          },
        })
        player.initialize(v, mpdUrl, true)
        let started = false
        player.on('streamInitialized', () => { setStatus(''); if (v && !started) tryAutoplay(v).catch(() => {}) })
        player.on('playbackPlaying', () => { setStatus(''); started = true })
        player.on('canPlay', () => { setStatus(''); if (v && !started) tryAutoplay(v).catch(() => {}) })
        player.on('error', async () => {
          if (started) return
          errRef.current++
          if (errRef.current >= MAX_ERR) { await retryDurl() }
        })
        player.on('playbackError', async () => {
          if (started) return
          errRef.current++
          if (errRef.current >= MAX_ERR) { await retryDurl() }
        })
        player.on('playbackEnded', () => {
          if (!autoplayNext) return
          const vs = vsRef.current; const ci = ciRef.current
          if (vs.length > 1 && ci >= 0 && ci < vs.length - 1) {
            playVid(vs[ci + 1].bvid, vs[ci + 1].page)
          }
        })
      } catch (e: any) {
        console.error('[dashjs]', e)
        await retryDurl()
      }
    }
    }

  function playVid(bvid: string, page: number) { return loadVideo(bvid, page) }

  function switchEpisode(idx: number) {
    const vs = vsRef.current; if (idx < 0 || idx >= vs.length) return
    setSeriesOpen(false); playVid(vs[idx].bvid, vs[idx].page)
  }

  async function switchCdn(it: { host: string; label: string }) {
    setMenuOpen('')
    const bvid = bvidRef.current; const page = pageRef.current
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent)
    const v = videoRef.current

    if (isMobile || !v || !('MediaSource' in window)) {
      // durl 模式：换源 = 重新请求 durl 直链（绕过 302 丢 Range，直连 Deno）
      setStatus(`重新加载...`)
      destroy()
      const video = videoRef.current
      if (!video) return
      const direct = await resolveDurl(bvid, page)
      if (!direct) { setStatus('直链不可用'); return }
      video.src = direct
      video.load()
      await tryAutoplay(video)
      return
    }

    // dash.js 模式：换源 = 换 CDN host
    const newMpdUrl = `/api/mpd/${bvid}?p=${page}&cdn=host:${it.host}`
    setStatus(`切换: ${it.label}`)

    destroy()
    if (!v) return
    const dashjs = await import('dashjs')
    const player = dashjs.MediaPlayer().create()
    playerRef.current = player
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: false, audio: false } }, buffer: { fastSwitchEnabled: true } },
    })
    player.initialize(v, newMpdUrl, false)
  }

  // ----- JSX -----

  const panel: React.CSSProperties = { position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }
  const btn: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontFamily: 'sans-serif', background: 'rgba(0,0,0,.7)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, cursor: 'pointer', backdropFilter: 'blur(4px)' }
  const menu: React.CSSProperties = { position: 'absolute', top: '100%', right: 0, marginTop: 4, maxHeight: 320, overflowY: 'auto', minWidth: 180, background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)' }
  const item = (active: boolean): React.CSSProperties => ({ padding: '8px 14px', fontFamily: 'sans-serif', fontSize: 13, color: active ? '#4fc3f7' : '#fff', cursor: 'pointer', background: active ? 'rgba(79,195,247,.15)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,.08)' })

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: '#000', touchAction: 'manipulation', overflow: 'hidden' }}>
      <video ref={videoRef} controls playsInline
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: '#000' }}
      />
      <div style={panel}>
        {vids.length > 1 && (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setSeriesOpen(o => !o)} style={{ ...btn, background: seriesOpen ? 'rgba(251,114,153,.3)' : 'rgba(0,0,0,.7)' }} data-menu>
              剧集 ({vids.length})
            </button>
            {seriesOpen && (
              <div style={{ ...menu, minWidth: 280 }} data-menu>
                <div style={{ padding: '8px 12px', fontSize: 12, color: '#888', borderBottom: '1px solid rgba(255,255,255,.1)', fontFamily: 'sans-serif' }}>
                  {seriesTitle} ({vids.length}集)
                </div>
                {vids.map((v, i) => (
                  <div key={i} onClick={() => switchEpisode(i)} style={{ display: 'flex', padding: '6px 8px', fontFamily: 'sans-serif', fontSize: 13, color: i === curIdx ? '#4fc3f7' : '#ccc', background: i === curIdx ? 'rgba(79,195,247,.12)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,.05)', cursor: 'pointer', gap: 8, alignItems: 'flex-start' }}>
                    {v.cover_url ? (
                      <img src={v.cover_url} alt="" loading="lazy" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 3, flexShrink: 0, background: '#222' }} />
                    ) : (
                      <div style={{ width: 56, height: 36, background: '#222', borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#444' }}>{i + 1}</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>{i + 1}. {v.title || `第${i + 1}集`}</div>
                      {v.duration ? <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}</div> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {vids.length > 1 && (
          <button onClick={() => setAutoplayNext(v => !v)} style={{ ...btn, background: autoplayNext ? 'rgba(76,175,80,.3)' : 'rgba(0,0,0,.7)', color: autoplayNext ? '#81c784' : '#fff' }}>
            {autoplayNext ? '连播' : '不连播'}
          </button>
        )}
        <div style={{ position: 'relative' }} data-menu>
          <button onClick={() => setMenuOpen(o => o === 'cdn' ? '' : 'cdn')} style={btn}>换源 ▾</button>
          {menuOpen === 'cdn' && (
            <div style={menu} data-menu>
              {CDN_HOSTS.map(h => (
                <div key={h.host} onClick={() => switchCdn(h)} style={item(false)}>{h.label}</div>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => videoRef.current?.requestFullscreen?.().catch(() => {})} style={btn}>全屏</button>
      </div>
      {soundBlocked && (
        <button onClick={async () => {
          const v = videoRef.current; if (!v) return
          v.muted = false
          try { await v.play(); setSoundBlocked(false) } catch {}
        }} style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 12, padding: '14px 26px', fontSize: 15, fontFamily: 'sans-serif', background: 'rgba(0,0,0,.75)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 999, cursor: 'pointer', backdropFilter: 'blur(4px)', whiteSpace: 'nowrap' }}>
          🔊 点击开启声音
        </button>
      )}
      {status && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', color: '#999', fontFamily: 'sans-serif', fontSize: 14, background: 'rgba(0,0,0,.7)', padding: '8px 16px', borderRadius: 8, whiteSpace: 'nowrap' }}>
          {status}
        </div>
      )}
      {/* 手机端：底部常驻剧集横条，点选即播 */}
      {vids.length > 1 && isMobileUA && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11, background: 'rgba(0,0,0,.85)', padding: '8px 0 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ paddingLeft: 12, fontFamily: 'sans-serif', fontSize: 12, color: '#ff6b8a', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {curIdx + 1}/{vids.length}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingRight: 12 }}>
            {vids.map((v, i) => (
              <div key={i} onClick={() => switchEpisode(i)} style={{
                minWidth: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, fontFamily: 'sans-serif', fontSize: 14, cursor: 'pointer', flexShrink: 0,
                background: i === curIdx ? 'rgba(251,114,153,.35)' : 'rgba(255,255,255,.12)',
                color: i === curIdx ? '#fff' : 'rgba(255,255,255,.7)', border: i === curIdx ? '1px solid #ff6b8a' : '1px solid rgba(255,255,255,.15)',
              }}>{i + 1}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}