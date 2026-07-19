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

  const [mySpace, setMySpace] = useState<{ slug: string; display_name: string; is_public: boolean } | null>(null)
  const [spaceLoaded, setSpaceLoaded] = useState(false)
  const [spaceSlug, setSpaceSlug] = useState('')
  const [spaceName, setSpaceName] = useState('')
  const [spacePublic, setSpacePublic] = useState(true)
  const [posts, setPosts] = useState<{ id: string; title: string; cover_image: string }[]>([])
  const [postUrl, setPostUrl] = useState('')
  const [spaceMsg, setSpaceMsg] = useState('')
  const [spaceSaving, setSpaceSaving] = useState(false)
  const [posting, setPosting] = useState(false)

  const loadSpace = () => {
    fetch('/api/spaces/my').then(r => r.json()).then(res => {
      if (res.success && res.data) {
        setMySpace(res.data.space)
        setSpaceSlug(res.data.space.slug)
        setSpaceName(res.data.space.display_name)
        setSpacePublic(res.data.space.is_public === 1)
        setPosts(res.data.posts || [])
      }
    }).finally(() => setSpaceLoaded(true))
  }

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
    if (user) {
      loadFavorites()
      if (user.isVip) loadSpace()
    }
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

        {user?.isVip === true && (
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold mb-1">我的空间</h2>
            <p className="text-sm text-gray-500 mb-4">VIP 专属：粘贴 B 站视频链接即可生成你的分享主页，支持自定义后缀与公开设置。</p>

            {!spaceLoaded ? (
              <p className="text-sm text-gray-400">加载中...</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">空间名称</label>
                    <input value={spaceName} onChange={e => setSpaceName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="如：我的B站分享" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">网址后缀 (/space/ 后面)</label>
                    <input value={spaceSlug} onChange={e => setSpaceSlug(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="仅字母数字下划线中文" />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={spacePublic} onChange={e => setSpacePublic(e.target.checked)} />
                      公开（在主页用户区展示）
                    </label>
                  </div>
                </div>

                <button onClick={async () => {
                  setSpaceSaving(true); setSpaceMsg('')
                  try {
                    const res = await fetch('/api/spaces', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ slug: spaceSlug, display_name: spaceName, is_public: spacePublic }),
                    })
                    const d = await res.json()
                    if (d.success) { setSpaceMsg('已保存'); setMySpace({ slug: d.data.slug, display_name: spaceName, is_public: spacePublic }); loadSpace() }
                    else setSpaceMsg(d.error || '保存失败')
                  } catch { setSpaceMsg('网络错误') } finally { setSpaceSaving(false) }
                }} disabled={spaceSaving}
                  className="bg-[#1a4a7a] text-white px-5 py-2 rounded-lg text-sm hover:bg-[#0d2b4a] disabled:opacity-50 mb-4">
                  {spaceSaving ? '保存中...' : (mySpace ? '更新空间' : '创建空间')}
                </button>
                {mySpace && (
                  <p className="text-xs text-gray-400 mb-4">你的空间地址：<Link href={`/space/${mySpace.slug}`} className="text-[#1a73e8] hover:underline" target="_blank">/space/{mySpace.slug}</Link></p>
                )}

                {mySpace && (
                  <>
                    <div className="border-t border-gray-100 pt-4">
                      <label className="block text-xs text-gray-500 mb-1">添加 B 站视频链接（仅支持 bilibili.com / b23.tv）</label>
                      <div className="flex gap-2">
                        <input value={postUrl} onChange={e => setPostUrl(e.target.value)}
                          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="https://www.bilibili.com/video/BV..." />
                        <button onClick={async () => {
                          if (!postUrl.trim()) return
                          setPosting(true); setSpaceMsg('')
                          try {
                            const res = await fetch('/api/spaces/posts', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url: postUrl.trim() }),
                            })
                            const d = await res.json()
                            if (d.success) { setPostUrl(''); setSpaceMsg('已添加'); loadSpace() }
                            else setSpaceMsg(d.error || '添加失败')
                          } catch { setSpaceMsg('网络错误') } finally { setPosting(false) }
                        }} disabled={posting}
                          className="bg-[#1a73e8] text-white px-5 py-2 rounded-lg text-sm hover:bg-[#1557b0] disabled:opacity-50">
                          {posting ? '获取中...' : '添加'}
                        </button>
                      </div>
                      {spaceMsg && <p className="text-sm mt-2 text-gray-600">{spaceMsg}</p>}

                      <div className="mt-4 space-y-2">
                        {posts.length === 0 && <p className="text-sm text-gray-400">还没有分享视频</p>}
                        {posts.map(p => (
                          <div key={p.id} className="flex items-center gap-3 p-3 border rounded-lg">
                            {p.cover_image && (
                              <img src={p.cover_image} alt="" className="w-16 h-10 object-cover rounded shrink-0" referrerPolicy="no-referrer" />
                            )}
                            <span className="flex-1 text-sm text-gray-800 line-clamp-1">{p.title}</span>
                            <button onClick={async () => {
                              await fetch('/api/spaces/posts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
                              loadSpace()
                            }} className="text-xs text-red-500 hover:underline shrink-0">删除</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

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
