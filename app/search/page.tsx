'use client'

import { useState, useCallback } from 'react'

interface Result { bvid: string; title: string; author: string; duration: string; cover_url: string; play: number }

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(async (kw: string) => {
    if (!kw || kw.length < 2) return
    setLoading(true); setError('')
    const res = await fetch(`/api/search?q=${encodeURIComponent(kw)}`).catch(() => null)
    const json = await res?.json().catch(() => null)
    setLoading(false)
    if (!json?.success) { setError(json?.error || '搜索失败'); setResults([]); return }
    setResults(json.data.items || [])
  }, [])

  function fmtDur(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 16px', fontFamily: 'sans-serif', color: '#fff', background: '#111', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>B站 视频搜索</h1>
      <form
        onSubmit={e => { e.preventDefault(); search(q) }}
        style={{ display: 'flex', gap: 8, marginBottom: 24 }}
      >
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="输入关键词..."
          style={{ flex: 1, padding: '12px 16px', fontSize: 16, borderRadius: 8, border: '1px solid #444', background: '#222', color: '#fff', outline: 'none' }}
        />
        <button type="submit" disabled={loading} style={{ padding: '12px 24px', fontSize: 16, borderRadius: 8, border: 'none', background: '#fb7299', color: '#fff', cursor: 'pointer' }}>
          {loading ? '...' : '搜索'}
        </button>
      </form>

      {error && <div style={{ color: '#f77', marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {results.map(r => (
          <a
            key={r.bvid}
            href={`/play/${r.bvid}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ borderRadius: 10, overflow: 'hidden', background: '#1a1a1a', border: '1px solid #333', transition: 'transform .15s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ aspectRatio: '16/9', background: '#222' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.cover_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {r.title}
                </div>
                <div style={{ fontSize: 12, color: '#888', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.author}</span>
                  <span>{fmtDur(r.duration)}</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>

      {!loading && results.length === 0 && !error && q && (
        <div style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>暂无结果</div>
      )}
    </div>
  )
}