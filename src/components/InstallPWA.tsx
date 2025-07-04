import { useEffect, useState } from 'react'

export const InstallPWA = () => {
  const [prompt, setPrompt] = useState<Event | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handler as EventListener)
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    const deferredPrompt = prompt as any
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setPrompt(null)
  }

  if (!prompt) return null

  return (
    <button 
      onClick={install}
      className="pwa-install-button"
    >
      📲 Instalar App
    </button>
  )
}