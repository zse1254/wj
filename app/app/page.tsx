'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface VideoItem {
  bvid: string
  title: string
  author: string
  duration: number
  cover_url: string
  play: number
  danmaku?: number
  pts?: number
}

type Tab = 'rcmd' | 'ranking' | 'popular' | 'search'

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

export default function AppHomePage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('rcmd')
  const [items, setItems] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rankingRid, setRankingRid] = useState(0)
  const [rankingName, setRankingName] = useState('')
  const [popularPn, setPopularPn] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [searchKw, setSearchKw] = useState('')
  const [searchInput, setSearchInput] = useState('')

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

  const doSearch = useCallback(async (kw: string) => {
    if (!kw || kw.length < 2) { setError('请输入至少2个字符'); return }
    setLoading(true); setError('')
    const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}`).catch(() => null)
    const json = await res?.json().catch(() => null)
    setLoading(false)
    if (!json?.success) { setError(json?.error || '搜索失败'); setItems([]); return }
    setItems(json.data.items || [])
  }, [])

  useEffect(() => {
    if (tab === 'rcmd') loadRcmd()
    else if (tab === 'ranking') loadRanking(rankingRid)
    else if (tab === 'popular') { setPopularPn(1); loadPopular(1) }
    else if (tab === 'search') {
      if (searchKw) doSearch(searchKw)
      else setItems([])
    }
  }, [tab, rankingRid, searchKw, loadRcmd, loadRanking, loadPopular, doSearch])

  function fmtDur(s: number): string {
    if (!s) return ''
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function fmtCount(n: number): string {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
    return String(n)
  }

  function handlePlay(bvid: string) {
    router.push(`/play/${bvid}`)
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 14, fontFamily: 'sans-serif', fontWeight: 500,
    background: active ? '#fb7299' : 'rgba(255,255,255,.08)',
    color: active ? '#fff' : '#aaa', border: 'none', borderRadius: 20,
    cursor: 'pointer', transition: 'all .2s',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f0f', color: '#fff', fontFamily: 'sans-serif' }}>
      {/* 顶栏 */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(15,15,15,.95)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid rgba(255,255,255,.08)', padding: '12px 20px',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fb7299', margin: 0, letterSpacing: 1 }}>
            📺 Play
          </h1>
          {/* 搜索框 */}
          <form
            onSubmit={e => { e.preventDefault(); if (searchInput.trim().length >= 2) { setTab('search'); setSearchKw(searchInput.trim()) } }}
            style={{ display: 'flex', flex: 1, maxWidth: 480, gap: 0 }}
          >
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="搜索B站视频..."
              style={{
                flex: 1, padding: '8px 16px', fontSize: 14, borderRadius: '20px 0 0 20px',
                background: 'rgba(255,255,255,.08)', color: '#fff', border: '1px solid rgba(255,255,255,.12)', outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 20px', fontSize: 14, background: '#fb7299', color: '#fff',
                border: 'none', borderRadius: '0 20px 20px 0', cursor: 'pointer', fontWeight: 500,
              }}
            >搜索</button>
          </form>
          <button onClick={() => { setTab('rcmd') }} style={tabBtnStyle(tab === 'rcmd')}>推荐</button>
          <button onClick={() => { setTab('popular') }} style={tabBtnStyle(tab === 'popular')}>热门</button>
          <button onClick={() => { setTab('ranking') }} style={tabBtnStyle(tab === 'ranking')}>排行</button>
        </div>
      </header>

      {/* 排行分类筛选 */}
      {tab === 'ranking' && (
        <div style={{ maxWidth: 1200, margin: '12px auto', padding: '0 20px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {RANKING_RIDS.map(r => (
            <button
              key={r.rid}
              onClick={() => setRankingRid(r.rid)}
              style={{
                padding: '4px 14px', fontSize: 12, fontFamily: 'sans-serif',
                background: rankingRid === r.rid ? '#fb7299' : 'rgba(255,255,255,.06)',
                color: rankingRid === r.rid ? '#fff' : '#aaa', border: 'none',
                borderRadius: 14, cursor: 'pointer', transition: 'all .15s',
              }}
            >{r.label}</button>
          ))}
        </div>
      )}

      {rankingName && tab === 'ranking' && (
        <div style={{ maxWidth: 1200, margin: '4px auto 0', padding: '0 20px', color: '#888', fontSize: 13 }}>{rankingName}</div>
      )}

      {/* 主体内容 */}
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
        {error && (
          <div style={{ color: '#ff6b6b', textAlign: 'center', padding: 40, fontSize: 14 }}>{error}</div>
        )}

        {loading && items.length === 0 ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 60, fontSize: 14 }}>加载中...</div>
        ) : items.length === 0 && !error && (tab !== 'search' || searchKw) ? (
          <div style={{ color: '#666', textAlign: 'center', padding: 60, fontSize: 14 }}>暂无内容</div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16,
          }}>
            {items.map((r, i) => (
              <div
                key={`${r.bvid}-${i}`}
                onClick={() => handlePlay(r.bvid)}
                style={{
                  borderRadius: 10, overflow: 'hidden', background: '#1a1a1a',
                  border: '1px solid rgba(255,255,255,.06)', cursor: 'pointer',
                  transition: 'transform .15s, border-color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = 'rgba(251,114,153,.4)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.borderColor = 'rgba(255,255,255,.06)' }}
              >
                <div style={{ aspectRatio: '16/9', background: '#222', position: 'relative' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  {r.duration > 0 && (
                    <span style={{
                      position: 'absolute', bottom: 6, right: 6, background: 'rgba(0,0,0,.75)',
                      color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 4,
                    }}>{fmtDur(r.duration)}</span>
                  )}
                  {r.play > 0 && (
                    <span style={{
                      position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,.55)',
                      color: '#ddd', fontSize: 11, padding: '2px 7px', borderRadius: 4,
                    }}>▶ {fmtCount(r.play)}</span>
                  )}
                  {tab === 'ranking' && i < 3 && (
                    <span style={{
                      position: 'absolute', top: 6, right: 6, background: '#fb7299',
                      color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    }}>{i + 1}</span>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 6,
                    overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    color: '#eee',
                  }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{r.author}</span>
                    {(r.danmaku ?? 0) > 0 && <span style={{ color: '#666' }}>💬 {fmtCount(r.danmaku!)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 热门分页 */}
        {tab === 'popular' && hasMore && !loading && items.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button
              onClick={() => { const pn = popularPn + 1; setPopularPn(pn); loadPopular(pn) }}
              style={{
                padding: '10px 32px', fontSize: 14, background: 'rgba(255,255,255,.08)', color: '#ccc',
                border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, cursor: 'pointer',
              }}
            >载入更多</button>
          </div>
        )}
      </main>

      {/* 底部空隙 */}
      <div style={{ height: 60 }} />
    </div>
  )
}