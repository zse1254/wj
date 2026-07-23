'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Cdn { key: string; label: string; index: number }
interface Quality { qn: number; label: string; count: number }
interface Audio { id: number; label: string; codecs: string }
interface SeriesVid { title: string; bvid: string; page?: number; cover_url?: string; duration?: number }

export default function PlayPage() {
  const params = useParams()
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
  const activeBvidRef = useRef('')  // 当前实际播放的 bvid (合集模式下与 params.id 不同)
  const MAX_ERR = 2

  useEffect(() => {
    document.title = 'Video Player'
    const style = document.createElement('style')
    style.textContent = 'body{background:#000!important;margin:0!important;overflow:hidden!important}'
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  useEffect(() => { load() }, [params.id])

  function getCurrentPage(): number {
    if (typeof window === 'undefined') return 0
    const u = new URL(window.location.href)
    const p = parseInt(u.searchParams.get('p') || '0', 10)
    return p > 0 ? p : 0
  }

  async function load() {
    const id = params.id as string
    setStatus('加载视频信息...')

    // bvid 模式: 直接从 Deno 代理拉 playurl 生成临时 MPD, 不依赖 D1
    if (/^BV[a-zA-Z0-9]+$/.test(id)) {
      return loadByBvid(id, getCurrentPage())
    }

    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data

    // 解析合集/系列数据
    if (article.content) {
      try {
        const content = typeof article.content === 'string' ? JSON.parse(article.content) : article.content
        if (Array.isArray(content) && content.length > 0) {
          const vids: SeriesVid[] = content.map((v: { title?: string; bvid?: string; page?: number; cover_url?: string; first_frame?: string; duration?: number }) => ({
            title: v.title || '', bvid: v.bvid || '',
            page: v.page || 0,
            cover_url: v.cover_url || v.first_frame || '',
            duration: v.duration || 0,
          })).filter((v: SeriesVid) => v.bvid)
          if (vids.length > 1) {
            setSeriesVids(vids)
            setSeriesTitle(article.title || '合集')
            const reqPage = getCurrentPage()
            const idx = reqPage ? vids.findIndex((v: SeriesVid) => v.page === reqPage) : -1
            setSeriesCurIdx(idx >= 0 ? idx : 0)
          }
        }
      } catch {}
    }

    fetch(`/api/stream/${id}/sources`).then(r => r.json()).then(j => {
      if (!j.success) return
      if (j.cdns?.length) {
        setCdns(j.cdns)
        cdnsRef.current = j.cdns
        const saved = localStorage.getItem(`cdn-${id}`)
        if (saved && j.cdns.find((c: Cdn) => c.key === saved)) setCurrentCdn(saved)
      }
      if (j.qualities?.length) {
        setQualities(j.qualities)
        const maxQn = j.qualities.reduce((a: Quality, b: Quality) => a.qn > b.qn ? a : b)
        const savedQn = localStorage.getItem(`qn-${id}`)
        if (savedQn && j.qualities.find((q: Quality) => String(q.qn) === savedQn)) {
          setCurrentQn(savedQn)
        } else {
          setCurrentQn(String(maxQn.qn))
        }
      }
      if (j.audios?.length) {
        setAudios(j.audios)
        const savedA = localStorage.getItem(`audio-${id}`)
        if (savedA && j.audios.find((a: Audio) => String(a.id) === savedA)) {
          setCurrentAudio(savedA)
        }
      }
    }).catch(() => {})

    const video = videoRef.current
    if (!video) return

    if (article.video_url) {
      video.src = article.video_url
      await video.play().catch(() => setError('无法播放直链视频'))
      return
    }

    if (article.bilibili_url) {
      setStatus('获取 DASH 流...')
      const id2 = params.id as string
      const cdn = localStorage.getItem(`cdn-${id2}`) || '0'
      const qn = localStorage.getItem(`qn-${id2}`) || 'all'
      const audio = localStorage.getItem(`audio-${id2}`) || 'all'
      const p = (() => { try { return new URL(window.location.href).searchParams.get('p') || '' } catch { return '' } })()
      const mpdUrl = `/api/stream/${id}?cdn=${encodeURIComponent(cdn)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${p ? '&p=' + encodeURIComponent(p) : ''}`
      const mpdRes = await fetch(mpdUrl).catch(() => null)
      if (!mpdRes || !mpdRes.ok) {
        const errBody = mpdRes ? await mpdRes.text().catch(() => '') : '网络错误'
        console.error('MPD fetch failed:', mpdRes?.status, errBody)
        setStatus(`MPD ${mpdRes?.status}: ${errBody.slice(0, 200)}`)
        await new Promise(r => setTimeout(r, 1500))
        await fallbackToIframe(article.bilibili_url, video)
        return
      }
      setStatus('加载播放器...')
      try {
        const dashjs = await import('dashjs')
        const player = dashjs.MediaPlayer().create()
        playerRef.current = player
        player.updateSettings({
          streaming: {
            abr: { autoSwitchBitrate: { video: false, audio: false } },
            cmcd: { enabled: false },
          },
        })
        player.initialize(video, mpdUrl, true)
        player.on('canPlay', () => { setStatus('') })
        player.on('playbackPlaying', () => { setStatus('') })
        player.on('error', async (e: any) => {
          console.error('dashjs error:', e)
          errCountRef.current++
          if (errCountRef.current > MAX_ERR) {
            setStatus('多次播放失败，切换备用方案...')
            fallbackToIframe(article.bilibili_url, video)
            return
          }
          // 自动试其他 CDN
          const allCdns = cdnsRef.current
          if (allCdns.length > 1) {
            const id = params.id as string
            const savedCdn = localStorage.getItem(`cdn-${id}`) || '0'
            const savedQn = localStorage.getItem(`qn-${id}`) || 'all'
            const savedAudio = localStorage.getItem(`audio-${id}`) || 'all'
            for (const cdn of allCdns) {
              if (cdn.key === savedCdn) continue
              setStatus(`尝试 CDN: ${cdn.label}`)
              try {
                const retryMpd = `/api/stream/${id}?cdn=${encodeURIComponent(cdn.key)}&qn=${encodeURIComponent(savedQn)}&audio=${encodeURIComponent(savedAudio)}&_=${Date.now()}`
                player.reset()
                const rv = videoRef.current
                if (rv) {
                  player.attachView(rv)
                }
                await new Promise<void>((resolve, reject) => {
                  const timeout = setTimeout(() => reject(new Error('timeout')), 4000)
                  const onOk = () => { clearTimeout(timeout); resolve() }
                  player.on('streamInitialized', onOk, { once: true })
                  player.on('canPlay', onOk, { once: true })
                  player.on('error', () => { clearTimeout(timeout); reject(new Error('cdn fail')) }, { once: true })
                  player.attachSource(retryMpd)
                })
                localStorage.setItem(`cdn-${id}`, cdn.key)
                setCurrentCdn(cdn.key)
                errCountRef.current = 0
                setStatus('')
                return
              } catch { continue }
            }
          }
          setStatus('DASH 播放失败，切换备用方案...')
          fallbackToIframe(article.bilibili_url, video)
        })
        player.on('playbackEnded', () => {
          if (!autoplayNext) return
          if (seriesVids.length > 1 && seriesCurIdx >= 0 && seriesCurIdx < seriesVids.length - 1) {
            const next = seriesVids[seriesCurIdx + 1]
            const isBvidUrl = /^BV[a-zA-Z0-9]+$/.test(params.id as string)
            const base = isBvidUrl ? window.location.pathname.replace(/\?.*$/, '') : `/play/${params.id}`
            if (next?.page) window.location.href = `${base}?p=${next.page}`
          }
        })
        return
      } catch (e: any) {
        console.error('dashjs init error:', e)
        setStatus('播放器初始化失败，切换备用方案...')
      }
    }

    await fallbackToIframe(article.bilibili_url, video)
  }

  async function loadByBvid(bvid: string, page?: number) {
    activeBvidRef.current = bvid
    setStatus('获取视频信息...')
    const infoRes = await fetch(`/api/bvid/${bvid}`).catch(() => null)
    let info: { title?: string; cover_url?: string; pages?: any[] } = {}
    if (infoRes?.ok) {
      const ij = await infoRes.json().catch(() => ({}))
      if (ij.success) info = ij.data
    }
    if (info.title) document.title = info.title

    // 构造 seriesVids (多 P 视频)
    if (info.pages?.length) {
      const vids: SeriesVid[] = info.pages.map((p: { part?: string; page?: number; cover_url?: string; duration?: number }) => ({
        title: p.part || `第${p.page}集`, bvid,
        page: p.page || 1,
        cover_url: p.cover_url || '',
        duration: p.duration || 0,
      }))
      if (vids.length > 1) {
        setSeriesVids(vids)
        setSeriesTitle(info.title || bvid)
        const idx = page ? vids.findIndex((v) => v.page === page) : -1
        setSeriesCurIdx(idx >= 0 ? idx : 0)
      }
    }

    setStatus('获取 DASH 流...')
    const qn = localStorage.getItem(`qn-${bvid}`) || 'all'
    const audio = localStorage.getItem(`audio-${bvid}`) || 'all'
    const pageQuery = page && page > 1 ? `&p=${page}` : ''
    const mpdUrl = `/api/mpd/${bvid}?qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${pageQuery}`

    const mpdRes = await fetch(mpdUrl).catch(() => null)
    if (!mpdRes || !mpdRes.ok) {
      const errBody = mpdRes ? await mpdRes.text().catch(() => '') : '网络错误'
      console.error('MPD fetch failed:', mpdRes?.status, errBody)
      setStatus(`MPD ${mpdRes?.status}: ${errBody.slice(0, 200)}`)
      await new Promise(r => setTimeout(r, 1500))
      await fallbackToIframe(`https://www.bilibili.com/video/${bvid}${page && page > 1 ? `?p=${page}` : ''}`, videoRef.current!)
      return
    }

    // 提取 sources 信息
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
      const dashjs = await import('dashjs')
      const player = dashjs.MediaPlayer().create()
      playerRef.current = player
      player.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: false, audio: false } },
          cmcd: { enabled: false },
        },
      })
      player.initialize(video, mpdUrl, true)
      player.on('canPlay', () => { setStatus('') })
      player.on('playbackPlaying', () => { setStatus('') })
      player.on('error', async (e: any) => {
        console.error('dashjs error:', e)
        errCountRef.current++
        if (errCountRef.current > MAX_ERR) {
          setStatus('多次播放失败，切换备用方案...')
          fallbackToIframe(`https://www.bilibili.com/video/${bvid}${page && page > 1 ? `?p=${page}` : ''}`, video)
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
        setStatus('DASH 播放失败，切换备用方案...')
        fallbackToIframe(`https://www.bilibili.com/video/${bvid}`, video)
      })
      player.on('playbackEnded', () => {
        if (!autoplayNext) return
        if (seriesVids.length > 1 && seriesCurIdx >= 0 && seriesCurIdx < seriesVids.length - 1) {
          const next = seriesVids[seriesCurIdx + 1]
          const isBvidUrl = /^BV[a-zA-Z0-9]+$/.test(params.id as string)
          const base = isBvidUrl ? window.location.pathname.replace(/\?.*$/, '') : `/play/${params.id}`
          if (next?.page) window.location.href = `${base}?p=${next.page}`
        }
      })
      return
    } catch (e: any) {
      console.error('dashjs init error:', e)
      setStatus('播放器初始化失败，切换备用方案...')
    }
    await fallbackToIframe(`https://www.bilibili.com/video/${bvid}${page && page > 1 ? `?p=${page}` : ''}`, video)
  }

  function switchCdn(cdn: Cdn) {
    const id = activeBvidRef.current || (params.id as string)
    setMenuOpen('')
    if (cdn.key === currentCdn) return
    localStorage.setItem(`cdn-${id}`, cdn.key)
    setCurrentCdn(cdn.key)
    setStatus(`切换 CDN: ${cdn.label}`)
    reloadMpd()
  }

  function switchQn(q: Quality) {
    const id = activeBvidRef.current || (params.id as string)
    setMenuOpen('')
    if (String(q.qn) === currentQn) return
    localStorage.setItem(`qn-${id}`, String(q.qn))
    setCurrentQn(String(q.qn))
    setStatus(`切换清晰度: ${q.label}`)
    reloadMpd()
  }

  function switchAudio(a: Audio) {
    const id = activeBvidRef.current || (params.id as string)
    setMenuOpen('')
    if (String(a.id) === currentAudio) return
    localStorage.setItem(`audio-${id}`, String(a.id))
    setCurrentAudio(String(a.id))
    setStatus(`切换音轨: ${a.label}`)
    reloadMpd()
  }

  function reloadMpd() {
    const id = params.id as string
    const activeBvid = activeBvidRef.current
    // 优先使用实际播放的 bvid (合集模式), 否则回落到 params.id
    const playbackId = activeBvid || id
    const isBvid = /^BV[a-zA-Z0-9]+$/.test(playbackId)
    if (playerRef.current) {
      const cdn = localStorage.getItem(`cdn-${playbackId}`) || '0'
      const qn = localStorage.getItem(`qn-${playbackId}`) || 'all'
      const audio = localStorage.getItem(`audio-${playbackId}`) || 'all'
      const base = isBvid ? `/api/mpd/${playbackId}` : `/api/stream/${playbackId}`
      const pageQuery = (() => {
        const u = new URL(window.location.href)
        const p = u.searchParams.get('p')
        return p ? `&p=${p}` : ''
      })()
      const newMpd = `${base}?cdn=${encodeURIComponent(cdn)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}${pageQuery}&_=${Date.now()}`
      playerRef.current.attachSource(newMpd)
      setStatus('')
    } else {
      window.location.reload()
    }
  }

