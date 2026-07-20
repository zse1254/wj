'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface CdnSource {
  name: string
  label: string
  index: number
}

export default function PlayPage() {
  const params = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [cdns, setCdns] = useState<CdnSource[]>([])
  const [currentCdn, setCurrentCdn] = useState(0)
  const [qualities, setQualities] = useState<{ id: number; label: string }[]>([])
  const [currentQuality, setCurrentQuality] = useState(-1)

  useEffect(() => {
    document.title = 'Video Player'
    const style = document.createElement('style')
    style.textContent = 'body{background:#000!important;margin:0!important;overflow:hidden!important}'
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  useEffect(() => {
    if (loaded) return
    setLoaded(true)
    loadCdns()
    load()
    return () => {
      if (playerRef.current) {
        try { playerRef.current.reset() } catch {}
        playerRef.current = null
      }
    }
  }, [params.id, loaded])

  async function loadCdns() {
    try {
      const res = await fetch(`/api/stream/${params.id}/sources`)
      const json = await res.json()
      if (json.success && json.cdns?.length > 0) {
        setCdns(json.cdns)
      }
    } catch {}
  }

  function getMpdUrl(cdnIndex?: number) {
    const cdn = cdnIndex ?? currentCdn
    let url = `/api/stream/${params.id}`
    if (cdn > 0) url += `?cdn=${cdn}`
    return url
  }

  function initPlayer(quality?: number) {
    const video = videoRef.current
    if (!video) return

    if (playerRef.current) {
      try { playerRef.current.reset() } catch {}
      playerRef.current = null
    }

    const q = quality ?? currentQuality
    let url = getMpdUrl()
    if (q > 0) url += (url.includes('?') ? '&' : '?') + `quality=${q}`

    try {
      import('dashjs').then((dashjs) => {
        const player = dashjs.MediaPlayer().create()
        playerRef.current = player
        if (q > 0) {
          player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false, audio: false } } } })
        }
        player.initialize(video, url, true)
        player.on('error', () => {})
        player.on('qualityChange', (e: any) => {
          if (e.mediaType === 'video') setCurrentQuality(e.newQuality)
        })
        player.on('streamInitialized', () => {
          const tracks = player.getTracksFor('video')
          if (tracks?.length) {
            setQualities(tracks.map((t: any, i: number) => ({
              id: i,
              label: `${t.height || t.bandwidth}p`,
            })))
          }
        })
      })
    } catch {}
  }

  function switchCdn(cdnIndex: number) {
    setCurrentCdn(cdnIndex)
    setTimeout(() => initPlayer(currentQuality), 50)
  }

  function switchQuality(qualityIndex: number) {
    setCurrentQuality(qualityIndex)
    if (playerRef.current) {
      playerRef.current.setQualityFor('video', qualityIndex, false)
    }
  }

  async function load() {
    const id = params.id as string
    const video = videoRef.current
    if (!video) return

    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data

    if (article.video_url) {
      video.src = article.video_url
      video.play().catch(() => {})
      return
    }

    if (article.bilibili_url) {
      initPlayer()
      return
    }

    const bvid = article.bilibili_url?.match(/BV[a-zA-Z0-9]+/)?.[0]
    if (bvid) {
      const container = video.parentElement
      if (container) {
        video.style.display = 'none'
        const iframe = document.createElement('iframe')
        iframe.src = `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0`
        iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none'
        iframe.setAttribute('referrerPolicy', 'no-referrer')
        iframe.setAttribute('allowFullScreen', '')
        container.appendChild(iframe)
      }
      return
    }

    setError('无法播放此视频')
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
      {cdns.length > 1 && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end',
        }}>
          {cdns.map((cdn) => (
            <button key={cdn.index} onClick={() => switchCdn(cdn.index)}
              style={{
                padding: '3px 8px', fontSize: 11, fontFamily: 'sans-serif',
                background: cdn.index === currentCdn ? 'rgba(0,140,255,.85)' : 'rgba(0,0,0,.6)',
                color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>
              {cdn.label}
            </button>
          ))}
        </div>
      )}
      {qualities.length > 1 && (
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 10,
          display: 'flex', gap: 4,
        }}>
          {qualities.map((q) => (
            <button key={q.id} onClick={() => switchQuality(q.id)}
              style={{
                padding: '3px 8px', fontSize: 11, fontFamily: 'sans-serif',
                background: q.id === currentQuality ? 'rgba(0,140,255,.85)' : 'rgba(0,0,0,.6)',
                color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
              }}>
              {q.label}
            </button>
          ))}
        </div>
      )}
      {error && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          color: '#999', fontFamily: 'sans-serif', fontSize: 14, background: 'rgba(0,0,0,.7)',
          padding: '8px 16px', borderRadius: 8,
        }}>{error}</div>
      )}
    </div>
  )
}
