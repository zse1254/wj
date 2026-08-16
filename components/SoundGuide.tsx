'use client'

import { useState, useEffect } from 'react'

export default function SoundGuide({ show }: { show: boolean }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!show) { setVisible(false); return }
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 6000)
    return () => clearTimeout(t)
  }, [show])

  if (!visible) return null

  return (
    <div
      className="absolute pointer-events-none select-none z-10"
      style={{ right: '3%', top: '50%', transform: 'translateY(-50%)' }}
    >
      <div className="relative flex items-center">
        <div className="bg-black text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap border border-white/25">
          点击🔔开启声音
        </div>
        <span className="absolute -right-1 top-1/2 -translate-y-1/2 border-y-[6px] border-y-transparent border-l-[7px] border-l-black" />
        <span className="absolute -right-[2px] top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-l-[5px] border-l-white" />
        <div className="relative ml-3 w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-black/60 animate-ping" style={{ animationDelay: '0.5s' }} />
          <div className="absolute inset-0 rounded-full border-2 border-white/80 animate-ping" />
          <div className="absolute inset-0 rounded-full border border-white/60" />
          <div className="absolute inset-0 rounded-full bg-black border border-white/40 flex items-center justify-center text-lg">🔊</div>
        </div>
      </div>
    </div>
  )
}