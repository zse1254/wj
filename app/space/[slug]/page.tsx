'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import SpacePostCard from '@/components/SpacePostCard'

interface SpacePost {
  id: string
  bvid: string
  title: string
  cover_image: string
  duration: number
  created_at: string
  bilibili_url: string
}

interface Space {
  id: string
  slug: string
  display_name: string
  is_public: number
  owner_username: string
}

export default function SpacePage() {
  const params = useParams()
  const slug = String(params.slug)
  const [space, setSpace] = useState<Space | null>(null)
  const [posts, setPosts] = useState<SpacePost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/spaces/${slug}`).then(r => r.json()).then(res => {
      if (res.success) {
        setSpace(res.data.space)
        setPosts(res.data.posts)
      } else {
        setError(res.error || '空间不存在')
      }
    }).catch(() => setError('加载失败')).finally(() => setLoading(false))
  }, [slug])

  if (loading) return (
    <><Header /><main className="flex-1 flex items-center justify-center py-24 text-gray-400">加载中...</main><Footer /></>
  )

  if (error || !space) return (
    <><Header /><main className="flex-1 flex items-center justify-center py-24">
      <div className="text-center">
        <div className="text-5xl mb-4 opacity-50">🔍</div>
        <p className="text-gray-500">{error || '空间不存在'}</p>
        <Link href="/" className="text-[#1a73e8] hover:underline mt-4 block">返回首页</Link>
      </div>
    </main><Footer /></>
  )

  return (
    <>
      <Header />
      <main className="flex-1 w-full">
        <div className="relative overflow-hidden bg-[#0a1f38]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d2b4a] via-[#0f3a63] to-[#1a4a7a]" />
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#f0c75e]/10 blur-3xl" />
          <div className="relative max-w-6xl mx-auto px-4 py-10">
            <Link href="/" className="text-white/60 hover:text-white text-sm mb-4 inline-block">← 返回首页</Link>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[#f0c75e] text-[#0d2b4a] flex items-center justify-center text-2xl font-bold shadow-lg">
                {space.display_name.slice(0, 1)}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">{space.display_name}</h1>
                <p className="text-white/60 text-sm mt-1">@{space.owner_username} · 共 {posts.length} 个分享</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          {posts.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-5xl mb-4 opacity-50">📭</div>
              <p>该用户还没有分享视频</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {posts.map(p => <SpacePostCard key={p.id} post={p} />)}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
