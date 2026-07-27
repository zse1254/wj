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
  const bvidRef = useRef('')
  const pageRef = useRef(1)
  const vsRef = useRef<SeriesVid[]>([])
  const ciRef = useRef(-1)
  const MAX_ERR = 2

  const [status, setStatus] = useState('加载中...')
  const [usingIframe, setUsingIframe] = useState(false)
  const [vids, setVids] = useState<SeriesVid[]>([])
  const [seriesTitle, setSeriesTitle] = useState('')
  const [curIdx, setCurIdx] = useState(-1)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [autoplayNext, setAutoplayNext] = useState(true)
  const [menuOpen, setMenuOpen] = useState('')

  useEffect(() => { vsRef.current = vids }, [vids])
  useEffect(() => { ciRef.current = curIdx }, [curIdx])

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

  useEffect(() => { load() }, [params.id, sp])

  function getCurPage(): number {
    const p = parseInt(sp.get('p') || '1', 10); return p > 0 ? p : 1
  }

  function destroy() {
    if (playerRef.current) { try { playerRef.current.reset() } catch {}; playerRef.current = null }
    const v = videoRef.current; if (v) { try { v.removeAttribute('src'); v.load() } catch {} }
    errRef.current = 0
  }

  async function fallback(bvid: string, page: number) {
    destroy(); setUsingIframe(true); setStatus('')
    const v = videoRef.current; if (!v) return
    const c = v.parentElement; if (!c) return
    v.style.display = 'none'
    const old = c.querySelector('iframe'); if (old) old.remove()
    const iframe = document.createElement('iframe')
    iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page || 1}&high_quality=1&autoplay=1`
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'
    iframe.setAttribute('allowFullScreen', 'true')
    iframe.setAttribute('frameborder', '0')
    iframe.setAttribute('scrolling', 'no')
    c.appendChild(iframe)
  }

  async function load() {
    const id = params.id as string
    if (/^BV[a-zA-Z0-9]+$/.test(id)) return loadVideo(id, getCurPage())

    setStatus('加载视频信息...')
    const res = await fetch(`/api/articles/${id}`).catch(() => null)
    if (!res?.ok) { setStatus('视频不存在'); return }
    const json = await res.json()
    if (!json.success || !json.data) { setStatus('视频不存在'); return }

    const article = json.data
    if (article.content) {
      try {
        const content = typeof article.content === 'string' ? JSON.parse(article.content) : article.content
        let list: any[] = Array.isArray(content) ? content : content?.videos || []
        const items: SeriesVid[] = list.map((v: any) => ({
          title: v.title || '', bvid: v.bvid || '', page: v.page || 1,
          cover_url: fixUrl(v.cover_url || v.first_frame || ''), duration: v.duration || 0,
        })).filter((v: SeriesVid) => v.bvid)
        if (items.length > 1) {
          setVids(items); setSeriesTitle(article.title || '合集')
          const rp = getCurPage()
          const idx = rp > 1 ? items.findIndex((v) => v.page === rp) : 0
          setCurIdx(idx >= 0 ? idx : 0)
          vsRef.current = items; ciRef.current = idx >= 0 ? idx : 0
          return loadVideo(items[idx >= 0 ? idx : 0].bvid, items[idx >= 0 ? idx : 0].page)
        }
        if (items.length === 1) return loadVideo(items[0].bvid, items[0].page)
      } catch {}
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
    } else { setVids([]); vsRef.current = []; ciRef.current = -1 }

    // 2. Check platform support
    if (typeof window !== 'undefined' && !('MediaSource' in window)) {
      setStatus('浏览器不支持，切换官方播放器...'); await fallback(bvid, page); return
    }
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (isiOS) { setStatus('iOS 使用官方播放器...'); await fallback(bvid, page); return }

    // 3. Initialize dash.js with server-generated MPD
    setStatus('加载 DASH 流...')
    const mpdUrl = `/api/mpd/${bvid}?p=${page}`

    const video = videoRef.current
    if (!video) return

    try {
      setUsingIframe(false)
      const old = video.parentElement?.querySelector('iframe'); if (old) old.remove()
      video.style.display = 'block'

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

      let started = false

      player.on('streamInitialized', () => setStatus(''))
      player.on('playbackPlaying', () => { setStatus(''); started = true })
      player.on('canPlay', () => setStatus(''))

      player.on('error', async () => {
        if (started) return
        errRef.current++
        if (errRef.current >= MAX_ERR) {
          setStatus('播放失败，切换备用方案...'); await fallback(bvid, page)
        }
      })

      player.on('playbackError', async () => {
        if (started) return
        errRef.current++
        if (errRef.current >= MAX_ERR) {
          setStatus('播放失败，切换备用方案...'); await fallback(bvid, page)
        }
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
      setStatus('播放器错误，切换备用方案...'); await fallback(bvid, page)
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
    const newMpdUrl = `/api/mpd/${bvid}?p=${page}&cdn=host:${it.host}`
    setStatus(`切换: ${it.label}`)

    destroy()
    const video = videoRef.current; if (!video) return
    const dashjs = await import('dashjs')
    const player = dashjs.MediaPlayer().create()
    playerRef.current = player
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: false, audio: false } }, buffer: { fastSwitchEnabled: true } },
    })
    player.initialize(video, newMpdUrl, false)
  }

  // ----- JSX -----

  const panel: React.CSSProperties = { position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }
  const btn: React.CSSProperties = { padding: '6px 12px', fontSize: 12, fontFamily: 'sans-serif', background: 'rgba(0,0,0,.7)', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, cursor: 'pointer', backdropFilter: 'blur(4px)' }
  const menu: React.CSSProperties = { position: 'absolute', top: '100%', right: 0, marginTop: 4, maxHeight: 320, overflowY: 'auto', minWidth: 180, background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)' }
  const item = (active: boolean): React.CSSProperties => ({ padding: '8px 14px', fontFamily: 'sans-serif', fontSize: 13, color: active ? '#4fc3f7' : '#fff', cursor: 'pointer', background: active ? 'rgba(79,195,247,.15)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,.08)' })

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, background: '#000', touchAction: 'manipulation', overflow: 'hidden' }}>
      <video ref={videoRef} controls playsInline
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', display: usingIframe ? 'none' : 'block', background: '#000' }}
      />
      {!usingIframe && (
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
      )}
      {status && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', color: '#999', fontFamily: 'sans-serif', fontSize: 14, background: 'rgba(0,0,0,.7)', padding: '8px 16px', borderRadius: 8, whiteSpace: 'nowrap' }}>
          {status}
        </div>
      )}
    </div>
  )
}