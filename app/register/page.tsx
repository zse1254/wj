'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: '', password: '', confirmPassword: '', inviteCode: '' })
  const [captcha, setCaptcha] = useState({ token: '', question: '' })
  const [captchaInput, setCaptchaInput] = useState('')
  const [inviteRequired, setInviteRequired] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const loadCaptcha = () => {
    fetch('/api/auth/captcha', { method: 'POST' }).then(r => r.json()).then(d => {
      if (d.success) setCaptcha({ token: d.token, question: d.question })
    })
  }

  useEffect(() => {
    loadCaptcha()
    fetch('/api/auth/invite-required').then(r => r.json()).then(d => {
      if (d.success) setInviteRequired(d.required)
    }).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('两次密码不一致')
      return
    }
    if (form.password.length < 6) {
      setError('密码至少6位')
      return
    }
    if (inviteRequired && !form.inviteCode.trim()) {
      setError('请输入邀请码')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          captchaToken: captcha.token,
          captchaAnswer: Number(captchaInput),
          inviteCode: form.inviteCode.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        router.push('/')
        router.refresh()
      } else {
        setError(data.error || '注册失败')
        loadCaptcha()
        setCaptchaInput('')
      }
    } catch {
      setError('网络错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-16 bg-gradient-to-b from-[#f0f2f5] to-white">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-[#0d2b4a]">创建账号</h1>
            <p className="text-gray-500 text-sm mt-1">注册获取更多功能</p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">用户名</label>
                <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="输入用户名" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
                <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="至少6位" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
                <input type="password" value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="再次输入密码" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">验证码</label>
                <div className="flex gap-2">
                  <input type="text" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder={captcha.question || '点击刷新'} required />
                  <button type="button" onClick={loadCaptcha}
                    className="px-3 py-2.5 text-sm bg-gray-100 rounded-xl hover:bg-gray-200 whitespace-nowrap">{captcha.question || '刷新'}</button>
                </div>
              </div>
              {inviteRequired && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">邀请码</label>
                  <input type="text" value={form.inviteCode} onChange={e => setForm(f => ({ ...f, inviteCode: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#1a73e8] outline-none text-sm" placeholder="请输入邀请码" required />
                </div>
              )}
              {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-[#1a4a7a] text-white py-2.5 rounded-xl hover:bg-[#0d2b4a] disabled:opacity-50 transition-all duration-200 font-medium shadow-md hover:shadow-lg">
                {loading ? '注册中...' : '注册'}
              </button>
            </form>
            <p className="text-sm text-center mt-6 text-gray-500">
              已有账号？<Link href="/login" className="text-[#1a73e8] hover:underline font-medium">登录</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
