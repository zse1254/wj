'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface Cdn { key: string; label: string; index: number }
interface SeriesVid { title: string; bvid: string; page: number; cover_url: string; duration: number }
interface StreamInfo { duration: number; streams: StreamEntry[] }
interface StreamEntry {
  type: 'video' | 'audio'; id: number; codecs: string; width?: number; height?: number
  bandwidth: number; baseUrl: string; backupUrls: string[]; initRange: string; indexRange: string
}

function fixUrl(u: string) {
  if (!u) return ''
  return u.replace(/^http:\/\//, 'https://')
}

function buildMpd(streams: StreamEntry[], duration: number, useProxy: boolean): string {
  const proxyBase = useProxy ? '/api/cdn-proxy?u=' : ''
  const videos = streams.filter(s => s.type === 'video')
  const audios = streams.filter(s => s.type === 'audio')

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const videoReps = videos.map((v, i) => {
    const segUrl = useProxy ? proxyBase + encodeURIComponent(v.baseUrl) : v.baseUrl
    return `<Representation id="v-${v.id}-${i}" mimeType="video/mp4" bandwidth="${v.bandwidth}" width="${v.width || 1920}" height="${v.height || 1080}" codecs="${esc(v.codecs || 'avc1.64001F')}">
      <BaseURL>${esc(segUrl)}</BaseURL>
      <SegmentBase indexRange="${v.indexRange}"><Initialization range="${v.initRange}"/></SegmentBase>
    </Representation>`
  }).join('\n')

  const audioReps = audios.map((a, i) => {
    const segUrl = useProxy ? proxyBase + encodeURIComponent(a.baseUrl) : a.baseUrl
    return `<Representation id="a-${a.id}-${i}" mimeType="audio/mp4" bandwidth="${a.bandwidth}" codecs="${esc(a.codecs || 'mp4a.40.2')}">
      <BaseURL>${esc(segUrl)}</BaseURL>
      <SegmentBase indexRange="${a.indexRange}"><Initialization range="${a.initRange}"/></SegmentBase>
    </Representation>`
  }).join('\n')

  if (!videoReps && !audioReps) return ''
  return `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT${duration}S" minBufferTime="PT1.500S">
<Period id="1" start="PT0S">
<AdaptationSet id="1" contentType="video" segmentAlignment="true" bitstreamSwitching="true">${videoReps}</AdaptationSet>
<AdaptationSet id="2" contentType="audio" segmentAlignment="true" bitstreamSwitching="true">${audioReps}</AdaptationSet>
</Period></MPD>`
}

function createMpdBlob(mpdText: string): string {
  return URL.createObjectURL(new Blob([mpdText], { type: 'application/dash+xml' }))
}

export default function PlayPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const errCountRef = useRef(0)
  const activeBvidRef = useRef('')
  const activePageRef = useRef(1)
  const streamInfoRef = useRef<StreamInfo | null>(null)

  const [status, setStatus] = useState('加载中...')
  const [error, setError] = useState('')
  const [usingIframe, setUsingIframe] = useState(false)
  const [seriesVids, setSeriesVids] = useState<SeriesVid[]>([])
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesCurIdx, setSeriesCurIdx] = useState(-1)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [autoplayNext, setAutoplayNext] = useState(true)
  const [menuOpen, setMenuOpen] = useState<'' | 'cdn'>('')
  const [currentCdn, setCurrentCdn] = useState('0')
  const [useProxy, setUseProxy] = useState(true)

  const seriesVidsRef = useRef<SeriesVid[]>([])
  const seriesCurIdxRef = useRef(-1)

  useEffect(() => { seriesVidsRef.current = seriesVids }, [seriesVids])
  useEffect(() => { seriesCurIdxRef.current = seriesCurIdx }, [seriesCurIdx])

  useEffect(() => {
    document.title = 'Video Player'
    document.documentElement.style.cssText = 'overflow:hidden;margin:0;padding:0;background:#000'
    document.body.style.cssText = 'overflow:hidden;margin:0;padding:0;background:#000;min-height:100vh'
    return () => { document.documentElement.style.cssText = ''; document.body.style.cssText = '' }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'BUTTON' || t.closest('button') || t.closest('[data-menu]')) return
      setMenuOpen(''); setSeriesOpen(false)
    }
    el.addEventListener('pointerdown', handler)
    return () => { el.removeEventListener('pointerdown', handler) }
  }, [])

  useEffect(() => { load() }, [params.id, searchParams])

  function getCurrentPage(): number {
    const p = parseInt(searchParams.get('p') || '0', 10)
    return p > 0 ? p : 1
  }

  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try { playerRef.current.reset() } catch {}
      playerRef.current = null
    }
    const video = videoRef.current
    if (video) {
      try { video.removeAttribute('src'); video.load() } catch {}
    }
    streamInfoRef.current = null
    errCountRef.current = 0
  }, [])

  async function load() {
    const id = params.id as string
    setStatus('加载视频信息...')
    if (/^BV[a-zA-Z0-9]+$/.test(id)) return loadByBvid(id, getCurrentPage())
    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data
    if (article.content) {
      try {
        const content = typeof article.content === 'string' ? JSON.parse(article.content) : article.content
        let videoList: any[] = []
        if (Array.isArray(content)) videoList = content
        else if (content?.videos && Array.isArray(content.videos)) videoList = content.videos
        const vids: SeriesVid[] = videoList.map((v: any) => ({
          title: v.title || '', bvid: v.bvid || '', page: v.page || 1,
          cover_url: fixUrl(v.cover_url || v.first_frame || ''), duration: v.duration || 0,
        })).filter((v: SeriesVid) => v.bvid)
        if (vids.length > 1) {
          setSeriesVids(vids); setSeriesTitle(article.title || '合集')
          const reqPage = getCurrentPage()
          const idx = reqPage > 1 ? vids.findIndex((v) => v.page === reqPage) : 0
          setSeriesCurIdx(idx >= 0 ? idx : 0)
          seriesVidsRef.current = vids; seriesCurIdxRef.current = idx >= 0 ? idx : 0
          return loadByBvid(vids[idx >= 0 ? idx : 0].bvid, vids[idx >= 0 ? idx : 0].page)
        }
        if (vids.length === 1) return loadByBvid(vids[0].bvid, vids[0].page)
      } catch {}
    }
    if (article.bilibili_url) {
      const bvid = article.bilibili_url.match(/BV[a-zA-Z0-9]+/)?.[0]
      if (bvid) return loadByBvid(bvid, getCurrentPage())
    }
    setError('无法解析视频信息')
  }

  async function loadByBvid(bvid: string, page: number) {
    if (!page) page = 1
    destroyPlayer()
    activeBvidRef.current = bvid; activePageRef.current = page
    setStatus('获取视频信息...')

    const infoRes = await fetch(`/api/bvid/${bvid}`).catch(() => null)
    let info: { title?: string; cover_url?: string; pages?: any[] } = {}
    if (infoRes?.ok) { const ij = await infoRes.json().catch(() => ({})); if (ij.success) info = ij.data }
    if (info.title) document.title = info.title

    if (info.pages?.length && info.pages.length > 1) {
      const vids: SeriesVid[] = info.pages.map((p: any) => ({
        title: p.part || `第${p.page}集`, bvid, page: p.page || 1,
        cover_url: fixUrl(p.cover_url || ''), duration: p.duration || 0,
      }))
      setSeriesVids(vids); setSeriesTitle(info.title || bvid)
      const idx = vids.findIndex((v) => v.page === page)
      setSeriesCurIdx(idx >= 0 ? idx : 0)
      seriesVidsRef.current = vids; seriesCurIdxRef.current = idx >= 0 ? idx : 0
    } else {
      setSeriesVids([]); seriesVidsRef.current = []; seriesCurIdxRef.current = -1
    }

    setStatus('获取 DASH 流...')
    const jsonRes = await fetch(`/api/mpd/${bvid}?p=${page}&format=json`).catch(() => null)
    if (!jsonRes || !jsonRes.ok) {
      setStatus('直链获取失败，正在重试...')
      await new Promise(r => setTimeout(r, 1000))
      const retry = await fetch(`/api/mpd/${bvid}?p=${page}&format=json&_=${Date.now()}`).catch(() => null)
      if (!retry || !retry.ok) {
        setStatus('切换备用方案...')
        await fallbackToIframe(bvid, page)
        return
      }
      const retryJson = await retry.json().catch(() => null)
      if (!retryJson?.success || !retryJson?.data?.streams?.length) {
        await fallbackToIframe(bvid, page)
        return
      }
      streamInfoRef.current = retryJson.data
    } else {
      const json = await jsonRes.json().catch(() => null)
      if (!json?.success || !json?.data?.streams?.length) {
        await fallbackToIframe(bvid, page)
        return
      }
      streamInfoRef.current = json.data
    }

    const streamInfo = streamInfoRef.current
    if (!streamInfo?.streams?.length) {
      await fallbackToIframe(bvid, page)
      return
    }

    setStatus('加载播放器...')
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isAndroid = /Android/i.test(navigator.userAgent)
    const isMobile = isIOS || isAndroid

    if (!('MediaSource' in window) || isIOS) {
      setStatus('当前浏览器使用官方播放器...')
      await fallbackToIframe(bvid, page)
      return
    }

    const video = videoRef.current
    if (!video) return

    try {
      setUsingIframe(false)
      const oldIframe = video.parentElement?.querySelector('iframe')
      if (oldIframe) oldIframe.remove()
      video.style.display = 'block'

      const mpdText = buildMpd(streamInfo.streams, streamInfo.duration, useProxy)
      if (!mpdText) {
        await fallbackToIframe(bvid, page)
        return
      }
      const mpdUrl = createMpdBlob(mpdText)

      const dashjs = await import('dashjs')
      const player = dashjs.MediaPlayer().create()
      playerRef.current = player

      player.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: false, audio: false } },
          buffer: { fastSwitchEnabled: true },
        },
      })

      player.initialize(video, mpdUrl, false)

      let playbackStarted = false

      player.on('playbackPlaying', () => {
        setStatus('')
        playbackStarted = true
      })

      player.on('canPlay', () => {
        setStatus('')
      })

      player.on('streamInitialized', () => {
        setStatus('')
      })

      player.on('error', async (e: any) => {
        console.error('[dashjs error]', e)
        if (playbackStarted) return
        errCountRef.current++
        if (errCountRef.current > 2) {
          if (!useProxy) {
            setStatus('直接播放失败，切换代理...')
            errCountRef.current = 0
            setUseProxy(true)
            await loadByBvid(bvid, page)
            return
          }
          setStatus('播放失败，切换备用方案...')
          URL.revokeObjectURL(mpdUrl)
          await fallbackToIframe(bvid, page)
        }
      })

      player.on('playbackError', async (e: any) => {
        console.error('[dashjs playbackError]', e)
        if (playbackStarted) return
        errCountRef.current++
        if (errCountRef.current > 2) {
          if (!useProxy) {
            setStatus('直接播放失败，切换代理...')
            errCountRef.current = 0
            setUseProxy(true)
            await loadByBvid(bvid, page)
            return
          }
          setStatus('播放失败，切换备用方案...')
          URL.revokeObjectURL(mpdUrl)
          await fallbackToIframe(bvid, page)
        }
      })

      player.on('playbackEnded', () => {
        if (!autoplayNext) return
        const vids = seriesVidsRef.current
        const idx = seriesCurIdxRef.current
        if (vids.length > 1 && idx >= 0 && idx < vids.length - 1) {
          const next = vids[idx + 1]
          loadByBvid(next.bvid, next.page)
        }
      })

      setStatus('加载播放器...')

    } catch (e: any) {
      console.error('[dashjs init error]', e)
      setStatus('播放器初始化失败，切换备用方案...')
      await fallbackToIframe(bvid, page)
    }
  }

  function switchEpisode(idx: number) {
    const vids = seriesVidsRef.current
    if (idx < 0 || idx >= vids.length) return
    setSeriesOpen(false)
    loadByBvid(vids[idx].bvid, vids[idx].page)
  }

  function switchCdn(cdnKey: string) {
    setMenuOpen('')
    if (cdnKey === currentCdn) return
    const id = activeBvidRef.current
    localStorage.setItem(`cdn-${id}`, cdnKey)
    setCurrentCdn(cdnKey)
    setStatus(`切换源...`)
    loadByBvid(activeBvidRef.current, activePageRef.current)
  }

  async function fallbackToIframe(bvid: string, page: number) {
    destroyPlayer()
    setUsingIframe(true)
    setStatus('')
    setError('')
    const video = videoRef.current
    if (!video) return
    const container = video.parentElement
    if (!container) return
    video.style.display = 'none'
    const oldIframe = container.querySelector('iframe')
    if (oldIframe) oldIframe.remove()
    const iframe = document.createElement('iframe')
    iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page || 1}&high_quality=1&autoplay=0`
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'
    iframe.setAttribute('allowFullScreen', '')
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('scrolling', 'no')
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups')
    container.appendChild(iframe)
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    display: 'flex', gap: 6, alignItems: 'flex-start',
  }
  const btnStyle: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontFamily: 'sans-serif',
    background: 'rgba(0,0,0,.7)', color: '#fff', border: '1px solid rgba(255,255,255,.3)',
    borderRadius: 6, cursor: 'pointer', backdropFilter: 'blur(4px)',
  }
  const menuStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', right: 0, marginTop: 4,
    maxHeight: 320, overflowY: 'auto', minWidth: 160,
    background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)',
    borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)',
  }
  const itemStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px', fontFamily: 'sans-serif', fontSize: 13,
    color: active ? '#4fc3f7' : '#fff', cursor: 'pointer',
    background: active ? 'rgba(79,195,247,.15)' : 'transparent',
    borderBottom: '1px solid rgba(255,255,255,.08)',
  })

  const cdnItems = (() => {
    const streams = streamInfoRef.current?.streams || []
    const firstVideo = streams.find(s => s.type === 'video')
    if (!firstVideo) return [{ key: '0', label: '源1', sub: '' }]
    const total = 1 + (firstVideo.backupUrls?.length || 0)
    return Array.from({ length: Math.min(total, 8) }, (_, i) => ({
      key: String(i), label: `源${i + 1}`, sub: i === 0 ? '默认' : '',
    }))
  })()

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: '#000', touchAction: 'manipulation', overflow: 'hidden' }}>
      <video ref={videoRef} controls playsInline
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', display: usingIframe ? 'none' : 'block', background: '#000' }}
      />
      {!usingIframe && (
        <div style={panelStyle}>
          {seriesVids.length > 1 && (
            <div style={{ position: 'relative' }} data-menu>
              <button onClick={() => setSeriesOpen(o => !o)}
                style={{ ...btnStyle, background: seriesOpen ? 'rgba(251,114,153,.3)' : 'rgba(0,0,0,.7)' }}
              >剧集 ({seriesVids.length})</button>
              {seriesOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  maxHeight: 360, overflowY: 'auto', minWidth: 280,
                  background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)',
                  borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)',
                }} data-menu>
                  <div style={{ padding: '8px 12px', fontSize: 12, color: '#888', borderBottom: '1px solid rgba(255,255,255,.1)', fontFamily: 'sans-serif' }}>
                    {seriesTitle} ({seriesVids.length}集)
                  </div>
                  {seriesVids.map((v, i) => (
                    <div key={i} onClick={() => switchEpisode(i)} style={{
                      display: 'flex', padding: '6px 8px', fontFamily: 'sans-serif', fontSize: 13,
                      color: i === seriesCurIdx ? '#4fc3f7' : '#ccc',
                      background: i === seriesCurIdx ? 'rgba(79,195,247,.12)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,.05)',
                      cursor: 'pointer', gap: 8, alignItems: 'flex-start',
                    }}>
                      {v.cover_url ? (
                        <img src={v.cover_url} alt="" loading="lazy" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: 3, flexShrink: 0, background: '#222' }} />
                      ) : (
                        <div style={{ width: 56, height: 36, background: '#222', borderRadius: 3, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#444' }}>{i + 1}</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}>
                          {i + 1}. {v.title || `第${i + 1}集`}
                        </div>
                        {v.duration ? (
                          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                            {Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {seriesVids.length > 1 && (
            <button onClick={() => setAutoplayNext(v => !v)}
              style={{ ...btnStyle, background: autoplayNext ? 'rgba(76,175,80,.3)' : 'rgba(0,0,0,.7)', color: autoplayNext ? '#81c784' : '#fff' }}
            >{autoplayNext ? '连播' : '不连播'}</button>
          )}
          <div style={{ position: 'relative' }} data-menu>
            <button onClick={() => setMenuOpen(o => o === 'cdn' ? '' : 'cdn')} style={btnStyle}>换源 ▾</button>
            {menuOpen === 'cdn' && (
              <div style={menuStyle} data-menu>
                {cdnItems.map(it => (
                  <div key={it.key} onClick={() => switchCdn(it.key)} style={itemStyle(it.key === currentCdn)}>
                    {it.label}{it.sub && <span style={{ opacity: .6, marginLeft: 6 }}>{it.sub}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => videoRef.current?.requestFullscreen?.().catch(() => {})}
            style={btnStyle}>全屏</button>
        </div>
      )}
      {(status || error) && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          color: '#999', fontFamily: 'sans-serif', fontSize: 14, background: 'rgba(0,0,0,.7)',
          padding: '8px 16px', borderRadius: 8, whiteSpace: 'nowrap',
        }}>{error || status}</div>
      )}
    </div>
  )
}
