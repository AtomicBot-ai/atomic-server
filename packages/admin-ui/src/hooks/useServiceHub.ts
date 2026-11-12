// Lifted from Atomic-Chat/web-app/src/hooks/useServiceHub.ts @ f71e2280b; adapted: type-only import of ServiceHub
import { create } from 'zustand'
import type { ServiceHub } from '@/services'

interface ServiceState {
  serviceHub: ServiceHub | null
  setServiceHub: (serviceHub: ServiceHub) => void
}

export const useServiceStore = create<ServiceState>()((set) => ({
  serviceHub: null,
  setServiceHub: (serviceHub: ServiceHub) => set({ serviceHub }),
}))

/**
 * Hook to get the ServiceHub instance for React components
 * Throws an error if ServiceHub is not initialized
 */
export const useServiceHub = (): ServiceHub => {
  const serviceHub = useServiceStore((state) => state.serviceHub)

  if (!serviceHub) {
    throw new Error('ServiceHub not initialized. Make sure services are initialized before using this hook.')
  }

  return serviceHub
}

/**
 * Global function to get ServiceHub for non-React contexts (Zustand stores, service files, etc.)
 * Throws an error if ServiceHub is not initialized
 */
export const getServiceHub = (): ServiceHub => {
  const serviceHub = useServiceStore.getState().serviceHub

  if (!serviceHub) {
    throw new Error(
      'ServiceHub not initialized. Make sure services are initialized before accessing services.'
    )
  }

  return serviceHub
}

/**
 * Initialize the ServiceHub in the store
 * This should only be called from the root layout after service initialization
 */
export const initializeServiceHubStore = (serviceHub: ServiceHub) => {
  useServiceStore.getState().setServiceHub(serviceHub)
}
