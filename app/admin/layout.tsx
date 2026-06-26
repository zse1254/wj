'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/admin', label: '仪表盘', icon: '📊' },
  { href: '/admin/articles', label: '内容管理', icon: '📝' },
  { href: '/admin/categories', label: '分类管理', icon: '🏷️' },
  { href: '/admin/vip-cards', label: 'VIP 卡密', icon: '💎' },
  { href: '/admin/users', label: '用户管理', icon: '👥' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(res => {
      if (res.success && res.data.isAdmin) {
        setAuthed(true)
      } else {
        router.push('/login')
      }
    }).catch(() => router.push('/login')).finally(() => setChecking(false))
  }, [router])

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!authed) return null

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <Link href="/admin" className="h-14 flex items-center px-5 border-b border-gray-200 font-bold text-[#1a73e8] text-lg">
          管理后台
        </Link>
        <nav className="flex-1 py-4">
          {navItems.map(item => {
            const isActive = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive ? 'bg-blue-50 text-[#1a73e8] font-medium border-r-2 border-[#1a73e8]' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <Link href="/" className="text-sm text-gray-500 hover:text-[#1a73e8] flex items-center gap-2">
            <span>←</span> <span>返回网站</span>
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
