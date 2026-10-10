// Lifted from Atomic-Chat/web-app/src/main.tsx @ f71e2280b; adapted: router setup only; no Sentry, migrations, mobile or zoom handling
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

import './index.css'
import { initializeServiceHubStore } from '@/hooks/useServiceHub'
import { applyStoredTheme } from '@/hooks/useTheme'
import { createServiceHub } from '@/services'

// One platform, one hub: the daemon's BFF under `/api`. Ready before the first render.
initializeServiceHubStore(createServiceHub())
applyStoredTheme()

// Create a new router instance
const router = createRouter({ routeTree, defaultPreload: 'intent' })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  )
}
