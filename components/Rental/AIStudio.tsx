'use client';

import { useEffect, useRef, useState } from 'react';
import { aiClient } from '@/services/aiClient';
import { AIGuideResult, AIHostInsightsResult, AILanguage, AIResultMode, AIStatus } from '@/types/ai';
import { RentalUser } from '@/types/rental';
import { Empty, ErrorBox, Icon, money } from './ui';

const prompts = [
  'How does requesting a private charger work, and when is my slot reserved?',
  'What should I check before choosing a charger?',
  'Show the connector, hourly rate and evidence for the available listings.',
  'What happens if my charging plan changes?',
];

function ResultLabel({ mode, model }: { mode: AIResultMode; model: string }) {
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <span className={`rounded-full border px-3 py-1.5 font-semibold ${mode === 'DEMO_FALLBACK' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-neutral-100 text-neutral-800'}`}>
      {mode === 'DEMO_FALLBACK' ? 'OFFLINE DEMO EXAMPLE · NO MODEL USED' : 'AI GENERATED · REVIEW REQUIRED'}
    </span>
    {mode === 'AI' && <span className="text-neutral-500">{model}</span>}
  </div>;
}

export default function AIStudio({ user, onAuth, onOpenListing, onCreateListing, initialTab = 'guide' }: {
  user: RentalUser | null;
  onAuth: () => void;
  onOpenListing?: (id: string) => void;
  onCreateListing?: () => void;
  initialTab?: 'guide' | 'host';
}) {
  const [tab, setTab] = useState<'guide' | 'host'>(initialTab);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [checking, setChecking] = useState(false);
  const [question, setQuestion] = useState(prompts[0]);
  const [language, setLanguage] = useState<AILanguage>('en');
  const [useDemoFallback, setUseDemoFallback] = useState(false);
  const [busy, setBusy] = useState<'guide' | 'host' | ''>('');
  const [error, setError] = useState('');
  const [guide, setGuide] = useState<AIGuideResult | null>(null);
  const [insights, setInsights] = useState<AIHostInsightsResult | null>(null);
  const generation = useRef(0);

  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    let active = true;
    generation.current++;
    setGuide(null); setInsights(null); setError(''); setBusy(''); setStatus(null); setStatusError('');
    if (!user) return;
    setChecking(true);
    aiClient.status().then(data => { if (active) setStatus(data); })
      .catch(e => { if (active) setStatusError((e as Error).message); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; generation.current++; };
  }, [user?.id]);

  async function checkProvider() {
    setChecking(true); setStatusError('');
    try { setStatus(await aiClient.status()); }
    catch (e) { setStatusError((e as Error).message); }
    finally { setChecking(false); }
  }
  function resetAnswers() { generation.current++; setGuide(null); setInsights(null); setError(''); setBusy(''); }
  async function askGuide() {
    if (!user) { onAuth(); return; }
    const version = ++generation.current;
    setBusy('guide'); setGuide(null); setError('');
    try {
      const result = await aiClient.guide({ question: question.trim(), language, useDemoFallback });
      if (generation.current === version) setGuide(result);
    } catch (e) { if (generation.current === version) setError((e as Error).message); }
    finally { if (generation.current === version) setBusy(''); }
  }
  async function analyzeHosting() {
    if (!user) { onAuth(); return; }
    const version = ++generation.current;
    setBusy('host'); setInsights(null); setError('');
    try {
      const result = await aiClient.hostInsights(useDemoFallback);
      if (generation.current === version) setInsights(result);
    } catch (e) { if (generation.current === version) setError((e as Error).message); }
    finally { if (generation.current === version) setBusy(''); }
  }
  const canRun = !busy && (!!status?.configured || useDemoFallback);

  return <div className="mx-auto w-full max-w-6xl space-y-4 pb-6 text-neutral-900">
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        <div className="max-w-2xl space-y-2">
          <span className="ed-eyebrow">EDITH AI STUDIO</span>
          <h2 className="text-2xl font-semibold tracking-tight">Driver guide &amp; host copilot</h2>
          <p className="text-sm leading-6 text-neutral-600">Ask about bookings, draft a charger listing, or review your hosting activity.</p>
          <p className="text-xs leading-5 text-neutral-500">AI explains and drafts. You review. These tools cannot publish a listing, reserve a slot or take payment.</p>
        </div>
        {onCreateListing && <button type="button" className="ed-button ed-button-small ed-button-outline" onClick={() => user ? onCreateListing() : onAuth()}>Draft a host listing<Icon name="arrow" size={15} /></button>}
      </div>
      <details className="border-t border-neutral-200">
        <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-neutral-600 sm:px-5">Explore the AI features</summary>
        <div className="grid border-t border-neutral-100 sm:grid-cols-3">
        {[
          ['mic', 'Voice & booking', 'Describe a charging need and review checked options.', 'Available in Voice booking agent'],
          ['plug', 'Host listing drafts', 'Extract public notes and, with vision enabled, charger labels.', 'Review before applying to your form'],
          ['grid', 'Guide & hosting insights', 'Answers with source records and advice from your own activity.', 'English · हिन्दी · മലയാളം'],
        ].map(([icon, title, description, detail], i) => <div key={title} className={`space-y-2 p-4 ${i ? 'border-t border-neutral-200 sm:border-l sm:border-t-0' : ''}`}>
          <div className="mb-3 flex items-center gap-2"><Icon name={icon} size={18} /><h3 className="text-sm font-semibold">{title}</h3></div>
          <p className="text-sm leading-6 text-neutral-600">{description}</p><p className="mt-3 text-xs text-neutral-500">{detail}</p>
        </div>)}
        </div>
      </details>
    </section>

    {!user ? <Empty title="Your AI workspace" text="Sign in to ask the grounded guide or analyze your own hosting records. You can review every draft before taking action." action={<button type="button" className="ed-button ed-button-dark" onClick={onAuth}>Sign in to try AI tools<Icon name="arrow" size={16} /></button>} /> : <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${status?.configured ? 'bg-emerald-600' : 'bg-neutral-400'}`} aria-hidden="true" />{checking ? 'Checking provider configuration…' : status?.configured ? `${status.provider} configured` : 'AI provider unavailable'}</div>
            <p className="mt-1 text-xs leading-5 text-neutral-500">{status?.configured ? `${status.model} · the request checks the live connection` : 'You can retry the provider check or explicitly choose the offline demo.'}</p>
          </div>
          <button type="button" className="ed-text-button text-xs" disabled={checking || !!busy} onClick={() => void checkProvider()}><Icon name="refresh" size={14} />{checking ? 'Checking…' : 'Check provider'}</button>
        </div>
        {statusError && <p role="status" className="mt-3 text-sm text-amber-800">{statusError}</p>}
        <label className="ed-check mt-4"><input type="checkbox" checked={useDemoFallback} disabled={!!busy} onChange={e => { resetAnswers(); setUseDemoFallback(e.target.checked); }} /><span><strong>Use offline demo examples</strong><small>Runs a labelled, deterministic example without contacting a model. Hosting metrics still come from your account records.</small></span></label>
      </section>

      <section className="rounded-3xl border border-neutral-200 bg-white">
        <div className="flex gap-1 border-b border-neutral-200 p-2" role="tablist" aria-label="AI tools">
          {([['guide', 'Grounded guide', 'search'], ['host', 'Host insights', 'home']] as const).map(([value, label, icon]) => <button type="button" key={value} id={`ai-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`ai-panel-${value}`} tabIndex={tab === value ? 0 : -1} disabled={!!busy} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition sm:flex-none sm:px-5 ${tab === value ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`} onClick={() => { setTab(value); setError(''); }} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 'guide' : event.key === 'End' ? 'host' : value === 'guide' ? 'host' : 'guide'; setTab(next); setError(''); document.getElementById(`ai-tab-${next}`)?.focus(); } }}><Icon name={icon} size={16} />{label}</button>)}
        </div>
        {tab === 'guide' ? <div id="ai-panel-guide" role="tabpanel" aria-labelledby="ai-tab-guide" className="space-y-5 p-5 sm:p-7">
          <div><h3 className="text-xl font-semibold tracking-tight">Answers with something to point to.</h3><p className="mt-2 text-sm leading-6 text-neutral-600">The guide uses EDITH’s booking rules and published listing records. It cannot check live equipment condition or guarantee availability.</p></div>
          <div className="ed-form">
            <label>Your question<textarea aria-label="Ask the EDITH guide" rows={3} maxLength={1200} value={question} disabled={!!busy} onChange={e => { setGuide(null); setError(''); setQuestion(e.target.value); }} placeholder="Ask about a booking rule or a published listing…" /></label>
            <div className="flex flex-wrap items-end justify-between gap-4"><label className="min-w-40">Answer language<select value={language} disabled={!!busy} onChange={e => { setGuide(null); setLanguage(e.target.value as AILanguage); }}><option value="en">English</option><option value="hi">हिन्दी · Hindi</option><option value="ml">മലയാളം · Malayalam</option></select></label><button type="button" className="ed-button ed-button-dark" disabled={!canRun || !question.trim()} onClick={() => void askGuide()}>{busy === 'guide' ? 'Reading EDITH source records…' : useDemoFallback ? 'Run guide demo example' : 'Ask the guide'}<Icon name="arrow" size={16} /></button></div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2" aria-label="Suggested guide questions">{prompts.map(prompt => <button type="button" key={prompt} disabled={!!busy} className="rounded-xl border border-neutral-200 p-3 text-left text-xs leading-5 text-neutral-700 transition hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50" onClick={() => { resetAnswers(); setQuestion(prompt); }}>{prompt}<span className="ml-1" aria-hidden="true">↗</span></button>)}</div>
          <p className="text-xs leading-5 text-neutral-500">When AI is enabled, your question and a limited set of public listing facts go to the configured Ollama provider. Keep passwords, gate codes and private contact details out of your question.</p>
          <ErrorBox message={error} />
          {guide && <article className="space-y-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-5" aria-live="polite">
            <ResultLabel mode={guide.mode} model={guide.model} />
            <p className="whitespace-pre-wrap text-sm leading-7" lang={language}>{guide.answer}</p>
            <div className="border-t border-neutral-200 pt-4"><h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Source records supplied to this answer</h4><ul className="mt-3 space-y-2">{guide.sources.map(source => <li key={`${source.kind}-${source.id}`} className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase text-neutral-500">{source.kind === 'POLICY' ? 'EDITH rule' : 'Listing'}</span>{source.kind === 'LISTING' && onOpenListing ? <button type="button" className="ed-text-button text-left text-sm" onClick={() => onOpenListing(source.id)}>{source.title}<Icon name="arrow" size={14} /></button> : <span>{source.title}</span>}</li>)}</ul>{!guide.sources.length && <p className="mt-2 text-sm text-neutral-500">No listing or policy records were supplied for this answer.</p>}</div>
            {!!guide.caveats.length && <ul className="space-y-1 border-t border-neutral-200 pt-4 text-xs leading-5 text-neutral-600">{guide.caveats.map((item, i) => <li key={i}>• {item}</li>)}</ul>}
          </article>}
        </div> : <div id="ai-panel-host" role="tabpanel" aria-labelledby="ai-tab-host" className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h3 className="text-xl font-semibold tracking-tight">Make sense of your hosting activity.</h3><p className="mt-2 text-sm leading-6 text-neutral-600">Get a current snapshot of your listings and recorded booking outcomes, with practical suggestions to review. This analysis does not forecast earnings, demand or reliability.</p></div><button type="button" className="ed-button ed-button-dark" disabled={!canRun} onClick={() => void analyzeHosting()}>{busy === 'host' ? 'Analyzing your hosting records…' : 'Analyze hosting'}<Icon name="arrow" size={16} /></button></div>
          <p className="text-xs leading-5 text-neutral-500">Analysis runs only when you click. AI receives aggregate counts from your account; private access instructions and guest contact details are excluded.</p>
          <ErrorBox message={error} />
          {insights ? <div className="space-y-5" aria-live="polite">
            <ResultLabel mode={insights.mode} model={insights.model} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{([
              ['Owned listings', insights.metrics.ownedListings], ['Published listings', insights.metrics.publishedListings], ['Recorded bookings', insights.metrics.bookingCount], ['Pending requests', insights.metrics.pendingRequests], ['Completed sessions', insights.metrics.completedSessions], ['Cancelled bookings', insights.metrics.cancelledBookings],
            ] as const).map(([label, value]) => <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4" key={label}><span className="text-xs text-neutral-500">{label}</span><strong className="mt-2 block text-3xl font-semibold tracking-tight">{value}</strong></div>)}</div>
            <div className="rounded-2xl bg-neutral-950 p-5 text-white"><p className="text-xs text-neutral-400">Recorded demo booking value · no money collected</p><strong className="mt-1 block text-2xl font-semibold">{money(insights.metrics.demoBookingValuePaise)}</strong></div>
            <p className="whitespace-pre-wrap text-sm leading-7">{insights.summary}</p>
            <div><h4 className="text-sm font-semibold">Suggestions for your review</h4><div className="mt-3 space-y-3">{insights.suggestions.map((suggestion, i) => <article key={i} className="rounded-2xl border border-neutral-200 p-4"><h5 className="text-sm font-semibold">{suggestion.title}</h5><p className="mt-2 text-sm leading-6 text-neutral-600">{suggestion.detail}</p></article>)}</div></div>
            <p className="rounded-xl bg-neutral-50 p-4 text-xs leading-5 text-neutral-600">{insights.notice}</p>
          </div> : <div className="rounded-2xl border border-dashed border-neutral-300 px-5 py-9 text-center"><Icon name="grid" size={26} className="mx-auto text-neutral-400" /><h4 className="mt-3 text-sm font-semibold">Your records, when you’re ready.</h4><p className="mt-2 text-sm text-neutral-500">Click Analyze hosting to fetch your metrics and suggestions.</p></div>}
        </div>}
      </section>
    </>}
  </div>;
}
