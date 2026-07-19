'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function Footer() {
  const [footerText, setFooterText] = useState('')
  const [slogan, setSlogan] = useState('')
  const [contactText, setContactText] = useState('')
  const [contactQrcode, setContactQrcode] = useState('')
  const [showContact, setShowContact] = useState(false)

  useEffect(() => {
    fetch('/api/settings/public').then(r => r.json()).then(res => {
      if (res.success) {
        if (res.data.site_slogan) setSlogan(res.data.site_slogan)
        if (res.data.footer_text) setFooterText(res.data.footer_text)
        if (res.data.contact_text) setContactText(res.data.contact_text)
        if (res.data.contact_qrcode) setContactQrcode(res.data.contact_qrcode)
      }
    }).catch(() => {})
  }, [])

  return (
    <footer className="relative mt-auto overflow-hidden bg-[#0a1f38]">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0d2b4a] via-[#0f3a63] to-[#1a4a7a] opacity-95" />
      <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-[#f0c75e]/10 blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-[#1a73e8]/10 blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl font-extrabold tracking-tight">
                <span className="text-[#f0c75e]">经济危机</span><span className="text-[#ffd866]">生存指南</span>
              </span>
            </div>
            <p className="text-white/70 text-sm leading-relaxed max-w-md">
              {slogan || '在波动的时代里，把不确定性变成可学习的技能。我们提供系统化的应对方法、实战策略与认知升级，帮助你在任何周期都稳住脚步、持续成长。'}
            </p>
          </div>
          <div>
            <h4 className="text-white font-medium text-sm mb-4 tracking-wide">内容导航</h4>
            <div className="space-y-2.5">
              <Link href="/?type=article" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">文章</Link>
              <Link href="/?type=video" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">视频</Link>
              <Link href="/?type=audio" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">音频</Link>
              <Link href="/?type=series" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">合集</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white font-medium text-sm mb-4 tracking-wide">账户</h4>
            <div className="space-y-2.5">
              <Link href="/login" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">登录</Link>
              <Link href="/register" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">注册</Link>
              <Link href="/profile" className="block text-white/55 hover:text-[#ffd866] text-sm transition-colors">个人中心</Link>
            </div>
            {(contactText || contactQrcode) && (
              <button onClick={() => setShowContact(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-[#0d2b4a] bg-[#f0c75e] hover:bg-[#ffd866] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                💬 联系客服
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 pt-6">
          <p className="text-white/40 text-xs leading-relaxed">
            {footerText || '本站内容仅供学习与交流，不构成任何投资建议。市场有风险，决策需谨慎，请结合自身情况独立判断。'}
          </p>
          <p className="text-white/25 text-xs mt-2">© {new Date().getFullYear()} 经济危机生存指南 · 学以致用，从容应对</p>
        </div>
      </div>

      {showContact && (
        <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4" onClick={() => setShowContact(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowContact(false)} className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            <h3 className="text-lg font-bold text-gray-900 mb-3">联系客服</h3>
            {contactText && <p className="text-gray-600 text-sm mb-4 whitespace-pre-wrap">{contactText}</p>}
            {contactQrcode && (
              <img src={contactQrcode} alt="客服二维码" className="w-48 h-48 object-contain mx-auto rounded-lg border border-gray-100" referrerPolicy="no-referrer" />
            )}
            {!contactText && !contactQrcode && <p className="text-gray-400 text-sm">暂未配置客服信息</p>}
            <p className="text-xs text-gray-400 mt-4">手机长按二维码可识别添加</p>
          </div>
        </div>
      )}
    </footer>
  )
}
