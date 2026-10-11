/**
 * Lead scoring rubric + outreach builder.
 *
 * Pure functions shared by the worker-side agent tools (src/ai/tools.ts) and
 * the client UI ("Score with AI" / "Draft outreach" buttons), so both paths
 * produce identical results. No LLM involved — the rubric is deterministic
 * and explainable, which is the point: every point has a stated reason.
 */

import type { Lead } from '../schemas/leads-schema'

export interface ScoreBreakdown {
  score: number
  reasons: string[]
  signalPoints: number
  seniorityPoints: number
  fitPoints: number
}

export const STAGES = [
  { id: 'new', label: 'New', accent: '#60a5fa' },
  { id: 'contacted', label: 'Contacted', accent: '#c084fc' },
  { id: 'qualified', label: 'Qualified', accent: '#fbbf24' },
  { id: 'meeting', label: 'Meeting', accent: '#34d399' },
  { id: 'closed_won', label: 'Closed Won', accent: '#22d3ee' },
  { id: 'closed_lost', label: 'Closed Lost', accent: '#64748b' },
] as const

export const SIGNAL_SOURCE_LABELS: Record<string, string> = {
  funding_news: 'Funding news',
  job_posting: 'Job posting',
  website_visit: 'Website visit',
  trade_show: 'Trade show',
  tech_change: 'Tech change',
  content_engagement: 'Content engagement',
  cold: 'Cold',
}

const FIT_INDUSTRIES = [
  'industrial',
  'manufacturing',
  'logistics',
  'automation',
  'automotive',
  'food',
  'beverage',
  'packaging',
  'warehouse',
  'supply chain',
  'material handling',
]

function signalPoints(lead: Lead): { points: number; reason: string } {
  const source = (lead.signalSource ?? '').toLowerCase()
  const text = `${lead.signals ?? ''}`.toLowerCase()

  // Explicit source mapping first.
  if (source === 'funding_news' || /series [a-e]|raised \$|funding round|acqui(red|sition)/.test(text)) {
    return { points: 38, reason: 'Strong buying signal: fresh funding or acquisition activity (38/40)' }
  }
  if (source === 'tech_change' || /rip and replace|migrat|evaluating vendors|legacy|moderniz/.test(text)) {
    return { points: 36, reason: 'Active tech evaluation or legacy replacement in motion (36/40)' }
  }
  if (source === 'job_posting' || /hiring|job posting|open role|headcount/.test(text)) {
    return { points: 35, reason: 'Hiring for automation/engineering roles — budget exists (35/40)' }
  }
  if (source === 'trade_show') {
    return { points: 30, reason: 'Met at trade show — warm, intent-adjacent (30/40)' }
  }
  if (source === 'website_visit') {
    return { points: 26, reason: 'Website visit — early intent, unqualified (26/40)' }
  }
  if (source === 'content_engagement') {
    return { points: 22, reason: 'Content engagement — awareness stage (22/40)' }
  }
  return { points: 10, reason: 'Cold — no observable buying signal (10/40)' }
}

function seniorityPoints(lead: Lead): { points: number; reason: string } {
  const title = (lead.contactTitle ?? '').toLowerCase()
  if (/\b(ceo|cto|cfo|coo|cio|cmo|chief|founder|co-founder|president|owner)\b/.test(title)) {
    return { points: 28, reason: `Economic buyer: "${lead.contactTitle}" (28/30)` }
  }
  if (/\b(svp|evp|vp|vice president|head of|director)\b/.test(title)) {
    const pts = title.includes('director') ? 21 : 26
    return { points: pts, reason: `Decision influencer: "${lead.contactTitle}" (${pts}/30)` }
  }
  if (/\b(manager|lead|supervisor|engineer|specialist|analyst)\b/.test(title)) {
    return { points: 14, reason: `Champion-level contact: "${lead.contactTitle}" (14/30)` }
  }
  return { points: 7, reason: 'Contact seniority unknown or non-decision role (7/30)' }
}

