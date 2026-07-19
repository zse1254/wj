import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { query } from "@/lib/db"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export async function generateMetadata(): Promise<Metadata> {
  const defaults = {
    title: "经济危机生存指南 - 系统化的应对方法与实战策略",
    description: "我们不预测市场，也不给投资建议。我们拆解真实困境中的应对方法，用系统化的策略、案例与认知训练，帮你在任何周期都稳住节奏、持续成长。",
    keywords: "经济危机,应对方法,资产保护,风险应对,学习,实战策略,认知升级",
  }
  try {
    const rows = await query("SELECT key, value FROM settings WHERE key IN ('seo_title','seo_description','seo_keywords')")
    const data: Record<string, string> = {}
    for (const r of rows) data[String(r.key)] = String(r.value ?? '')
    const title = data.seo_title || defaults.title
    const description = data.seo_description || defaults.description
    const keywords = data.seo_keywords || defaults.keywords
    return {
      title,
      description,
      keywords,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "zh_CN",
      },
      twitter: { card: "summary_large_image", title, description },
      robots: { index: true, follow: true },
    }
  } catch {
    return { title: defaults.title, description: defaults.description }
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#f5f5f5]">{children}</body>
    </html>
  )
}
