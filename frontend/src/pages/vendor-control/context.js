import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import api from '../../services/api'

const DASHBOARD_URL = '/vendor-control/dashboard/'

export const VendorControlContext = createContext(null)

export function useVendorControl() {
  const ctx = useContext(VendorControlContext)
  if (!ctx) throw new Error('useVendorControl must be used within a VendorControlLayout route')
  return ctx
}

// Fetches the dashboard payload once (it doubles as the "am I admin" probe —
// there's no separate endpoint for that) and exposes it via context so child
// routes don't each re-fetch it on mount.
export function useVendorControlProvider() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refetch = useCallback(() => {
    setLoading(true)
    setError('')
    return api.get(DASHBOARD_URL)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load vendor authorization data.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return {
    data,
    isAdmin: !!data?.is_admin,
    roleLabel: data?.role_label || '',
    loading,
    error,
    refetch,
  }
}
