import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { components } from './schema'

type Schemas = components['schemas']
export type SignalLibrary = Schemas['SignalLibrary']
export type SignalOut = Schemas['SignalOut']
export type RunOut = Schemas['RunOut']
export type RunDetail = Schemas['RunDetail']
export type EvaluationOut = Schemas['EvaluationOut']
export type AuditPage = Schemas['AuditPage']
export type AuditVerify = Schemas['AuditVerifyResponse']

const ACTIVE = new Set(['queued', 'running'])
export const isActive = (status: string) => ACTIVE.has(status)

export const useSignalLibrary = () =>
  useQuery({ queryKey: ['signals'], queryFn: () => api<SignalLibrary>('/signals'), staleTime: Infinity })

export const useRuns = () =>
  useQuery({
    queryKey: ['runs'],
    queryFn: () => api<RunOut[]>('/runs?limit=20'),
    // Keep polling while any run is in flight so progress updates live.
    refetchInterval: (q) => (q.state.data?.some((r) => isActive(r.status)) ? 2000 : false),
  })

export const useRun = (id: number | null) =>
  useQuery({
    queryKey: ['run', id],
    queryFn: () => api<RunDetail>(`/runs/${id}`),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data && isActive(q.state.data.status) ? 2000 : false),
  })

export const useLatestRun = () => {
  const runs = useRuns()
  const latest = runs.data?.find((r) => r.status === 'succeeded') ?? null
  return useRun(latest?.id ?? null)
}

export const useEvaluation = (id: number | null) =>
  useQuery({
    queryKey: ['evaluation', id],
    queryFn: () => api<EvaluationOut>(`/runs/${id}/evaluation`),
    enabled: id !== null,
    retry: false, // 404 simply means no synthetic ground truth
  })

export const useStartRun = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api<RunOut>('/runs', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['runs'] }),
  })
}

export const useAudit = (offset: number) =>
  useQuery({
    queryKey: ['audit', offset],
    queryFn: () => api<AuditPage>(`/audit?limit=10&offset=${offset}`),
    placeholderData: (prev) => prev,
  })

export const useVerifyAudit = () =>
  useMutation({ mutationFn: () => api<AuditVerify>('/audit/verify') })
