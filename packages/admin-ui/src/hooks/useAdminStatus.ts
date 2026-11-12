import { useStatusStore } from '@/stores/status-store'

export function useAdminStatus() {
  const status = useStatusStore((state) => state.status)
  const loading = useStatusStore((state) => state.loading)
  const error = useStatusStore((state) => state.error)
  const unauthorized = useStatusStore((state) => state.unauthorized)
  const updatedAt = useStatusStore((state) => state.updatedAt)
  const refresh = useStatusStore((state) => state.refresh)
  return { status, loading, error, unauthorized, updatedAt, refresh }
}
