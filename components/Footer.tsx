import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-r from-[#0d2b4a] to-[#1a4a7a] mt-auto py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
          <div>
            <h3 className="text-[#f0c75e] font-bold text-lg mb-2">经济危机生存指南</h3>
            <p className="text-white/60 text-sm leading-relaxed">金融危机下的资产保护与投资增值指南，提供专业的财经资讯、投资策略和资产配置建议。</p>
          </div>
          <div>
            <h4 className="text-white/80 font-medium text-sm mb-3">内容分类</h4>
            <div className="space-y-2">
              <Link href="/?type=article" className="block text-white/50 hover:text-white/80 text-sm transition-colors">文章</Link>
              <Link href="/?type=video" className="block text-white/50 hover:text-white/80 text-sm transition-colors">视频</Link>
              <Link href="/?type=audio" className="block text-white/50 hover:text-white/80 text-sm transition-colors">音频</Link>
            </div>
          </div>
          <div>
            <h4 className="text-white/80 font-medium text-sm mb-3">关于</h4>
            <div className="space-y-2">
              <Link href="/login" className="block text-white/50 hover:text-white/80 text-sm transition-colors">登录</Link>
              <Link href="/register" className="block text-white/50 hover:text-white/80 text-sm transition-colors">注册</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 text-center">
          <p className="text-white/40 text-xs">免责声明：本站内容仅供参考，不构成投资建议。投资有风险，入市需谨慎。</p>
        </div>
      </div>
    </footer>
  )
}
