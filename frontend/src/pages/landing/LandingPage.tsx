import clsx from 'clsx'
import {
  ArrowRight,
  Check,
  Plus,
  EyeOff,
  FileSearch,
  Fingerprint,
  Gauge,
  ListOrdered,
  Lock,
  ScanSearch,
  ServerOff,
  Sparkles,
} from 'lucide-react'
import {
  AnimatePresence,
  motion,
  MotionConfig,
  useInView,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { getHealth } from '@/api/client'
import { BrandMark } from '@/components/BrandMark'
import { RadarField } from '@/components/effects/RadarField'
import BlurText from '@/components/reactbits/BlurText'
import CountUp from '@/components/reactbits/CountUp'
import Magnet from '@/components/reactbits/Magnet'
import ShinyText from '@/components/reactbits/ShinyText'
import SpotlightCard from '@/components/reactbits/SpotlightCard'
import { useAuth } from '@/store/auth'
import { CompareSlider } from './CompareSlider'
import { HowItWorks } from './HowItWorks'
import { RotatingPill } from './RotatingPill'
import {
  ArcGauge,
  DeadlineBars,
  DotTally,
  EffortBars,
  HashChain,
  MiniMatrix,
  MiniQueue,
  OutlierDots,
  PeerStripMini,
  StopwatchDial,
} from './visuals'

const NAV = [
  ['Features', '#features'],
  ['How it works', '#how'],
  ['Results', '#results'],
  ['Security', '#security'],
  ['FAQ', '#faq'],
] as const

const SECTORS = [
  'Power & energy',
  'Banking & finance',
  'Telecom',
  'Transport',
  'Government',
  'Strategic & public',
  'Healthcare',
  'Industrial control',
]

const SCREENS = [
  {
    key: 'overview',
    label: 'Overview',
    src: '/landing/overview.webp',
    caption: 'Where to look first: every entity ranked by attention, with the reasons one click away.',
  },
  {
    key: 'missing',
    label: 'Missing evidence',
    src: '/landing/missing.webp',
    caption: 'Evidence that should exist but doesn’t, coloured by how much is missing.',
  },
  {
    key: 'evidence',
    label: 'Evidence trail',
    src: '/landing/evidence.webp',
    caption: 'Every finding with its rule, its peer comparison and the records behind it.',
  },
  {
    key: 'review',
    label: 'Review queue',
    src: '/landing/review.webp',
    caption: 'Records picked for a person to check, with a random control to keep the tool honest.',
  },
  {
    key: 'accuracy',
    label: 'Accuracy',
    src: '/landing/accuracy.webp',
    caption: 'Measured against known answers, including a problem no rule was written for.',
  },
] as const

const FAQ = [
  [
    'What data does Nirikshak look at?',
    'The metadata entities already submit: alerts, cases, escalations, lists of machines and daily log volumes. It never needs raw logs, network traffic or personal data, and machine and analyst names are replaced with codes the moment they arrive.',
  ],
  [
    'Does it decide whether an entity is compliant?',
    'No. It raises leads, each with the rule that fired, how the entity compares with its peers and the records behind it. A supervisor accepts or rejects every finding, and every decision is written to a tamper-evident log.',
  ],
  [
    'Can it run without the internet?',
    'Yes. It ships as a checksummed offline bundle of three containers on an internal network with no route out. There is no cloud service, no hosted model and no language model anywhere in it.',
  ],
  [
    'How do we know it works?',
    'It was tested on data with weaknesses planted on purpose: it found all 20 weakened entities, wrongly flagged none of the 20 healthy ones, and held up on fresh data it was never tuned on. In real use, every review pack includes randomly picked records, so its hit rate is measured against chance.',
  ],
  [
    'How heavy is it to run?',
    'A full analysis of 40 entities over 12 months takes about 39 seconds on a single CPU core with under 300 MB of memory. A pilot needs one modest server; no GPU.',
  ],
  [
    'Is the demo data real?',
    'No. The live demo uses synthetic entities (marked “synthetic”) with planted weaknesses, so you can explore every screen safely.',
  ],
] as const

export function LandingPage() {
  const token = useAuth((s) => s.token)
  const scroller = useRef<HTMLDivElement>(null)
  const heroShot = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)

  const { scrollY, scrollYProgress: pageProgress } = useScroll({ container: scroller })
  const progress = useSpring(pageProgress, { stiffness: 200, damping: 40, restDelta: 0.001 })
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12))

  // The product shot starts tilted back and settles flat as it scrolls into view.
  const { scrollYProgress } = useScroll({ container: scroller, target: heroShot, offset: ['start end', 'start 0.25'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [16, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1])

  // Wake the API (the free host sleeps when idle) while the visitor reads.
  useEffect(() => {
    getHealth().catch(() => undefined)
    document.title = 'Nirikshak · See which security teams need a closer look'
    return () => {
      document.title = 'Nirikshak'
    }
  }, [])

  const primary = token
    ? { to: '/overview', label: 'Open the dashboard' }
    : { to: '/login', label: 'Try the live demo' }

  return (
    <MotionConfig reducedMotion="user">
      <div ref={scroller} className="h-full overflow-x-hidden overflow-y-auto scroll-smooth bg-bg text-ink">
        {/* ── Navigation ───────────────────────────────────────────── */}
        <header
          className={clsx(
            'sticky top-0 z-50 transition-all duration-300',
            scrolled ? 'border-b border-line bg-bg/80 backdrop-blur-md' : 'border-b border-transparent',
          )}
        >
          <nav
            className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-6 lg:px-10"
            aria-label="Main"
          >
            <a href="#top" className="flex items-center gap-2.5">
              <BrandMark size={34} />
              <span className="text-lg font-semibold tracking-tight">Nirikshak</span>
            </a>
            <div className="hidden items-center gap-8 text-sm text-ink-2 md:flex">
              {NAV.map(([label, href]) => (
                <a key={href} href={href} className="transition-colors hover:text-ink">
                  {label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!token && (
                <Link
                  to="/login"
                  className="hidden rounded-xl px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:text-ink sm:block"
                >
                  Sign in
                </Link>
              )}
              <Link
                to={primary.to}
                className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-ink-2"
              >
                {primary.label} <ArrowRight size={15} />
              </Link>
            </div>
          </nav>
          <motion.div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-[-1px] h-0.5 origin-left bg-accent"
            style={{ scaleX: progress, opacity: scrolled ? 1 : 0 }}
          />
        </header>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section id="top" className="relative -mt-18 overflow-hidden pt-36 pb-10 sm:pt-44">
          <HeroBackdrop />
          <div className="relative mx-auto max-w-5xl px-6 text-center">
            <motion.a
              href="#results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/80 py-1.5 pr-3.5 pl-1.5 text-[13px] shadow-card backdrop-blur"
            >
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">New</span>
              <ShinyText
                text="Found 20 of 20 weakened entities in testing"
                color="#3d434b"
                shineColor="#d98a06"
                speed={3}
                delay={1.5}
                className="font-medium"
              />
              <ArrowRight size={14} className="text-muted" />
            </motion.a>

            <h1 className="mt-8 text-[clamp(2.5rem,6.2vw,4.75rem)] leading-[1.04] font-semibold tracking-[-0.035em]">
              <BlurText
                text="See which security teams"
                delay={90}
                animateBy="words"
                direction="bottom"
                className="justify-center"
              />
              <span className="mt-2 block">
                <RotatingPill
                  texts={[
                    'need a closer look.',
                    'hide missing evidence.',
                    'miss their own deadlines.',
                    'are quietly slipping.',
                  ]}
                />
              </span>
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mx-auto mt-8 max-w-2xl text-[17px] leading-relaxed text-ink-2 sm:text-lg"
            >
              Nirikshak reads the records critical-sector entities already submit, finds where their claims and their
              evidence disagree, and shows supervisors exactly where to look first, and why.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              <Magnet padding={60} magnetStrength={6}>
                <Link
                  to={primary.to}
                  className="inline-flex items-center gap-2 rounded-2xl bg-ink px-6 py-3.5 text-[15px] font-semibold text-white shadow-pop transition-colors hover:bg-ink-2"
                >
                  {primary.label} <ArrowRight size={17} />
                </Link>
              </Magnet>
              <a
                href="#how"
                className="inline-flex items-center gap-2 rounded-2xl border border-line-strong bg-surface/80 px-6 py-3.5 text-[15px] font-semibold text-ink backdrop-blur transition-colors hover:bg-surface"
              >
                See how it works
              </a>
            </motion.div>
            <motion.ul
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-muted"
            >
              {['Runs fully offline', 'No language models', 'Every finding traceable'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={14} className="text-accent-ink" /> {t}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Product shot */}
          <div className="relative mx-auto mt-16 max-w-6xl px-6 [perspective:1600px] sm:mt-20">
            <motion.div ref={heroShot} style={{ rotateX, scale }} className="relative origin-top">
              <BrowserFrame>
                <img
                  src="/landing/overview.webp"
                  alt="Nirikshak overview: key figures and the entity map"
                  width={2880}
                  height={1800}
                  fetchPriority="high"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </BrowserFrame>
              <Callout className="-left-3 top-[30%] hidden lg:flex" delay={0.2} tone="var(--sev-critical)">
                264 closures just before the deadline
              </Callout>
              <Callout className="-right-3 top-[52%] hidden lg:flex" delay={0.45} tone="var(--health-bad)" float>
                25 critical machines never alerted
              </Callout>
              <Callout className="bottom-[14%] left-[8%] hidden md:flex" delay={0.7} tone="var(--ok)">
                Every finding traced to its records
              </Callout>
            </motion.div>
          </div>
        </section>

        {/* ── Sector ticker ────────────────────────────────────────── */}
        <section className="py-14" aria-label="Sectors">
          <p className="text-center text-[13px] font-medium tracking-wide text-muted uppercase">
            Built for supervising the sectors a country runs on
          </p>
          <div className="marquee-pause relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <ul className="animate-marquee flex w-max gap-4">
              {[...SECTORS, ...SECTORS].map((s, i) => (
                <li
                  key={`${s}-${i}`}
                  aria-hidden={i >= SECTORS.length}
                  className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-medium whitespace-nowrap text-ink-2"
                >
                  <span className="size-1.5 rounded-full bg-accent" /> {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The problem ──────────────────────────────────────────── */}
        <Section id="problem" eyebrow="The problem" title="The KPIs said fine. The evidence didn’t.">
          Supervisors find the real problems by reading samples of alerts and cases by hand. It works, but it can’t keep
          up with dozens of entities and hundreds of thousands of records a year.
          <CompareSlider />
        </Section>

        {/* ── Features ─────────────────────────────────────────────── */}
        <Section id="features" eyebrow="What it finds" title="Five ways a security team can look fine and not be.">
          Twenty-two checks, each explainable in a sentence and traceable to the records that triggered it.
          <div className="mt-14 grid gap-5 text-left md:grid-cols-2 lg:grid-cols-3">
            <Feature
              className="lg:col-span-2"
              icon={<FileSearch size={19} />}
              title="Claims tested against records"
              body="Promised fix times, round-the-clock cover and escalation rules, checked against what the alerts actually show. Like 264 closures landing just before the deadline, and only 4 just after."
            >
              <DeadlineBars />
            </Feature>
            <Feature
              icon={<ScanSearch size={19} />}
              title="Missing evidence"
              body="From similar entities, Nirikshak learns what alerts each kind of machine should raise. Silence where there should be noise shows up as a hole."
            >
              <MiniMatrix />
            </Feature>
            <Feature
              icon={<ListOrdered size={19} />}
              title="A priority queue, not a pile"
              body="One attention score per entity, built from how serious and how certain each finding is."
            >
              <MiniQueue />
            </Feature>
            <Feature
              className="lg:col-span-2"
              icon={<Gauge size={19} />}
              title="Findings you can defend"
              body="Every finding shows the rule that fired, where the entity sits among its peers, and the exact records behind it. Supervisors accept or reject; nothing is decided for them."
            >
              <PeerStripMini />
            </Feature>
            <Feature
              className="lg:col-span-2"
              icon={<Sparkles size={19} />}
              title="Problems nobody wrote a rule for"
              body="An anomaly model looks only at behaviour the rules don’t already explain, and says which behaviours make an entity unusual. In testing it found a planted weakness with no rule at all."
            >
              <OutlierDots />
            </Feature>
            <Feature
              icon={<Fingerprint size={19} />}
              title="A log that can’t be edited quietly"
              body="Every sign-in, upload, analysis and decision is sealed to the one before it, so tampering shows."
            >
              <HashChain />
            </Feature>
          </div>
        </Section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <Section id="how" eyebrow="How it works" title="From monthly files to a defensible review, in four steps.">
          <HowItWorks />
        </Section>

        {/* ── Results (dark band) ──────────────────────────────────── */}
        <section id="results" className="relative scroll-mt-20 overflow-hidden bg-ink py-24 text-white sm:py-28">
          <RadarField
            tone="dark"
            origin={{ x: 0.88, y: 0.12 }}
            spacing={72}
            className="[mask-image:linear-gradient(to_bottom,black_30%,transparent_90%)]"
          />
          <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold tracking-[0.16em] text-accent uppercase">Results</p>
              <h2 className="mt-4 text-[clamp(2rem,4vw,3rem)] leading-tight font-semibold tracking-tight">
                Tested against known answers, not asserted.
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-white/70">
                Test data with weaknesses planted on purpose, so every result can be checked. The settings were then
                frozen and the test repeated on fresh data.
              </p>
            </div>
            <dl className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              <Stat
                value={
                  <>
                    <CountUp to={20} duration={1.4} />
                    /20
                  </>
                }
                label="Weakened entities found"
                visual={<DotTally lit={20} total={20} />}
              />
              <Stat
                value={
                  <>
                    0<span className="text-white/40">/20</span>
                  </>
                }
                label="Healthy entities wrongly flagged"
                visual={<DotTally lit={0} total={20} />}
              />
              <Stat
                value={
                  <>
                    <CountUp to={2} duration={1.2} />× less
                  </>
                }
                label="Review effort to reach 80% of the problems"
                visual={<EffortBars />}
              />
              <Stat
                value={<CountUp to={0.93} duration={1.6} />}
                label="Match with the expert ranking (1.00 is perfect)"
                visual={<ArcGauge value={0.93} />}
              />
              <Stat
                value={
                  <>
                    <CountUp to={60} duration={1.6} />
                    /60
                  </>
                }
                label="Found at three times the scale, with no false alarms"
                visual={<DotTally lit={60} total={60} cols={20} />}
              />
              <Stat
                value={
                  <>
                    <CountUp to={39} duration={1.4} /> s
                  </>
                }
                label="Full analysis of 40 entities on a single CPU core"
                visual={<StopwatchDial seconds={39} />}
              />
            </dl>
            <p className="mt-6 text-[13px] text-white/45">
              Synthetic test data with planted weaknesses. Real-world accuracy is measured in use through random control
              samples.
            </p>
          </div>
        </section>

        {/* ── Product tour ─────────────────────────────────────────── */}
        <Section id="product" eyebrow="The product" title="Built for the way supervisors actually work.">
          <ProductTour />
        </Section>

        {/* ── Security ─────────────────────────────────────────────── */}
        <Section id="security" eyebrow="Security" title="Designed for networks with no way out.">
          <div className="mt-14 grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                ServerOff,
                'Air-gapped by design',
                'Ships as a checksummed offline bundle. The database and engine sit on a network with no route to the internet.',
              ],
              [
                EyeOff,
                'Names hidden on arrival',
                'Machine, user and analyst names are replaced with codes as files arrive. Real names are never stored.',
              ],
              [
                Lock,
                'No black boxes',
                'No language model and no cloud AI. Explainable statistics and one small anomaly model, all on a CPU.',
              ],
              [
                Fingerprint,
                'Nothing changes quietly',
                'Every action is sealed into a tamper-evident log that anyone can re-check in one click.',
              ],
            ].map(([Icon, title, body], i) => {
              const I = Icon as typeof Lock
              return (
                <Reveal key={title as string} delay={i * 0.06}>
                  <div className="h-full rounded-3xl border border-line bg-surface p-7">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft">
                      <I size={19} className="text-accent-ink" />
                    </span>
                    <p className="mt-5 text-[17px] font-semibold">{title as string}</p>
                    <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body as string}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </Section>

        {/* ── FAQ ──────────────────────────────────────────────────── */}
        <Section id="faq" eyebrow="FAQ" title="Questions supervisors ask first.">
          <Faq />
        </Section>

        {/* ── Final call to action ─────────────────────────────────── */}
        <section className="px-6 pb-24 lg:px-10">
          <Reveal>
            <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-ink px-8 py-20 text-center text-white sm:px-16">
              <RadarField
                tone="dark"
                origin={{ x: 0.5, y: 0.5 }}
                spacing={60}
                className="[mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_75%)]"
              />
              <div className="relative">
                <h2 className="mx-auto max-w-3xl text-[clamp(2rem,4.5vw,3.25rem)] leading-tight font-semibold tracking-tight">
                  Point your supervisors at the problems that matter.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[17px] text-white/70">
                  Explore the live demo with synthetic data. No setup, nothing to install.
                </p>
                <div className="mt-10 flex flex-wrap justify-center gap-3">
                  <Link
                    to={primary.to}
                    className="inline-flex items-center gap-2 rounded-2xl bg-accent px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:brightness-105"
                  >
                    {primary.label} <ArrowRight size={17} />
                  </Link>
                  <a
                    href="#features"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
                  >
                    See what it finds
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-10 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between lg:px-10">
            <div className="flex items-center gap-2.5">
              <BrandMark size={26} />
              <span className="font-semibold text-ink">Nirikshak</span>
              <span>· Supervisory analytics for SOC assessment</span>
            </div>
            <p>SIH 2026 · NCIIPC problem statement · Demo uses synthetic data</p>
          </div>
        </footer>
      </div>
    </MotionConfig>
  )
}

/* ─────────────────────────────────────────────────────────── helpers */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children: ReactNode
}) {
  const [lead, ...rest] = Array.isArray(children) ? children : [children]
  const hasLead = typeof lead === 'string'
  return (
    <section id={id} className="scroll-mt-20 px-6 py-24 text-center sm:py-28 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <Reveal blur>
          <p className="text-sm font-semibold tracking-[0.16em] text-accent-ink uppercase">{eyebrow}</p>
          <h2 className="mx-auto mt-4 max-w-3xl text-[clamp(2rem,4vw,3rem)] leading-tight font-semibold tracking-tight">
            {title}
          </h2>
          {hasLead && <p className="mx-auto mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">{lead}</p>}
        </Reveal>
        {hasLead ? rest : children}
      </div>
    </section>
  )
}

/** Fade and rise into view once, when scrolled to. */
function Reveal({ children, delay = 0, blur = false }: { children: ReactNode; delay?: number; blur?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, ...(blur && { filter: 'blur(10px)' }) }}
      whileInView={{ opacity: 1, y: 0, ...(blur && { filter: 'blur(0px)' }) }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0, 0, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  )
}

function Feature({
  icon,
  title,
  body,
  className,
  children,
}: {
  icon: ReactNode
  title: string
  body: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={className}>
      <Reveal>
        <SpotlightCard className="h-full p-7 transition-shadow duration-300 hover:shadow-pop">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
            {icon}
          </span>
          <p className="mt-5 text-[17px] font-semibold">{title}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
          {children}
        </SpotlightCard>
      </Reveal>
    </div>
  )
}

function Stat({ value, label, visual }: { value: ReactNode; label: string; visual: ReactNode }) {
  return (
    <div className="group flex flex-col bg-ink p-8 transition-colors duration-300 hover:bg-[#262b31] sm:p-10">
      <dd className="num text-5xl font-semibold tracking-tight text-white">{value}</dd>
      <dt className="mt-3 text-[15px] leading-relaxed text-white/60">{label}</dt>
      <div className="mt-auto flex min-h-14 items-end pt-7">{visual}</div>
    </div>
  )
}

function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[0_40px_100px_-30px_rgb(31_35_40/0.35)] sm:rounded-3xl">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2/70 px-4 py-3">
        <span className="size-3 rounded-full bg-line-strong" />
        <span className="size-3 rounded-full bg-line-strong" />
        <span className="size-3 rounded-full bg-line-strong" />
        <span className="mx-auto hidden rounded-lg bg-surface px-10 py-1 text-xs text-muted sm:block">
          nirikshak.app/overview
        </span>
      </div>
      {children}
    </div>
  )
}

function Callout({
  children,
  className,
  delay,
  tone,
  float = false,
}: {
  children: ReactNode
  className?: string
  delay: number
  tone: string
  float?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay: 0.4 + delay, ease: [0.2, 0, 0, 1] }}
      className={clsx('absolute z-10', className)}
    >
      <div
        className={clsx(
          'flex items-center gap-2.5 rounded-2xl border border-line bg-surface/95 px-4 py-3 text-[13px] font-medium shadow-pop backdrop-blur',
          float && 'animate-float',
        )}
      >
        <span className="size-2.5 rounded-full" style={{ background: tone }} />
        {children}
      </div>
    </motion.div>
  )
}

function ProductTour() {
  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const inView = useInView(box, { margin: '-20% 0px' })
  const reduced = useReducedMotion()
  // Autoplay: the bar under the active tab fills over six seconds, then the next screen opens.
  // It pauses while the pointer is over the tour or the tour is off screen.
  const playing = inView && !hovered
  const screen = SCREENS[active] ?? SCREENS[0]
  const next = () => setActive((i) => (i + 1) % SCREENS.length)

  return (
    <div ref={box} className="mt-12" onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <div
        className="mx-auto flex max-w-fit flex-wrap justify-center gap-1 rounded-2xl border border-line bg-surface-2/70 p-1.5"
        role="tablist"
        aria-label="Product screens"
      >
        {SCREENS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={clsx(
              'relative overflow-hidden rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              active === i ? 'text-white' : 'text-ink-2 hover:text-ink',
            )}
          >
            {active === i && (
              <motion.span
                layoutId="tour-tab"
                className="absolute inset-0 rounded-xl bg-ink shadow-sm"
                transition={{ type: 'spring', stiffness: 400, damping: 34 }}
              />
            )}
            <span className="relative">{s.label}</span>
            {active === i && !reduced && (
              <span
                key={`progress-${i}`}
                aria-hidden="true"
                className="animate-tour-progress absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-accent"
                style={{ animationPlayState: playing ? 'running' : 'paused' }}
                onAnimationEnd={next}
              />
            )}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={screen.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="mx-auto mt-6 max-w-xl text-[15px] text-ink-2"
        >
          {screen.caption}
        </motion.p>
      </AnimatePresence>
      <div className="mx-auto mt-10 max-w-6xl">
        <BrowserFrame>
          <div className="relative aspect-[16/10] overflow-hidden bg-surface">
            <AnimatePresence initial={false}>
              <motion.img
                key={screen.key}
                src={screen.src}
                alt={`Nirikshak ${screen.label.toLowerCase()} screen`}
                width={2880}
                height={1800}
                loading="lazy"
                decoding="async"
                initial={{ opacity: 0, scale: 1.04, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: [0.2, 0, 0, 1] }}
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            </AnimatePresence>
          </div>
        </BrowserFrame>
      </div>
    </div>
  )
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="mx-auto mt-12 max-w-3xl divide-y divide-line rounded-3xl border border-line bg-surface text-left">
      {FAQ.map(([q, a], i) => {
        const isOpen = open === i
        return (
          <div key={q} className="px-7">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-6 py-5 text-left text-[16px] font-semibold"
            >
              {q}
              <motion.span
                animate={{ rotate: isOpen ? 45 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                className={clsx(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                  isOpen ? 'border-ink bg-ink text-white' : 'border-line-strong text-muted',
                )}
              >
                <Plus size={15} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
                  className="overflow-hidden"
                >
                  <p className="pb-5 text-[15px] leading-relaxed text-ink-2">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

/** The supervisory radar sweeping behind the hero, under a warm glow. */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <RadarField
        tone="light"
        origin={{ x: 0.5, y: 0.2 }}
        className="[mask-image:radial-gradient(ellipse_75%_70%_at_50%_28%,black_35%,transparent)]"
      />
      <div className="animate-drift absolute top-[-10%] left-1/2 h-[520px] w-[900px] rounded-full bg-[radial-gradient(closest-side,rgb(217_138_6/0.2),transparent)] blur-2xl" />
    </div>
  )
}
