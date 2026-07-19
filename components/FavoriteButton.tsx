'use client'

import { useEffect, useState } from 'react'

export default function FavoriteButton({ type, id }: { type: string; id: string }) {
  const [favorited, setFavorited] = useState(false)
  const [loading, setLoading] = useState(false)
  const [limitMsg, setLimitMsg] = useState('')

  useEffect(() => {
    fetch(`/api/favorites?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setFavorited(d.favorited) })
      .catch(() => {})
  }, [type, id])

  const toggle = async () => {
    if (loading) return
    setLoading(true)
    setLimitMsg('')
    try {
      if (favorited) {
        const res = await fetch('/api/favorites', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id }),
        })
        const d = await res.json()
        if (d.success) setFavorited(false)
      } else {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, id }),
        })
        const d = await res.json()
        if (d.success) setFavorited(true)
        else if (d.error) setLimitMsg(d.error)
      }
    } catch {
      setLimitMsg('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={toggle}
        disabled={loading}
        title={favorited ? '取消收藏' : '加入收藏'}
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
          favorited
            ? 'bg-red-500 border-red-500 text-white hover:bg-red-600 shadow-sm'
            : 'bg-white border-[#1a73e8] text-[#1a73e8] hover:bg-[#1a73e8] hover:text-white'
        }`}
      >
        <span className="text-base leading-none">{favorited ? '♥' : '♡'}</span>
        <span>{favorited ? '已收藏' : '收藏'}</span>
      </button>
      {limitMsg && <span className="text-xs text-red-500">{limitMsg}</span>}
    </div>
  )
}