function fitPoints(lead: Lead): { points: number; reason: string } {
  const industry = (lead.industry ?? '').toLowerCase()
  const sizeText = (lead.companySize ?? '').toLowerCase()
  const industryFit = FIT_INDUSTRIES.some((k) => industry.includes(k))

  // Parse a headcount number out of free text like "500-1000" or "1200 employees".
  let headcount: number | null = null
  const nums = sizeText.match(/\d[\d,]*/g)?.map((n) => parseInt(n.replace(/,/g, ''), 10)) ?? []
  if (nums.length > 0) headcount = Math.max(...nums)

  let sizePts = 5
  let sizeNote = 'company size unknown'
  if (headcount !== null) {
    if (headcount >= 200 && headcount <= 5000) {
      sizePts = 10
      sizeNote = `~${headcount} employees — ideal mid-market band`
    } else if (headcount >= 50) {
      sizePts = 6
      sizeNote = `~${headcount} employees — workable, smaller deal`
    } else {
      sizePts = 3
      sizeNote = `~${headcount} employees — below target band`
    }
  }

  const industryPts = industryFit ? 20 : 10
  const total = Math.min(30, industryPts + sizePts)
  const reason = industryFit
    ? `Strong ICP fit: ${lead.industry || 'industrial-adjacent'} vertical (${industryPts}/20); ${sizeNote} (${sizePts}/10)`
    : `Weak vertical fit: "${lead.industry || 'unknown'}" is outside core ICP (${industryPts}/20); ${sizeNote} (${sizePts}/10)`
  return { points: total, reason }
}

/** Deterministic 0–100 lead score with a stated reason per dimension. */
export function scoreLead(lead: Lead): ScoreBreakdown {
  const signal = signalPoints(lead)
  const seniority = seniorityPoints(lead)
  const fit = fitPoints(lead)
  const score = Math.min(100, signal.points + seniority.points + fit.points)
  return {
    score,
    reasons: [signal.reason, seniority.reason, fit.reason],
    signalPoints: signal.points,
    seniorityPoints: seniority.points,
    fitPoints: fit.points,
  }
}

export interface OutreachDraft {
  subject: string
  body: string
}

/** Personalized first-touch email from the lead's signals. Never writes — returns only. */
export function buildOutreach(lead: Lead): OutreachDraft {
  const firstName = (lead.contactName ?? 'there').split(' ')[0]
  const company = lead.company ?? 'your team'
  const signalLabel = SIGNAL_SOURCE_LABELS[lead.signalSource] ?? 'recent activity'
  const signalNote = lead.signals ? ` ${lead.signals.trim()}` : ''

  const subject = `${firstName} — quick idea for ${company}'s line efficiency`

  const body = [
    `Hi ${firstName},`,
    '',
    `Noticed ${company} ${signalLabel === 'Cold' ? 'is expanding its operations' : `— ${signalLabel.toLowerCase()} caught my eye`}.${signalNote}`,
    '',
    `We help ${lead.industry ? `${lead.industry} ` : ''}teams turn sensor and line data into fewer unplanned stops — typically without ripping out existing PLCs. Given your role${lead.contactTitle ? ` as ${lead.contactTitle}` : ''}, thought it might be worth 20 minutes to compare notes on what's working on your floor.`,
    '',
    `Open to a brief call Thursday or Friday morning?`,
    '',
    `Best,`,
    `Hemanth`,
    `GTM War Room`,
  ].join('\n')

  return { subject, body }
}

// ---------------------------------------------------------------------------
// Demo seed data — 10 realistic B2B leads across the pipeline.
// ---------------------------------------------------------------------------

