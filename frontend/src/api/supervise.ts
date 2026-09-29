import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/store/auth'
import { api, ApiError } from './client'
import type { components } from './schema'

type S = components['schemas']
export type ScoreOut = S['ScoreOut']
export type ScorePage = S['ScorePage']
export type EntityProfile = S['EntityProfileOut']
export type FindingOut = S['FindingOut']
export type FindingDetail = S['FindingDetail']
export type EvidencePage = S['EvidencePage']
export type EvidenceRow = S['EvidenceRow']
export type FeedbackOut = S['FeedbackOut']
export type CoverageOverview = S['CoverageOverview']
export type EntityCoverage = S['EntityCoverage']
export type Benchmark = S['Benchmark']
export type Trends = S['Trends']
export type PackSummary = S['PackSummary']
export type PackDetail = S['PackDetail']
export type SampleOut = S['SampleOut']
export type Verdict = S['FeedbackIn']['verdict']
export type Outcome = S['SampleUpdate']['outcome']

export const useScores = () => useQuery({ queryKey: ['scores'], queryFn: () => api<ScorePage>('/scores') })

export const useSignalFindings = (signalId: string) =>
  useQuery({
    queryKey: ['findings', signalId],
    queryFn: () => api<S['FindingPage']>(`/findings?signal_id=${signalId}`),
  })

export const useProfile = (code: string | undefined) =>
  useQuery({
    queryKey: ['profile', code],
    queryFn: () => api<EntityProfile>(`/entities/${code}/profile`),
    enabled: !!code,
  })

export const useFinding = (id: number | null) =>
  useQuery({ queryKey: ['finding', id], queryFn: () => api<FindingDetail>(`/findings/${id}`), enabled: id !== null })

export const useEvidence = (id: number | null, offset: number) =>
  useQuery({
    queryKey: ['evidence', id, offset],
    queryFn: () => api<EvidencePage>(`/findings/${id}/evidence?limit=10&offset=${offset}`),
    enabled: id !== null,
    placeholderData: keepPreviousData,
  })

export const useFeedback = (id: number | null) =>
  useQuery({
    queryKey: ['feedback', id],
    queryFn: () => api<FeedbackOut[]>(`/findings/${id}/feedback`),
    enabled: id !== null,
  })

export const useGiveFeedback = (id: number) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { verdict: Verdict; comment?: string }) =>
      api<FeedbackOut>(`/findings/${id}/feedback`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feedback', id] })
      void qc.invalidateQueries({ queryKey: ['finding', id] })
      void qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export const useCoverage = () =>
  useQuery({ queryKey: ['coverage'], queryFn: () => api<CoverageOverview>('/coverage') })

export const useEntityCoverage = (code: string | null) =>
  useQuery({
    queryKey: ['coverage', code],
    queryFn: () => api<EntityCoverage>(`/coverage/${code}`),
    enabled: !!code,
  })

export const useBenchmark = (feature: string) =>
  useQuery({
    queryKey: ['benchmark', feature],
    queryFn: () => api<Benchmark>(`/benchmarks?feature=${feature}`),
    placeholderData: keepPreviousData,
  })

export const useTrends = (feature: string) =>
  useQuery({
    queryKey: ['trends', feature],
    queryFn: () => api<Trends>(`/trends?feature=${feature}`),
    placeholderData: keepPreviousData,
  })

export const usePacks = () => useQuery({ queryKey: ['packs'], queryFn: () => api<PackSummary[]>('/review/packs') })

export const usePack = (code: string | null) =>
  useQuery({
    queryKey: ['pack', code],
    queryFn: () => api<PackDetail>(`/review/packs/${code}`),
    enabled: !!code,
  })

export const useRecordOutcome = (code: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, outcome }: { id: number; outcome: Outcome }) =>
      api<SampleOut>(`/review/samples/${id}`, { method: 'PATCH', body: JSON.stringify({ outcome }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pack', code] })
      void qc.invalidateQueries({ queryKey: ['packs'] })
    },
  })
}

/** Download a pack as CSV (needs the auth header, so it can't be a plain link). */
export async function downloadPackCsv(code: string): Promise<void> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const token = useAuth.getState().token
  const resp = await fetch(`${base}/api/review/packs/${code}/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!resp.ok) throw new ApiError(resp.status, 'Export failed')
  const url = URL.createObjectURL(await resp.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = `nirikshak_review_${code}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
