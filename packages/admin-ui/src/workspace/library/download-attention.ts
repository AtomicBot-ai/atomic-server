import { useEffect, useState } from 'react'

const eventName = 'atomic:download-attention'
export function highlightDownloads() {
  window.dispatchEvent(new Event(eventName))
}
export function useDownloadAttention() {
  const [request, setRequest] = useState(0)
  useEffect(() => {
    const highlight = () => setRequest((value) => value + 1)
    window.addEventListener(eventName, highlight)
    return () => window.removeEventListener(eventName, highlight)
  }, [])
  return request
}