export const SEED_LEADS: Lead[] = [
  {
    company: 'Meridian Packaging Co.',
    contactName: 'Dana Whitfield',
    contactTitle: 'VP of Operations',
    email: 'd.whitfield@meridianpkg.com',
    industry: 'Packaging',
    companySize: '850 employees',
    signalSource: 'funding_news',
    signals: 'Raised $40M Series C to expand two Midwest plants; press release mentions automation upgrades.',
    stage: 'new',
    owner: 'Unassigned',
    notes: '',
  },
  {
    company: 'BlueRiver Foods',
    contactName: 'Marcus Chen',
    contactTitle: 'Director of Engineering',
    email: 'mchen@blueriverfoods.com',
    industry: 'Food & Beverage',
    companySize: '1,200 employees',
    signalSource: 'job_posting',
    signals: 'Hiring 3 controls engineers and an IIoT architect in Chicago — new headcount, not backfill.',
    stage: 'new',
    owner: 'Unassigned',
    notes: '',
  },
  {
    company: 'Ironclad Logistics',
    contactName: 'Priya Natarajan',
    contactTitle: 'Head of Warehouse Automation',
    email: 'priya.n@ironcladlog.com',
    industry: 'Logistics',
    companySize: '2,400 employees',
    signalSource: 'trade_show',
    signals: 'Met at ProMat 2026 booth; asked specifically about IO-Link vibration monitoring for conveyor drives.',
    stage: 'contacted',
    owner: 'Hemanth',
    notes: 'Follow up with the vibration sensor datasheet.',
  },
  {
    company: 'Stanton Auto Parts',
    contactName: 'Robert Kowalski',
    contactTitle: 'Plant Manager',
    email: 'rkowalski@stantonauto.com',
    industry: 'Automotive',
    companySize: '600 employees',
    signalSource: 'website_visit',
    signals: 'Visited pricing page 4x this week; downloaded the condition-monitoring whitepaper.',
    stage: 'contacted',
    owner: 'Hemanth',
    notes: '',
  },
  {
    company: 'Copperline Brewing Systems',
    contactName: 'Sofia Almeida',
    contactTitle: 'CEO',
    email: 'sofia@copperlinebrew.com',
    industry: 'Food & Beverage',
    companySize: '180 employees',
    signalSource: 'tech_change',
    signals: 'Evaluating vendors to replace legacy manual QA checks with inline vision inspection.',
    stage: 'qualified',
    owner: 'Hemanth',
    notes: 'CEO is the economic buyer — keep cycle tight.',
  },
  {
    company: 'Northgate Material Handling',
    contactName: 'James Okafor',
    contactTitle: 'VP Supply Chain',
    email: 'j.okafor@northgatemh.com',
    industry: 'Material Handling',
    companySize: '3,100 employees',
    signalSource: 'funding_news',
    signals: 'Acquired by PE firm; 100-day plan includes warehouse modernization across 6 DCs.',
    stage: 'qualified',
    owner: 'Hemanth',
    notes: '',
  },
  {
    company: 'Lakeside Dairy Cooperative',
    contactName: 'Emily Sorensen',
    contactTitle: 'Operations Manager',
    email: 'esorensen@lakesidedairy.coop',
    industry: 'Food & Beverage',
    companySize: '420 employees',
    signalSource: 'content_engagement',
    signals: 'Attended our webinar on hygienic sensor design; asked about CIP-rated IO-Link hubs in Q&A.',
    stage: 'meeting',
    owner: 'Hemanth',
    notes: 'Demo scheduled — bring the washdown sensor kit.',
  },
  {
    company: 'Vulcan Robotics',
    contactName: 'David Park',
    contactTitle: 'CTO',
    email: 'dpark@vulcanrobotics.io',
    industry: 'Industrial Automation',
    companySize: '95 employees',
    signalSource: 'website_visit',
    signals: 'CTO personally trialed the docs; starred the GitHub repo.',
    stage: 'meeting',
    owner: 'Hemanth',
    notes: 'Technical buyer — lead with the SDK, not the pitch deck.',
  },
  {
    company: 'Harbor Freight Terminals',
    contactName: 'Angela Ruiz',
    contactTitle: 'Director of Maintenance',
    email: 'aruiz@harborfreight-term.com',
    industry: 'Logistics',
    companySize: '750 employees',
    signalSource: 'job_posting',
    signals: 'Posted for reliability engineer citing "predictive maintenance program buildout".',
    stage: 'closed_won',
    owner: 'Hemanth',
    notes: 'Pilot expanded to 3 terminals. Reference account.',
  },
  {
    company: 'Prairie State Milling',
    contactName: 'Tom Becker',
    contactTitle: 'Maintenance Supervisor',
    email: 'tbecker@prairiestatemilling.com',
    industry: 'Food & Beverage',
    companySize: '140 employees',
    signalSource: 'cold',
    signals: 'No observable trigger; added from purchased list.',
    stage: 'closed_lost',
    owner: 'Hemanth',
    notes: 'Lost to incumbent on price. Revisit in 12 months.',
  },
]
