/**
 * Plain-language explanations of Nirikshak terms, shown in tooltips across the app. Written
 * for someone opening the tool for the first time: what it is, then how to read it.
 */
export const GLOSSARY = {
  attention:
    'Attention score (0–100): how urgently a supervisor should look at this entity. More serious and more certain findings push it up. 75+ Priority · 50–74 Attention · 25–49 Watch · below 25 Routine.',
  capability:
    'Capability score (0–100): how healthy one area of the security team looks, for example escalation or investigation. 100 means no concerns were found; each finding in that area lowers it.',
  finding:
    'Something the evidence suggests is wrong, together with the records behind it. A finding is a lead for a supervisor to check, not a final verdict.',
  confidence:
    'How sure the tool is about a finding. It rises the further the entity is past the threshold and the more records support it.',
  severity:
    'How serious the issue would be if confirmed: Low, Medium, High or Critical.',
  peers: 'The other entities in this assessment. Each entity is compared with them.',
  peerMedian:
    'The typical value among the other entities: half of them are above it and half below.',
  unusual:
    'How far this is from typical, measured against how much entities normally differ. 3 or more means clearly unusual; the tool requires at least that before it raises most findings.',
  percentile: 'The share of other entities with a lower value.',
  executionGap:
    'The entity says it does something (for example, round-the-clock monitoring or fixing critical issues within 4 hours), but its own records show otherwise.',
  negativeSpace:
    'Evidence that should exist but is missing, for example critical servers that never raised a single alert. Missing evidence usually means something is not being watched.',
  expected:
    'How many alerts similar equipment at other entities produces, scaled to this entity’s own equipment and the length of the period.',
  hole: 'A place where other entities would expect at least 20 alerts, but this entity reported none.',
  reviewPack:
    'Thirty of the entity’s records picked for a person to check. About 80% are linked to findings; about 20% are picked at random for comparison.',
  control:
    'Records picked completely at random. Comparing how often problems are confirmed here versus in the directed records shows how much better than random the tool is.',
  run: 'One analysis pass over every entity for a chosen period. Each run is recorded and can be repeated with the same result.',
  fingerprint:
    'A unique code for the exact rules and thresholds used. It lets anyone trace a result back to the settings that produced it.',
  auditChain:
    'A tamper-evident log of every action. Each entry is sealed together with the one before it, so any edit or deletion is detected.',
  trend:
    'Compares the entity’s recent months with its own earlier months, to catch a team that is getting steadily worse.',
  anomaly:
    'Behaviour unlike other entities that none of the tool’s rules explain. Treated as a lead worth a look, not a conclusion.',
  precision: 'Of the entities the tool flagged for a problem, the share that really had it.',
  recall: 'Of the entities that really had a problem, the share the tool found.',
  ndcg: 'Ranking quality from 0 to 1: how closely the tool’s order matches an expert’s order of seriousness. 1 is a perfect match.',
  yield:
    'If a supervisor works down the list, how quickly they reach the entities with real problems, compared with working in random order.',
  holdout:
    'A problem planted in the test data for which no rule was written, to test whether the tool can spot things nobody anticipated.',
  plantedTruth:
    'Test data where weaknesses were planted on purpose and recorded, so the tool’s results can be checked against known answers.',
  pseudonymised:
    'Names of machines, users and analysts are replaced with codes on arrival, so the real names are never stored.',
  dataQuality:
    'Checks run on every upload: required fields present, values valid, dates inside the period, no duplicates.',
  declared:
    'What the entity says about itself, such as its promised response times or round-the-clock cover. The tool tests these claims against the records.',
} as const

export type GlossaryKey = keyof typeof GLOSSARY
