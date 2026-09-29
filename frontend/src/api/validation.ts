import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from './client'
import type { components } from './schema'

type S = components['schemas']
export type ValidationSummary = S['ValidationSummary']
export type SignalValidation = S['SignalValidation']
export type RobustnessRow = S['RobustnessRow']
export type FieldValidation = S['FieldValidation']

export const useValidationSummary = () =>
  useQuery({
    queryKey: ['validation', 'summary'],
    queryFn: () => api<ValidationSummary>('/validation/summary'),
    // 404 means "no planted truth in this dataset": show the empty state, don't retry.
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1,
  })

export const useRobustness = () =>
  useQuery({ queryKey: ['validation', 'robustness'], queryFn: () => api<RobustnessRow[]>('/validation/robustness') })

export const useFieldValidation = () =>
  useQuery({
    queryKey: ['validation', 'field'],
    queryFn: () => api<FieldValidation>('/validation/field'),
    retry: false,
  })
