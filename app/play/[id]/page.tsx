'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Cdn { key: string; label: string; index: number }

export default function PlayPage() {
  const params = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<any>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('加载中...')
  const [cdns, setCdns] = useState<Cdn[]>([])
  const [currentCdn, setCurrentCdn] = useState('0')
  const [cdnOpen, setCdnOpen] = useState(false)
  const [usingIframe, setUsingIframe] = useState(false)

  useEffect(() => {
    document.title = 'Video Player'
    const style = document.createElement('style')
    style.textContent = 'body{background:#000!important;margin:0!important;overflow:hidden!important}'
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  useEffect(() => { load() }, [params.id])

  async function load() {
    const id = params.id as string
    setStatus('加载视频信息...')

    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data

    fetch(`/api/stream/${id}/sources`).then(r => r.json()).then(j => {
      if (j.success && j.cdns?.length) {
        setCdns(j.cdns)
        const saved = localStorage.getItem(`cdn-${id}`)
        if (saved && j.cdns.find((c: Cdn) => c.key === saved)) setCurrentCdn(saved)
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
      const mpdUrl = `/api/stream/${id}?cdn=${encodeURIComponent(localStorage.getItem(`cdn-${id}`) || '0')}`
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
        player.initialize(video, mpdUrl, true)
        player.on('error', (e: any) => {
          console.error('dashjs error:', e)
          setStatus('DASH 播放失败，切换备用方案...')
          fallbackToIframe(article.bilibili_url, video)
        })
        return
      } catch (e: any) {
        console.error('dashjs init error:', e)
        setStatus('播放器初始化失败，切换备用方案...')
      }
    }

    await fallbackToIframe(article.bilibili_url, video)
  }

  function switchCdn(cdn: Cdn) {
    const id = params.id as string
    setCdnOpen(false)
    if (cdn.key === currentCdn) return
    localStorage.setItem(`cdn-${id}`, cdn.key)
    setCurrentCdn(cdn.key)
    setStatus(`切换 CDN: ${cdn.label}`)
    if (playerRef.current) {
      const newMpd = `/api/stream/${id}?cdn=${encodeURIComponent(cdn.key)}&_=${Date.now()}`
      playerRef.current.attachSource(newMpd)
      setStatus('')
    } else {
      window.location.reload()
    }
  }

  async function fallbackToIframe(bilibiliUrl: string, video: HTMLVideoElement) {
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

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#000' }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: usingIframe ? 'none' : 'block' }}
      />
      {!usingIframe && cdns.length > 0 && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
          <button
            onClick={() => setCdnOpen(o => !o)}
            style={{
              padding: '6px 12px', fontSize: 12, fontFamily: 'sans-serif',
              background: 'rgba(0,0,0,.7)', color: '#fff', border: '1px solid rgba(255,255,255,.3)',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            CDN ▾
          </button>
          {cdnOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              maxHeight: 320, overflowY: 'auto', minWidth: 180,
              background: 'rgba(20,20,20,.95)', border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.5)',
            }}>
              {cdns.map(c => (
                <div
                  key={c.key}
                  onClick={() => switchCdn(c)}
                  style={{
                    padding: '8px 14px', fontFamily: 'sans-serif', fontSize: 13,
                    color: c.key === currentCdn ? '#4fc3f7' : '#fff', cursor: 'pointer',
                    background: c.key === currentCdn ? 'rgba(79,195,247,.15)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,.08)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = c.key === currentCdn ? 'rgba(79,195,247,.15)' : 'transparent')}
                >
                  {c.label}
                </div>
              ))}
            </div>
          )}
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
