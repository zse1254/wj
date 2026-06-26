'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [redeemMsg, setRedeemMsg] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(res => {
      if (res.success) setUser(res.data)
      else router.push('/login')
    }).finally(() => setLoading(false))
  }, [router])

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
      </main>
      <Footer />
    </>
  )
}
