'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

interface UserInfo {
  id: string
  username: string
  isAdmin: boolean
  isVip: boolean
}

export default function Header() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(res => {
      if (res.success) setUser(res.data)
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setUser(null)
    window.location.href = '/'
  }

  return (
    <header className="bg-gradient-to-r from-[#0d2b4a] to-[#1a4a7a] sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight drop-shadow-sm"><span className="text-[#f0c75e]">经济危机</span><span className="text-[#ffd866]">生存指南</span></span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link href="/?type=article" className="text-[#f0c75e]/90 hover:text-[#f0c75e] px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors font-medium">文章</Link>
          <Link href="/?type=video" className="text-[#f0c75e]/90 hover:text-[#f0c75e] px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors font-medium">视频</Link>
          <Link href="/?type=audio" className="text-[#f0c75e]/90 hover:text-[#f0c75e] px-3 py-1.5 rounded-md hover:bg-white/10 transition-colors font-medium">音频</Link>
         </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 text-sm text-[#f0c75e]/90 hover:text-[#f0c75e]">
                <span className="w-7 h-7 bg-[#f0c75e] text-[#0d2b4a] rounded-full flex items-center justify-center text-xs font-bold">
                  {user.username[0]}
                </span>
                <span className="hidden sm:inline">{user.username}</span>
                {user.isVip && <span className="text-xs bg-[#f0c75e] text-[#0d2b4a] px-1.5 py-0.5 rounded font-bold">VIP</span>}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border rounded-xl shadow-xl py-1 min-w-[150px] text-sm z-50 overflow-hidden">
                  <Link href="/profile" className="block px-4 py-2.5 hover:bg-gray-50 text-gray-700" onClick={() => setMenuOpen(false)}>个人中心</Link>
                   <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => { setMenuOpen(false); handleLogout() }} className="block w-full text-left px-4 py-2.5 hover:bg-gray-50 text-red-500">退出登录</button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
