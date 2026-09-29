export const SECTOR_LABEL: Record<string, string> = {
  power_energy: 'Power & energy',
  bfsi: 'Banking & finance',
  telecom: 'Telecom',
  transport: 'Transport',
  government: 'Government',
  strategic_public: 'Strategic & public',
}

export const ASSET_LABEL: Record<string, string> = {
  dc: 'Domain controllers',
  server: 'Servers',
  db: 'Databases',
  endpoint: 'Endpoints',
  firewall: 'Firewalls',
  email_gw: 'Email gateways',
  cloud: 'Cloud',
  ot_scada: 'SCADA',
  ot_hmi: 'HMI',
}

/** Plural nouns for running text ("Similar SCADA systems at other entities…"). */
export const ASSET_NOUN: Record<string, string> = {
  dc: 'domain controllers',
  server: 'servers',
  db: 'databases',
  endpoint: 'endpoints',
  firewall: 'firewalls',
  email_gw: 'email gateways',
  cloud: 'cloud workloads',
  ot_scada: 'SCADA systems',
  ot_hmi: 'operator screens (HMIs)',
}
