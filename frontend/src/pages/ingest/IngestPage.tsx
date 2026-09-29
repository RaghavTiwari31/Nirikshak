import { ShieldCheck } from 'lucide-react'
import { Page, PageHeader } from '@/components/supervise'
import { Tooltip } from '@/components/Tooltip'
import { GLOSSARY } from '@/lib/glossary'
import { ContractPanel } from './ContractPanel'
import { SubmissionHistory } from './SubmissionHistory'
import { UploadWizard } from './UploadWizard'

export function IngestPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Operate"
        title="Upload Data"
        action={
          <Tooltip content={GLOSSARY.pseudonymised}>
            <p
              tabIndex={0}
              className="flex cursor-help items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] text-ink-2 shadow-card"
            >
              <ShieldCheck size={16} className="text-ok" /> Real names are hidden on arrival
            </p>
          </Tooltip>
        }
      >
        Add the files each entity sends every month: alerts, cases, escalations and lists of machines. Every file is
        checked before it is used, and you get a quality report straight away.
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <UploadWizard />
        <ContractPanel />
      </div>
      <SubmissionHistory />
    </Page>
  )
}
