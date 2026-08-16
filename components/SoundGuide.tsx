'use client'

export default function SoundGuide({ visible, onUnlock }: { visible: boolean; onUnlock: () => void }) {
  if (!visible) return null

  return (
    <button
      onClick={onUnlock}
      aria-label="点击屏幕任意位置开启声音"
      className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer select-none"
      style={{ background: 'rgba(0,0,0,0.55)' }}
    >
      <div className="bg-black/85 text-white ml-8 px-5 py-3 rounded-2xl flex items-center gap-2 text-sm shadow-lg border border-white/25">
        <span className="text-lg">🔊</span>
        点击屏幕任意位置开启声音
      </div>
    </button>
  )
}