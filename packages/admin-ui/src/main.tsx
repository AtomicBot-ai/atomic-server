// Lifted from Atomic-Chat/web-app/src/main.tsx @ f71e2280b; adapted: renders the admin root, no router; no Sentry, migrations, mobile or zoom handling
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'
import { AdminRoot } from '@/containers/AdminRoot'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { applyStoredTheme } from '@/hooks/useTheme'
import { createServiceHub } from '@/services'

// One platform, one hub: the daemon's BFF under `/api`. Ready before the first render.
initializeServiceHubStore(createServiceHub())
applyStoredTheme()

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <AdminRoot />
    </StrictMode>
  )
}