async function fallbackToIframe(bilibiliUrl: string, video: HTMLVideoElement) {
    // 换 CDN 失败后才走这

    const bvid = bilibiliUrl?.match(/BV[a-zA-Z0-9]+/)?.[0]
    if (!bvid) { setError('无法播放此视频'); return }

    setUsingIframe(true)
    setStatus('')
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

  // 控件容器样式
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
    label: string
    current: string
    items: { key: string; label: string; sub?: string }[]
    onSelect: (item: any) => void
    menuKey: 'cdn' | 'qn' | 'audio'
  }) {
    if (!items.length) return null
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(o => o === menuKey ? '' : menuKey)}
          style={btnStyle}
        >{label} ▾</button>
        {menuOpen === menuKey && (
          <div style={menuStyle}>
            {items.map(it => (
              <div
                key={it.key}
                onClick={() => onSelect(it)}
                style={itemStyle(it.key === current)}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
                onMouseLeave={e => (e.currentTarget.style.background = it.key === current ? 'rgba(79,195,247,.15)' : 'transparent')}
              >
                {it.label}{it.sub && <span style={{ opacity: .6, marginLeft: 6 }}>{it.sub}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: usingIframe ? 'none' : 'block' }}
      />
      {!usingIframe && (
        <div style={panelStyle}>
          {seriesVids.length > 1 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSeriesOpen(o => !o)}
                style={{ ...btnStyle, background: seriesOpen ? 'rgba(251,114,153,.3)' : 'rgba(0,0,0,.7)' }}
              >剧集</button>
              {seriesOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4,
                  maxHeight: 360, overflowY: 'auto', minWidth: 240,
                  background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)',
                  borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)',
                }}>
                  <div style={{ padding: '8px 12px', fontSize: 12, color: '#888', borderBottom: '1px solid rgba(255,255,255,.1)', fontFamily: 'sans-serif' }}>
                    {seriesTitle} ({seriesVids.length}集)
                  </div>
                  {seriesVids.map((v, i) => {
                    const basePath = /^BV[a-zA-Z0-9]+$/.test(params.id as string) ? window.location.pathname.replace(/\?.*$/, '') : `/play/${params.id}`
                    const epUrl = v.page ? `${basePath}?p=${v.page}` : ''
                    return (
                      <a
                        key={i}
                        href={epUrl || '#'}
                        onClick={e => { if (!v.page) return; e.preventDefault(); window.location.href = epUrl }}
                        style={{
                          display: 'flex', padding: '6px 8px', fontFamily: 'sans-serif', fontSize: 13,
                          color: i === seriesCurIdx ? '#4fc3f7' : '#ccc', textDecoration: 'none',
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
                          <div style={{
                            overflow: 'hidden', display: '-webkit-box',
                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                            lineHeight: 1.3,
                          }}>
                            {i + 1}. {v.title || `第${i + 1}集`}
                          </div>
                          {v.duration ? (
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                              {Math.floor(v.duration / 60)}:{String(v.duration % 60).padStart(2, '0')}
                            </div>
                          ) : null}
                        </div>
                      </a>
                    )
                  })}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                    fontSize: 12, color: '#ccc', fontFamily: 'sans-serif',
                    borderTop: '1px solid rgba(255,255,255,.1)', cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={autoplayNext}
                      onChange={e => setAutoplayNext(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    自动连播
                  </label>
                </div>
              )}
            </div>
          )}
          <MenuHost
            label="CDN"
            current={currentCdn}
            menuKey="cdn"
            items={cdns.map(c => ({ key: c.key, label: c.label }))}
            onSelect={switchCdn}
          />
          <MenuHost
            label="画质"
            current={currentQn}
            menuKey="qn"
            items={qualities.map(q => ({ key: String(q.qn), label: q.label, sub: `${q.count}编码` }))}
            onSelect={switchQn}
          />
          <MenuHost
            label="音轨"
            current={currentAudio}
            menuKey="audio"
            items={audios.map(a => ({ key: String(a.id), label: a.label }))}
            onSelect={switchAudio}
          />
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
