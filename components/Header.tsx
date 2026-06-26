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
    document.cookie = 'token=; Path=/; Max-Age=0'
    setUser(null)
    window.location.href = '/'
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-[#1a73e8]">
          经济危机生存指南
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/?type=article" className="hover:text-[#1a73e8] transition-colors">文章</Link>
          <Link href="/?type=video" className="hover:text-[#1a73e8] transition-colors">视频</Link>
          <Link href="/?type=audio" className="hover:text-[#1a73e8] transition-colors">音频</Link>
          {user?.isAdmin && (
            <Link href="/admin" className="text-orange-600 hover:text-orange-700 font-medium">管理后台</Link>
          )}
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 text-sm hover:text-[#1a73e8]">
                <span className="w-7 h-7 bg-[#1a73e8] text-white rounded-full flex items-center justify-center text-xs font-medium">
                  {user.username[0]}
                </span>
                <span className="hidden sm:inline">{user.username}</span>
                {user.isVip && <span className="text-xs bg-yellow-400 text-black px-1.5 py-0.5 rounded font-bold">VIP</span>}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 min-w-[140px] text-sm z-50">
                  <Link href="/profile" className="block px-4 py-2 hover:bg-gray-50" onClick={() => setMenuOpen(false)}>个人中心</Link>
                  {user.isAdmin && (
                    <Link href="/admin" className="block px-4 py-2 hover:bg-gray-50 text-orange-600" onClick={() => setMenuOpen(false)}>管理后台</Link>
                  )}
                  <button onClick={() => { setMenuOpen(false); handleLogout() }} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-red-500">退出登录</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="text-sm text-[#1a73e8] hover:underline">登录</Link>
              <Link href="/register" className="text-sm bg-[#1a73e8] text-white px-4 py-1.5 rounded-md hover:bg-[#1557b0] transition-colors">注册</Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
