import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  ScanSearch,
  ShieldCheck,
  TrendingUp,
  Upload,
} from 'lucide-react'

export interface NavRoute {
  path: string
  label: string
  icon: LucideIcon
  description: string
  phase: string
  group: 'Supervise' | 'Analyse' | 'Operate'
}

export const NAV_ROUTES: NavRoute[] = [
  {
    path: '/overview',
    label: 'Overview',
    icon: LayoutDashboard,
    description: 'Start here: which entities need attention first, and why.',
    phase: 'Phase 4',
    group: 'Supervise',
  },
  {
    path: '/entities',
    label: 'Entities',
    icon: Building2,
    description: 'Every entity with its attention score and weakest area.',
    phase: 'Phase 4',
    group: 'Supervise',
  },
  {
    path: '/review',
    label: 'Review Queue',
    icon: ClipboardCheck,
    description: 'Records picked for a person to check, entity by entity.',
    phase: 'Phase 4',
    group: 'Supervise',
  },
  {
    path: '/negative-space',
    label: 'Missing Evidence',
    icon: ScanSearch,
    description: 'Evidence that should exist but is missing.',
    phase: 'Phase 4',
    group: 'Analyse',
  },
  {
    path: '/benchmarks',
    label: 'Compare Entities',
    icon: BarChart3,
    description: 'Compare entities side by side on any measure.',
    phase: 'Phase 4',
    group: 'Analyse',
  },
  {
    path: '/trends',
    label: 'Trends',
    icon: TrendingUp,
    description: 'Month-by-month changes, and teams getting worse.',
    phase: 'Phase 4',
    group: 'Analyse',
  },
  {
    path: '/validation',
    label: 'Accuracy',
    icon: FlaskConical,
    description: 'How well the tool performs on test data with known answers.',
    phase: 'Phase 5',
    group: 'Analyse',
  },
  {
    path: '/ingest',
    label: 'Upload Data',
    icon: Upload,
    description: 'Upload the files entities send, and check their quality.',
    phase: 'Phase 1',
    group: 'Operate',
  },
  {
    path: '/signals',
    label: 'How Checks Work',
    icon: BookOpen,
    description: 'Every check the tool runs, in plain words.',
    phase: 'Phase 2',
    group: 'Operate',
  },
  {
    path: '/audit',
    label: 'Activity Log',
    icon: ShieldCheck,
    description: 'Analysis history and the tamper-evident activity log.',
    phase: 'Phase 2',
    group: 'Operate',
  },
]
