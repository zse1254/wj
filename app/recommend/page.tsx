'use client'

import { useState, useEffect, useCallback } from 'react'

interface VideoItem { bvid: string; title: string; author: string; duration: number; cover_url: string; play: number }

type Tab = 'rcmd' | 'ranking' | 'popular'

const RANKING_RIDS = [
  { rid: 0, label: '全站' },
  { rid: 1, label: '动画' },
  { rid: 3, label: '音乐' },
  { rid: 4, label: '游戏' },
  { rid: 5, label: '娱乐' },
  { rid: 119, label: '鬼畜' },
  { rid: 129, label: '舞蹈' },
  { rid: 155, label: '时尚' },
  { rid: 160, label: '生活' },
  { rid: 168, label: '国创' },
  { rid: 181, label: '影视' },
  { rid: 188, label: '科技' },
]

export default function RecommendPage() {
  const [tab, setTab] = useState<Tab>('rcmd')
  const [items, setItems] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rankingRid, setRankingRid] = useState(0)
  const [rankingName, setRankingName] = useState('')
  const [popularPn, setPopularPn] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const loadRcmd = useCallback(async () => {
    setLoading(true); setError('')
    const res = await fetch('/api/rcmd').catch(() => null)
    const json = await res?.json().catch(() => null)
    setLoading(false)
    if (!json?.success) { setError(json?.error || '加载失败'); setItems([]); return }
    setItems(json.data.items || [])
  }, [])

  const loadRanking = useCallback(async (rid: number) => {
    setLoading(true); setError('')
    const res = await fetch(`/api/ranking?rid=${rid}`).catch(() => null)
    const json = await res?.json().catch(() => null)
    setLoading(false)
    if (!json?.success) { setError(json?.error || '加载失败'); setItems([]); return }
    setRankingName(json.data.name || '')
    setItems(json.data.items || [])
  }, [])

  const loadPopular = useCallback(async (pn: number) => {
    setLoading(true); setError('')
    const res = await fetch(`/api/popular?pn=${pn}`).catch(() => null)
    const json = await res?.json().catch(() => null)
    setLoading(false)
    if (!json?.success) { setError(json?.error || '加载失败'); setItems([]); return }
    if (pn === 1) {
      setItems(json.data.items || [])
    } else {
      setItems(prev => [...prev, ...(json.data.items || [])])
    }
    setHasMore(json.data.has_more ?? false)
  }, [])

  useEffect(() => {
    if (tab === 'rcmd') loadRcmd()
    else if (tab === 'ranking') loadRanking(rankingRid)
    else if (tab === 'popular') { setPopularPn(1); loadPopular(1) }
  }, [tab, rankingRid, loadRcmd, loadRanking, loadPopular])

  function fmtDur(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function fmtCount(n: number): string {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    return String(n)
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 14, fontFamily: 'sans-serif',
    background: active ? '#fb7299' : 'rgba(255,255,255,.08)',
    color: active ? '#fff' : '#aaa', border: 'none', borderRadius: 20,
    cursor: 'pointer', transition: 'background .2s',
  })

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 16px', fontFamily: 'sans-serif', color: '#fff', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>发现好视频</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => setTab('rcmd')} style={tabBtnStyle(tab === 'rcmd')}>推荐</button>
        <button onClick={() => setTab('ranking')} style={tabBtnStyle(tab === 'ranking')}>排行</button>
        <button onClick={() => setTab('popular')} style={tabBtnStyle(tab === 'popular')}>热门</button>

        {tab === 'ranking' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 8 }}>
            {RANKING_RIDS.map(r => (
              <button
                key={r.rid}
                onClick={() => setRankingRid(r.rid)}
                style={{
                  padding: '4px 12px', fontSize: 12, fontFamily: 'sans-serif',
                  background: rankingRid === r.rid ? '#fb7299' : 'rgba(255,255,255,.06)',
                  color: rankingRid === r.rid ? '#fff' : '#aaa', border: 'none',
                  borderRadius: 14, cursor: 'pointer',
                }}
              >{r.label}</button>
            ))}
          </div>
        )}
      </div>

      {rankingName && <div style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>{rankingName}</div>}
      {error && <div style={{ color: '#f77', marginBottom: 16 }}>{error}</div>}

      {loading && items.length === 0 ? (
        <div style={{ color: '#666', textAlign: 'center', padding: 60 }}>加载中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {items.map((r, i) => (
            <a
              key={`${r.bvid}-${i}`}
              href={`/play/${r.bvid}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{ borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', border: '1px solid #333', transition: 'transform .15s' }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <div style={{ aspectRatio: '16/9', background: '#222', position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.7)', color: '#fff', fontSize: 11, padding: '1px 5px', borderRadius: 4, fontFamily: 'sans-serif' }}>
                    {fmtDur(r.duration)}
                  </span>
                  {r.play > 0 && (
                    <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,.5)', color: '#ccc', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontFamily: 'sans-serif' }}>
                      {fmtCount(r.play)} 播放
                    </span>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>{r.author}</div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {tab === 'popular' && hasMore && !loading && items.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button
            onClick={() => { const pn = popularPn + 1; setPopularPn(pn); loadPopular(pn) }}
            disabled={loading}
            style={{ padding: '10px 32px', fontSize: 14, background: 'rgba(255,255,255,.08)', color: '#ccc', border: '1px solid #444', borderRadius: 20, cursor: 'pointer', fontFamily: 'sans-serif' }}
          >载入更多</button>
        </div>
      )}
    </div>
  )
}