'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

interface Cdn { key: string; label: string; index: number }
interface Quality { qn: number; label: string; count: number }
interface Audio { id: number; label: string; codecs: string }
interface SeriesVid { title: string; bvid: string; page: number; cover_url: string; duration: number }

function fixUrl(u: string) {
  if (!u) return ''
  return u.replace(/^http:\/\//, 'https://')
}

export default function PlayPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('加载中...')
  const [cdns, setCdns] = useState<Cdn[]>([])
  const [qualities, setQualities] = useState<Quality[]>([])
  const [audios, setAudios] = useState<Audio[]>([])
  const [currentCdn, setCurrentCdn] = useState('0')
  const [currentQn, setCurrentQn] = useState<string>('all')
  const [currentAudio, setCurrentAudio] = useState<string>('all')
  const [menuOpen, setMenuOpen] = useState<'' | 'cdn' | 'qn' | 'audio'>('')
  const [usingIframe, setUsingIframe] = useState(false)
  const [seriesVids, setSeriesVids] = useState<SeriesVid[]>([])
  const [seriesTitle, setSeriesTitle] = useState('')
  const [seriesCurIdx, setSeriesCurIdx] = useState(-1)
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [autoplayNext, setAutoplayNext] = useState(true)
  const cdnsRef = useRef<Cdn[]>([])
  const errCountRef = useRef(0)
  const activeBvidRef = useRef('')
  const activePageRef = useRef(1)
  const seriesVidsRef = useRef<SeriesVid[]>([])
  const seriesCurIdxRef = useRef(-1)
  const MAX_ERR = 2

  useEffect(() => {
    seriesVidsRef.current = seriesVids
  }, [seriesVids])
  useEffect(() => {
    seriesCurIdxRef.current = seriesCurIdx
  }, [seriesCurIdx])

  useEffect(() => {
    document.title = 'Video Player'
    const style = document.createElement('style')
    style.textContent = 'body{background:#000!important;margin:0!important;overflow:hidden!important}'
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  useEffect(() => { load() }, [params.id, searchParams])

  function getCurrentPage(): number {
    const p = parseInt(searchParams.get('p') || '0', 10)
    return p > 0 ? p : 1
  }

  async function load() {
    const id = params.id as string
    setStatus('加载视频信息...')

    if (/^BV[a-zA-Z0-9]+$/.test(id)) {
      return loadByBvid(id, getCurrentPage())
    }

    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data

    if (article.content) {
      try {
        const content = typeof article.content === 'string' ? JSON.parse(article.content) : article.content
        let videoList: any[] = []
        if (Array.isArray(content)) {
          videoList = content
        } else if (content?.videos && Array.isArray(content.videos)) {
          videoList = content.videos
        }
        const vids: SeriesVid[] = videoList.map((v: any) => ({
          title: v.title || '', bvid: v.bvid || '',
          page: v.page || 1,
          cover_url: fixUrl(v.cover_url || v.first_frame || ''),
          duration: v.duration || 0,
        })).filter((v: SeriesVid) => v.bvid)
        if (vids.length > 1) {
          setSeriesVids(vids)
          setSeriesTitle(article.title || '合集')
          const reqPage = getCurrentPage()
          const idx = reqPage > 1 ? vids.findIndex((v) => v.page === reqPage) : 0
          setSeriesCurIdx(idx >= 0 ? idx : 0)
          const epBvid = vids[idx >= 0 ? idx : 0].bvid
          const epPage = vids[idx >= 0 ? idx : 0].page
          return loadByBvid(epBvid, epPage)
        }
        if (vids.length === 1) {
          return loadByBvid(vids[0].bvid, vids[0].page)
        }
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
    activeBvidRef.current = bvid
    activePageRef.current = page
    setStatus('获取视频信息...')

    const infoRes = await fetch(`/api/bvid/${bvid}`).catch(() => null)
    let info: { title?: string; cover_url?: string; pages?: any[] } = {}
    if (infoRes?.ok) {
      const ij = await infoRes.json().catch(() => ({}))
      if (ij.success) info = ij.data
    }
    if (info.title) document.title = info.title

    if (info.pages?.length && info.pages.length > 1) {
      const vids: SeriesVid[] = info.pages.map((p: any) => ({
        title: p.part || `第${p.page}集`, bvid,
        page: p.page || 1,
        cover_url: fixUrl(p.cover_url || ''),
        duration: p.duration || 0,
      }))
      setSeriesVids(vids)
      setSeriesTitle(info.title || bvid)
      const idx = vids.findIndex((v) => v.page === page)
      setSeriesCurIdx(idx >= 0 ? idx : 0)
      seriesVidsRef.current = vids
      seriesCurIdxRef.current = idx >= 0 ? idx : 0
    } else {
      setSeriesVids([])
      seriesVidsRef.current = []
      seriesCurIdxRef.current = -1
    }

    setStatus('获取 DASH 流...')
    const qn = localStorage.getItem(`qn-${bvid}`) || 'all'
    const audio = localStorage.getItem(`audio-${bvid}`) || 'all'
    const pageQuery = page > 1 ? `&p=${page}` : ''
    const mpdUrl = `/api/mpd/${bvid}?qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${pageQuery}`
    const bilibiliFallbackUrl = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`

    let mpdRes = await fetch(mpdUrl).catch(() => null)

    // 第一次失败 → 触发后台刷新直链 → 重试一次
    if (!mpdRes || !mpdRes.ok) {
      const errBody = mpdRes ? await mpdRes.text().catch(() => '') : '网络错误'
      console.error('MPD fetch failed (1st):', mpdRes?.status, errBody)
      setStatus('直链可能过期，正在刷新...')
      try {
        await fetch('/api/refresh-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bvid, page }),
        })
      } catch {}
      await new Promise(r => setTimeout(r, 800))
      // 重试一次
      mpdRes = await fetch(`${mpdUrl}&_=${Date.now()}`).catch(() => null)
      if (!mpdRes || !mpdRes.ok) {
        const err2 = mpdRes ? await mpdRes.text().catch(() => '') : '网络错误'
        console.error('MPD fetch failed (2nd):', mpdRes?.status, err2)
        setStatus('刷新后仍失败，切换备用方案...')
        await new Promise(r => setTimeout(r, 1000))
        await fallbackToIframe(bilibiliFallbackUrl)
        return
      }
    }

    fetch(`/api/mpd/${bvid}/sources${pageQuery ? '?' + pageQuery.slice(1) : ''}`).then(r => r.json()).then(j => {
      if (!j.success) return
      if (j.cdns?.length) { setCdns(j.cdns); cdnsRef.current = j.cdns }
      if (j.qualities?.length) {
        setQualities(j.qualities)
        const maxQn = j.qualities.reduce((a: Quality, b: Quality) => a.qn > b.qn ? a : b)
        setCurrentQn(String(maxQn.qn))
      }
      if (j.audios?.length) setAudios(j.audios)
    }).catch(() => {})

    const video = videoRef.current
    if (!video) return

    setStatus('加载播放器...')
    try {
      if (playerRef.current) {
        try { playerRef.current.reset() } catch {}
        playerRef.current = null
      }
      setUsingIframe(false)
      const oldIframe = video.parentElement?.querySelector('iframe')
      if (oldIframe) oldIframe.remove()
      video.style.display = 'block'

      const dashjs = await import('dashjs')
      const player = dashjs.MediaPlayer().create()
      playerRef.current = player
      player.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: false, audio: false } },
          cmcd: { enabled: false },
        },
      })
      // 必须先注册事件再 initialize
      const startAutoPlay = (): void => {
        let attempts = 0
        const maxAttempts = 60
        const tryPlay = (): void => {
          const v = videoRef.current
          if (!v) return
          if (!v.paused) { return }
          v.play().catch(() => {})
          attempts++
          if (attempts < maxAttempts) setTimeout(tryPlay, 500)
        }
        tryPlay()
      }
      player.on('streamInitialized', () => { startAutoPlay() })
      player.on('canPlay', () => { setStatus('') })
      player.on('playbackPlaying', () => { setStatus('') })
      player.initialize(video, mpdUrl, true)
      player.on('error', async (e: any) => {
        console.error('dashjs error:', e)
        errCountRef.current++
        if (errCountRef.current > MAX_ERR) {
          setStatus('多次播放失败，切换备用方案...')
          await fallbackToIframe(bilibiliFallbackUrl)
          return
        }
        const allCdns = cdnsRef.current
        if (allCdns.length > 1) {
          const savedCdn = localStorage.getItem(`cdn-${bvid}`) || '0'
          for (const cdn of allCdns) {
            if (cdn.key === savedCdn) continue
            setStatus(`尝试 CDN: ${cdn.label}`)
            try {
              const retryMpd = `/api/mpd/${bvid}?cdn=${encodeURIComponent(cdn.key)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${pageQuery}&_=${Date.now()}`
              player.reset()
              const rv = videoRef.current
              if (rv) player.attachView(rv)
              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('timeout')), 4000)
                const onOk = () => { clearTimeout(timeout); resolve() }
                player.on('streamInitialized', onOk, { once: true })
                player.on('canPlay', onOk, { once: true })
                player.on('error', () => { clearTimeout(timeout); reject(new Error('cdn fail')) }, { once: true })
                player.attachSource(retryMpd)
              })
              localStorage.setItem(`cdn-${bvid}`, cdn.key)
              setCurrentCdn(cdn.key)
              errCountRef.current = 0
              setStatus('')
              return
            } catch { continue }
          }
        }
        await fallbackToIframe(bilibiliFallbackUrl)
      })
      player.on('playbackEnded', () => {
        const vids = seriesVidsRef.current
        const idx = seriesCurIdxRef.current
        if (!autoplayNext) return
        if (vids.length > 1 && idx >= 0 && idx < vids.length - 1) {
          const next = vids[idx + 1]
          loadByBvid(next.bvid, next.page)
        }
      })
      return
    } catch (e: any) {
      console.error('dashjs init error:', e)
      setStatus('播放器初始化失败，切换备用方案...')
    }
    await fallbackToIframe(bilibiliFallbackUrl)
  }

  function switchEpisode(idx: number) {
    const vids = seriesVidsRef.current
    if (idx < 0 || idx >= vids.length) return
    setSeriesOpen(false)
    loadByBvid(vids[idx].bvid, vids[idx].page)
  }

  function switchCdn(cdn: Cdn) {
    const id = activeBvidRef.current
    setMenuOpen('')
    if (cdn.key === currentCdn) return
    localStorage.setItem(`cdn-${id}`, cdn.key)
    setCurrentCdn(cdn.key)
    setStatus(`切换 CDN: ${cdn.label}`)
    reloadMpd()
  }

  function switchQn(q: Quality) {
    const id = activeBvidRef.current
    setMenuOpen('')
    if (String(q.qn) === currentQn) return
    localStorage.setItem(`qn-${id}`, String(q.qn))
    setCurrentQn(String(q.qn))
    setStatus(`切换清晰度: ${q.label}`)
    reloadMpd()
  }

  function switchAudio(a: Audio) {
    const id = activeBvidRef.current
    setMenuOpen('')
    if (String(a.id) === currentAudio) return
    localStorage.setItem(`audio-${id}`, String(a.id))
    setCurrentAudio(String(a.id))
    setStatus(`切换音轨: ${a.label}`)
    reloadMpd()
  }

  function reloadMpd() {
    const bvid = activeBvidRef.current
    const page = activePageRef.current
    if (playerRef.current) {
      const cdn = localStorage.getItem(`cdn-${bvid}`) || '0'
      const qn = localStorage.getItem(`qn-${bvid}`) || 'all'
      const audio = localStorage.getItem(`audio-${bvid}`) || 'all'
      const pageQuery = page > 1 ? `&p=${page}` : ''
      const newMpd = `/api/mpd/${bvid}?cdn=${encodeURIComponent(cdn)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${pageQuery}&_=${Date.now()}`
      playerRef.current.attachSource(newMpd)
      setStatus('')
    }
  }

  async function fallbackToIframe(bilibiliUrl: string) {
    const bvid = bilibiliUrl?.match(/BV[a-zA-Z0-9]+/)?.[0]
    if (!bvid) { setError('无法播放此视频'); return }
    setUsingIframe(true)
    setStatus('')
    const video = videoRef.current
    if (!video) return
    const container = video.parentElement
    if (!container) return
    video.style.display = 'none'
    const iframe = document.createElement('iframe')
    iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0`
    iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'
    iframe.setAttribute('referrerPolicy', 'no-referrer')
    iframe.setAttribute('allowFullScreen', '')
    container.appendChild(iframe)
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute', top: 12, right: 12, zIndex: 10,
    display: 'flex', gap: 6, alignItems: 'flex-start',
  }
  const btnStyle: React.CSSProperties = {
    padding: '6px 12px', fontSize: 12, fontFamily: 'sans-serif',
    background: 'rgba(0,0,0,.7)', color: '#fff', border: '1px solid rgba(255,255,255,.3)',
    borderRadius: 6, cursor: 'pointer',
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

  function MenuHost({ label, current, items, onSelect, menuKey }: {
    label: string; current: string
    items: { key: string; label: string; sub?: string }[]
    onSelect: (item: any) => void
    menuKey: 'cdn' | 'qn' | 'audio'
  }) {
    if (!items.length) return null
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setMenuOpen(o => o === menuKey ? '' : menuKey)} style={btnStyle}>{label} ▾</button>
        {menuOpen === menuKey && (
          <div style={menuStyle}>
            {items.map(it => (
              <div key={it.key} onClick={() => onSelect(it)} style={itemStyle(it.key === current)}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = it.key === current ? 'rgba(79,195,247,.15)' : 'transparent')}
              >{it.label}{it.sub && <span style={{ opacity: .6, marginLeft: 6 }}>{it.sub}</span>}</div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <video ref={videoRef} controls autoPlay playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: usingIframe ? 'none' : 'block' }}
      />
      {!usingIframe && (
        <div style={panelStyle}>
          {seriesVids.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setSeriesOpen(o => !o)}
                style={{ ...btnStyle, background: seriesOpen ? 'rgba(251,114,153,.3)' : 'rgba(0,0,0,.7)' }}
              >剧集 ({seriesVids.length})</button>
              {seriesOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  maxHeight: 360, overflowY: 'auto', minWidth: 280,
                  background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)',
                  borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)',
                }}>
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
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = i === seriesCurIdx ? 'rgba(79,195,247,.12)' : 'transparent')}
                    >
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
            <button
              onClick={() => setAutoplayNext(v => !v)}
              style={{ ...btnStyle, background: autoplayNext ? 'rgba(76,175,80,.3)' : 'rgba(0,0,0,.7)', color: autoplayNext ? '#81c784' : '#fff' }}
            >{autoplayNext ? '连播' : '不连播'}</button>
          )}
          <MenuHost label="CDN" current={currentCdn} menuKey="cdn" items={cdns.map(c => ({ key: c.key, label: c.label }))} onSelect={switchCdn} />
          <MenuHost label="画质" current={currentQn} menuKey="qn" items={qualities.map(q => ({ key: String(q.qn), label: q.label, sub: `${q.count}编码` }))} onSelect={switchQn} />
          <MenuHost label="音轨" current={currentAudio} menuKey="audio" items={audios.map(a => ({ key: String(a.id), label: a.label }))} onSelect={switchAudio} />
        </div>
      )}
      {(status || error) && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          color: '#999', fontFamily: 'sans-serif', fontSize: 14, background: 'rgba(0,0,0,.7)',
          padding: '8px 16px', borderRadius: 8,
        }}>{error || status}</div>
      )}
    </div>
  )
}
