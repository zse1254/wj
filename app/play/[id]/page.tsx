'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

interface Cdn { key: string; label: string; index: number }
interface Quality { qn: number; label: string; count: number }
interface Audio { id: number; label: string; codecs: string }

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
      if (!j.success) return
      if (j.cdns?.length) {
        setCdns(j.cdns)
        const saved = localStorage.getItem(`cdn-${id}`)
        if (saved && j.cdns.find((c: Cdn) => c.key === saved)) setCurrentCdn(saved)
      }
      if (j.qualities?.length) {
        setQualities(j.qualities)
        // 选最高清晰度作为初始（APK 风格）
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
      const mpdUrl = `/api/stream/${id}?cdn=${encodeURIComponent(cdn)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}`
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
        player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false, audio: false } } } })
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
    setMenuOpen('')
    if (cdn.key === currentCdn) return
    localStorage.setItem(`cdn-${id}`, cdn.key)
    setCurrentCdn(cdn.key)
    setStatus(`切换 CDN: ${cdn.label}`)
    reloadMpd()
  }

  function switchQn(q: Quality) {
    const id = params.id as string
    setMenuOpen('')
    if (String(q.qn) === currentQn) return
    localStorage.setItem(`qn-${id}`, String(q.qn))
    setCurrentQn(String(q.qn))
    setStatus(`切换清晰度: ${q.label}`)
    reloadMpd()
  }

  function switchAudio(a: Audio) {
    const id = params.id as string
    setMenuOpen('')
    if (String(a.id) === currentAudio) return
    localStorage.setItem(`audio-${id}`, String(a.id))
    setCurrentAudio(String(a.id))
    setStatus(`切换音轨: ${a.label}`)
    reloadMpd()
  }

  function reloadMpd() {
    const id = params.id as string
    if (playerRef.current) {
      const cdn = localStorage.getItem(`cdn-${id}`) || '0'
      const qn = localStorage.getItem(`qn-${id}`) || 'all'
      const audio = localStorage.getItem(`audio-${id}`) || 'all'
      const newMpd = `/api/stream/${id}?cdn=${encodeURIComponent(cdn)}&qn=${encodeURIComponent(qn)}&audio=${encodeURIComponent(audio)}&_=${Date.now()}`
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
