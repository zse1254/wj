'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [redeemMsg, setRedeemMsg] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [favorites, setFavorites] = useState<{ id: string; itemType: string; itemId: string; title: string; coverImage: string }[]>([])
  const [favLoading, setFavLoading] = useState(true)

  const loadFavorites = () => {
    fetch('/api/favorites').then(r => r.json()).then(res => {
      if (res.success) setFavorites(res.data)
    }).finally(() => setFavLoading(false))
  }

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(res => {
      if (res.success) setUser(res.data)
      else router.push('/login')
    }).finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    if (user) loadFavorites()
  }, [user])

  const handleRedeem = async () => {
    if (!code.trim()) return
    setRedeeming(true)
    setRedeemMsg('')
    try {
      const res = await fetch('/api/vip-cards/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setRedeemMsg('兑换成功！')
        setUser(u => u ? { ...u, isVip: true, vipExpiresAt: data.data.vipExpiresAt } : u)
        setCode('')
      } else {
        setRedeemMsg(data.error || '兑换失败')
      }
    } catch {
      setRedeemMsg('网络错误')
    } finally {
      setRedeeming(false)
    }
  }

  if (loading) return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" /></main>
      <Footer />
    </>
  )

  return (
    <>
      <Header />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">个人中心</h1>

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">基本信息</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">用户名</span><span>{user?.username as string}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">邮箱</span><span>{user?.email as string}</span></div>
            <div className="flex justify-between">
              <span className="text-gray-500">会员状态</span>
              <span className={user?.isVip ? 'text-yellow-600 font-medium' : 'text-gray-500'}>
                {user?.isVip ? `VIP 会员 (到期: ${user?.vipExpiresAt ? new Date(user.vipExpiresAt as string).toLocaleDateString('zh-CN') : '永久'})` : '普通用户'}
              </span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">注册时间</span><span>{user?.createdAt ? new Date(user.createdAt as string).toLocaleDateString('zh-CN') : ''}</span></div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">兑换 VIP 会员</h2>
          <p className="text-sm text-gray-500 mb-4">输入管理员发放的 VIP 卡密，兑换会员资格</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="请输入 VIP 卡密"
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none"
            />
            <button
              onClick={handleRedeem}
              disabled={redeeming || !code.trim()}
              className="bg-yellow-500 text-black px-6 py-2 rounded-lg font-medium hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              {redeeming ? '兑换中...' : '兑换'}
            </button>
          </div>
          {redeemMsg && (
            <p className={`mt-3 text-sm ${redeemMsg === '兑换成功！' ? 'text-green-600' : 'text-red-500'}`}>
              {redeemMsg}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">我的收藏</h2>
          {favLoading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : favorites.length === 0 ? (
            <p className="text-sm text-gray-500">还没有收藏任何内容</p>
          ) : (
            <div className="space-y-2">
              {favorites.map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  {f.coverImage && (
                    <img src={f.coverImage} alt="" className="w-12 h-9 object-cover rounded shrink-0" referrerPolicy="no-referrer" />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/${f.itemType}/${f.itemId}`} className="text-sm text-gray-800 hover:text-[#1a73e8] line-clamp-1 block">
                      {f.title}
                    </Link>
                    <span className="text-xs text-gray-400">
                      {f.itemType === 'article' ? '文章' : f.itemType === 'video' ? '视频' : f.itemType === 'audio' ? '音频' : '合集'}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch('/api/favorites', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: f.itemType, id: f.itemId }),
                      })
                      loadFavorites()
                    }}
                    className="text-xs text-red-500 hover:underline shrink-0"
                  >
                    取消
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
