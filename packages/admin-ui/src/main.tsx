// Lifted from Atomic-Chat/web-app/src/main.tsx @ f71e2280b; adapted: renders the admin root, reports browser failures through the BFF; no router, migrations, mobile or zoom handling
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'

import './index.css'
import { AdminRoot } from '@/containers/AdminRoot'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { applyStoredTheme } from '@/hooks/useTheme'
import { createServiceHub } from '@/services'
import { installBrowserReporting, reportReactFailure } from '@/services/error-reporting'

// One platform, one hub: the daemon's BFF under `/api`. Ready before the first render.
installBrowserReporting()
initializeServiceHubStore(createServiceHub())
applyStoredTheme()

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement, {
    onCaughtError: reportReactFailure,
    onUncaughtError: reportReactFailure,
    onRecoverableError: reportReactFailure,
  })
  root.render(
    <StrictMode>
      <AdminRoot />
    </StrictMode>
  )
}
