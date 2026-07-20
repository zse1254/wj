'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

export default function PlayPage() {
  const params = useParams()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('加载中...')
  const [cdns, setCdns] = useState<{ label: string; index: number }[]>([])
  const [currentCdn, setCurrentCdn] = useState(0)
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

    // 获取文章信息
    const res = await fetch(`/api/articles/${id}`)
    const json = await res.json()
    if (!json.success || !json.data) { setError('视频不存在'); return }
    const article = json.data

    // 获取 CDN 信息
    fetch(`/api/stream/${id}/sources`).then(r => r.json()).then(j => {
      if (j.success && j.cdns?.length > 1) setCdns(j.cdns)
    }).catch(() => {})

    const video = videoRef.current
    if (!video) return

    // 方案1: 直链视频 (MP4 / HLS)
    if (article.video_url) {
      video.src = article.video_url
      await video.play().catch(() => setError('无法播放直链视频'))
      return
    }

    // 方案2: DASH (需要 dash.js)
    if (article.bilibili_url) {
      setStatus('获取 DASH 流...')
      // 先尝试抓取 MPD，看是否正常
      const mpdUrl = `/api/stream/${id}`
      const mpdRes = await fetch(mpdUrl).catch(() => null)
      if (!mpdRes || !mpdRes.ok) {
        const errBody = mpdRes ? await mpdRes.text().catch(() => '') : '网络错误'
        console.error('MPD fetch failed:', mpdRes?.status, errBody)
        setStatus(`MPD ${mpdRes?.status}: ${errBody.slice(0, 200)}`)
        await new Promise(r => setTimeout(r, 1500))
      } else {
        setStatus('加载播放器...')
        try {
          const dashjs = await import('dashjs')
          const player = dashjs.MediaPlayer().create()
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
    }

    // 方案3: B站 iframe 兜底
    await fallbackToIframe(article.bilibili_url, video)
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
      {!usingIframe && cdns.length > 1 && (
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 10,
          display: 'flex', gap: 4,
        }}>
          {cdns.map((cdn) => (
            <button key={cdn.index} onClick={() => {
              setCurrentCdn(cdn.index)
              setStatus('切换 CDN，重新加载...')
              setTimeout(() => { setStatus(''); window.location.reload() }, 100)
            }}
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
