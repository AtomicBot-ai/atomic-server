import { useEffect, useState } from 'react'

/** Match the desktop's collapsible sidebar and a drawer on compact screens. */
export function useWorkspaceSidebar() {
  const [compact, setCompact] = useState(window.innerWidth <= 900)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    const resize = () => {
      const next = window.innerWidth <= 900
      setCompact(next)
      if (!next) setSidebarOpen(false)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  return {
    sidebarOpen,
    setSidebarOpen,
    sidebarCollapsed,
    expanded: compact ? sidebarOpen : !sidebarCollapsed,
    toggle: () => (compact ? setSidebarOpen((value) => !value) : setSidebarCollapsed((value) => !value)),
    reveal: () => {
      setSidebarCollapsed(false)
      if (compact) setSidebarOpen(true)
    },
  }
}
