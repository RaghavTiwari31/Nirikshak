import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { components } from './schema'

type Schemas = components['schemas']
export type ContractDataset = Schemas['ContractDataset']
export type ContractField = Schemas['ContractField']
export type PreviewOut = Schemas['PreviewOut']
export type SubmissionSummary = Schemas['SubmissionSummary']
export type SubmissionDetail = Schemas['SubmissionDetail']
export type SubmissionPage = Schemas['SubmissionPage']
export type UploadResult = Schemas['UploadResult']
export type EntityOut = Schemas['EntityOut']

/** Shape of one dataset inside a submission's dq_report (see app/ingestion/validate.py). */
export interface DatasetReport {
  dataset: string
  rows_received: number
  rows_accepted: number
  rows_rejected: number
  errors: Record<string, number>
  warnings: Record<string, number>
  samples: { record: number; level: 'error' | 'warning'; issue: string }[]
  null_rates: Record<string, number>
  time_range: { min?: string | null; max?: string | null }
  fatal: string | null
}

export const useContract = () =>
  useQuery({
    queryKey: ['contract'],
    queryFn: () => api<ContractDataset[]>('/ingest/contract'),
    staleTime: Infinity,
  })

export const useEntities = () =>
  useQuery({ queryKey: ['entities'], queryFn: () => api<EntityOut[]>('/entities') })

export const useSubmissions = (params: { entity?: string; status?: string; offset: number }) =>
  useQuery({
    queryKey: ['submissions', params],
    queryFn: () => {
      const q = new URLSearchParams({ limit: '25', offset: String(params.offset) })
      if (params.entity) q.set('entity_code', params.entity)
      if (params.status) q.set('status', params.status)
      return api<SubmissionPage>(`/submissions?${q}`)
    },
    placeholderData: (prev) => prev,
  })

export const useSubmission = (id: number | null) =>
  useQuery({
    queryKey: ['submission', id],
    queryFn: () => api<SubmissionDetail>(`/submissions/${id}`),
    enabled: id !== null,
  })

export const usePreview = () =>
  useMutation({
    mutationFn: ({ file, dataset }: { file: File; dataset: string }) => {
      const body = new FormData()
      body.set('file', file)
      body.set('dataset', dataset)
      return api<PreviewOut>('/ingest/preview', { method: 'POST', body })
    },
  })

export interface UploadInput {
  file: File
  dataset: string
  mapping: Record<string, string>
  entityCode?: string
  periodStart?: string
  periodEnd?: string
  timezone: string
  saveMappingAs?: string
}

export const useUpload = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: UploadInput) => {
      const body = new FormData()
      body.set('file', input.file)
      body.set('dataset', input.dataset)
      body.set('mapping', JSON.stringify(input.mapping))
      body.set('timezone', input.timezone)
      if (input.entityCode) body.set('entity_code', input.entityCode)
      if (input.periodStart) body.set('period_start', input.periodStart)
      if (input.periodEnd) body.set('period_end', input.periodEnd)
      if (input.saveMappingAs) body.set('save_mapping_as', input.saveMappingAs)
      return api<UploadResult>('/ingest/upload', { method: 'POST', body })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions'] })
      void qc.invalidateQueries({ queryKey: ['entities'] })
    },
  })
}
