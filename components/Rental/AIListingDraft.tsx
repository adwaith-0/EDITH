'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { aiClient } from '@/services/aiClient';
import { AIListingDraftRequest, AIListingDraftResult, AIListingFields, AIStatus } from '@/types/ai';
import { RentalDraft } from '@/types/rental';
import { ErrorBox, Icon } from './ui';

const sampleNotes = 'Name: Garden EV Point\nAddress: 12 Garden Road, Bengaluru\nConnector: Type 2\nCurrent: AC\nPower: 7.4 kW\nRate: INR 120 per hour\nParking: One bay included\nPublic access: Meet host at front gate\nTerms: Arrive on time';
const fields: { key: keyof AIListingFields; label: string; multiline?: boolean }[] = [
  { key: 'name', label: 'Listing title' }, { key: 'address', label: 'Address and area' },
  { key: 'connectorType', label: 'Connector' }, { key: 'currentType', label: 'Current type' },
  { key: 'powerKw', label: 'Rated power · kW' }, { key: 'hourlyRatePaise', label: 'Rental rate · INR / hour' },
  { key: 'parking', label: 'Parking requirements', multiline: true },
  { key: 'accessInstructions', label: 'General access instructions', multiline: true },
  { key: 'terms', label: 'Rental terms', multiline: true },
];
const fieldNames: Record<string, string> = { ...Object.fromEntries(fields.map(field => [field.key, field.label])), lat: 'Latitude · enter manually', lng: 'Longitude · enter manually', availabilityWindows: 'Dated availability · enter manually' };
type LabelImage = NonNullable<AIListingDraftRequest['labelImage']> & { preview: string; name: string; synthetic: boolean };

function readImage(blob: Blob, name: string, synthetic = false): Promise<LabelImage> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) { reject(new Error('Choose a JPEG, PNG or WebP charger label.')); return; }
    if (blob.size > 1024 * 1024) { reject(new Error('The label image must be 1 MB or smaller.')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read. Try another file.'));
    reader.onload = () => {
      const preview = String(reader.result || '');
      const base64 = preview.split(',')[1];
      if (!base64) { reject(new Error('The image could not be read. Try another file.')); return; }
      resolve({ base64, mimeType: blob.type as LabelImage['mimeType'], preview, name, synthetic });
    };
    reader.readAsDataURL(blob);
  });
}

export default function AIListingDraft({ onApply }: { onApply: (draft: Partial<RentalDraft>) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [syntheticNotes, setSyntheticNotes] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [checking, setChecking] = useState(false);
  const [useDemoFallback, setUseDemoFallback] = useState(false);
  const [image, setImage] = useState<LabelImage | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AIListingDraftResult | null>(null);
  const [preview, setPreview] = useState<Partial<AIListingFields>>({});
  const [selected, setSelected] = useState<(keyof AIListingFields)[]>([]);
  const [applied, setApplied] = useState('');
  const generation = useRef(0);
  const imageGeneration = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setChecking(true); setStatusError('');
    aiClient.status().then(data => { if (active) setStatus(data); })
      .catch(e => { if (active) setStatusError((e as Error).message); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [open]);
  useEffect(() => () => { generation.current++; imageGeneration.current++; }, []);

  function clearResult() { generation.current++; setResult(null); setPreview({}); setSelected([]); setError(''); setApplied(''); }
  async function chooseImage(blob?: Blob, name = '', synthetic = false) {
    const version = ++imageGeneration.current;
    clearResult(); setImage(null); setImageError('');
    if (!blob) { setImageBusy(false); return; }
    setImageBusy(true);
    try { const data = await readImage(blob, name, synthetic); if (imageGeneration.current === version) setImage(data); }
    catch (e) { if (imageGeneration.current === version) setImageError((e as Error).message); }
    finally { if (imageGeneration.current === version) setImageBusy(false); }
  }
  async function demoImage() {
    const version = ++imageGeneration.current;
    clearResult(); setImage(null); setImageError(''); setImageBusy(true);
    if (fileInput.current) fileInput.current.value = '';
    try {
      const response = await fetch('/demo/charger-label.png', { cache: 'no-store' });
      if (!response.ok) throw new Error('The demo label image is unavailable. Choose your own label image or use the demo notes.');
      const blob = await response.blob();
      if (imageGeneration.current !== version) return;
      const data = await readImage(blob, 'Synthetic demo charger label.png', true);
      if (imageGeneration.current === version) setImage(data);
    } catch (e) { if (imageGeneration.current === version) setImageError((e as Error).message); }
    finally { if (imageGeneration.current === version) setImageBusy(false); }
  }
  function removeImage() { imageGeneration.current++; setImage(null); setImageBusy(false); setImageError(''); if (fileInput.current) fileInput.current.value = ''; clearResult(); }
  async function generate() {
    const version = ++generation.current;
    setBusy(true); setError(''); setResult(null); setPreview({}); setSelected([]); setApplied('');
    try {
      const response = await aiClient.listingDraft({ notes: notes.trim(), useDemoFallback, ...(!useDemoFallback && image ? { labelImage: { base64: image.base64, mimeType: image.mimeType } } : {}) });
      if (generation.current !== version) return;
      const allowed: Partial<AIListingFields> = {};
      for (const { key } of fields) if (Object.prototype.hasOwnProperty.call(response.draft, key)) Object.assign(allowed, { [key]: response.draft[key] });
      setResult(response); setPreview(allowed); setSelected(fields.map(field => field.key).filter(key => Object.prototype.hasOwnProperty.call(allowed, key)));
    } catch (e) { if (generation.current === version) setError((e as Error).message); }
    finally { if (generation.current === version) setBusy(false); }
  }
  function editField(key: keyof AIListingFields, value: string) {
    setApplied('');
    setPreview(current => {
      const next = { ...current };
      if (key === 'powerKw') next.powerKw = value === '' ? null : Number(value);
      else if (key === 'hourlyRatePaise') { if (value === '') delete next.hourlyRatePaise; else next.hourlyRatePaise = Math.round(Number(value) * 100); }
      else next[key] = value;
      return next;
    });
  }
  const visibleFields = fields.filter(field => result && Object.prototype.hasOwnProperty.call(result.draft, field.key));
  const selectedFields = visibleFields.filter(field => selected.includes(field.key));
  const invalid = selectedFields.some(({ key }) => {
    const value = preview[key];
    if (key === 'powerKw') return value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 1000);
    if (key === 'hourlyRatePaise') return typeof value !== 'number' || !Number.isFinite(value) || value < 100 || value > 10000000;
    return typeof value !== 'string' || !value.trim();
  });
  function apply() {
    if (invalid || !selectedFields.length) return;
    const patch: Partial<RentalDraft> = {};
    for (const { key } of selectedFields) Object.assign(patch, { [key]: preview[key] });
    onApply(patch);
    setApplied(`Applied ${selectedFields.length} reviewed ${selectedFields.length === 1 ? 'field' : 'fields'} to the listing form below. Review the full form before saving.`);
  }

  return <section className="mb-6 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 text-neutral-900">
    <button type="button" className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(value => !value)}><span className="flex items-center gap-3"><span className="rounded-xl border border-neutral-200 bg-white p-2.5"><Icon name="bolt" size={20} /></span><span><strong className="block text-sm">Start with an AI listing draft</strong><small className="mt-1 block text-xs leading-5 text-neutral-500">Describe your charger. Review extracted fields before applying.</small></span></span><Icon name={open ? 'close' : 'plus'} size={18} /></button>
    {open && <div id={`${id}-panel`} className="ed-form border-t border-neutral-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-medium text-neutral-600">{checking ? 'Checking provider configuration…' : status?.configured ? `${status.provider} · ${status.model}` : 'AI provider unavailable · manual form available'}</span><span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide">Draft only</span></div>
      {statusError && <p className="text-xs leading-5 text-amber-800" role="status">{statusError}</p>}
      <label htmlFor={`${id}-notes`}>Public charger notes<textarea id={`${id}-notes`} rows={5} maxLength={5000} value={notes} disabled={busy} onChange={e => { clearResult(); setNotes(e.target.value); setSyntheticNotes(false); }} placeholder="Listing name, address, connector and current type, known power, hourly price, parking and public arrival instructions…" /></label>
      <button type="button" className="ed-text-button text-xs" disabled={busy} onClick={() => { clearResult(); setNotes(sampleNotes); setSyntheticNotes(true); }}>Load SYNTHETIC demo notes<Icon name="arrow" size={14} /></button>
      {syntheticNotes && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Synthetic example only. This address and charger do not represent a real listing. Replace the demo details before publishing.</p>}
      {status?.visionConfigured && <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
        <label htmlFor={`${id}-image`}>Charger label image · optional<input ref={fileInput} id={`${id}-image`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || imageBusy || useDemoFallback} onChange={e => void chooseImage(e.target.files?.[0], e.target.files?.[0]?.name)} /></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs leading-5 text-neutral-500">JPEG, PNG or WebP · up to 1 MB · {status.visionModel || 'configured vision model'}</p><button type="button" className="ed-text-button text-xs" disabled={busy || imageBusy || useDemoFallback} onClick={() => void demoImage()}>{imageBusy ? 'Reading label image…' : 'Try demo label image'}</button></div>
        {image && <div className="flex flex-wrap items-center gap-4 rounded-xl bg-neutral-50 p-3"><img className="h-24 w-24 rounded-lg border border-neutral-200 object-contain" src={image.preview} alt={image.synthetic ? 'Synthetic charger label showing Type 2 and 7.4 kW AC' : 'Selected charger label for AI extraction'} /><div className="min-w-0 flex-1"><p className="break-words text-xs font-medium">{image.name}</p>{image.synthetic && <p className="mt-1 text-xs leading-5 text-amber-900">SYNTHETIC label · demonstrates extraction only. It is not equipment evidence.</p>}<button type="button" className="ed-text-button mt-2 text-xs" disabled={busy} onClick={removeImage}>Remove image<Icon name="close" size={13} /></button></div></div>}
        <ErrorBox message={imageError} />
        <p className="text-xs leading-5 text-neutral-500">The image is sent only when you generate a draft with AI enabled. Use a close-up of the equipment label; leave faces, vehicle plates and private details out. Text in an image is not a safety certification.</p>
      </div>}
      <label className="ed-check"><input type="checkbox" checked={useDemoFallback} disabled={busy || imageBusy} onChange={e => { clearResult(); setUseDemoFallback(e.target.checked); }} /><span><strong>Use offline demo examples</strong><small>Extracts explicitly labelled notes without a model. Label images are excluded in this mode.</small></span></label>
      <p className="text-xs leading-5 text-neutral-500">Public notes {status?.visionConfigured ? 'and any selected label image are' : 'are'} sent to the configured Ollama provider only when AI is enabled. Keep gate codes, passwords and private contact details in the restricted instructions field below.</p>
      <button type="button" className="ed-button ed-button-dark" disabled={busy || imageBusy || (!status?.configured && !useDemoFallback) || (!notes.trim() && (!image || useDemoFallback))} onClick={() => void generate()}>{busy ? 'Drafting from your notes…' : useDemoFallback ? 'Generate offline demo draft' : 'Generate listing draft'}<Icon name="arrow" size={16} /></button>
      <ErrorBox message={error} />
      {error && <p className="text-xs leading-5 text-neutral-600">Your listing form has not changed. Continue manually below, or select the offline demo option and generate again using labelled notes.</p>}

      {result && <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5" aria-live="polite">
        <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${result.mode === 'DEMO_FALLBACK' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-neutral-200 bg-neutral-100'}`}>{result.mode === 'DEMO_FALLBACK' ? 'OFFLINE DEMO EXAMPLE · NO MODEL USED' : 'AI GENERATED · VERIFY AGAINST EQUIPMENT'}</span>{result.mode === 'AI' && <span className="text-xs text-neutral-500">{result.model}</span>}</div>
        <div><h4 className="text-base font-semibold">Review what goes into your form.</h4><p className="mt-2 text-xs leading-5 text-neutral-500">Edit any extracted value and uncheck fields you want to keep as they are. Applying replaces only the selected fields.</p></div>
        {visibleFields.length ? <div className="grid gap-4 sm:grid-cols-2">{visibleFields.map(({ key, label, multiline }) => {
          const value = preview[key];
          const display = key === 'hourlyRatePaise' && typeof value === 'number' ? String(value / 100) : value == null ? '' : String(value);
          const choices = key === 'connectorType' ? ['Type 2', 'CCS2', 'CHAdeMO', 'Bharat AC001', 'Bharat DC001', 'IEC 60309'] : key === 'currentType' ? ['AC', 'DC'] : null;
          return <div key={key} className="space-y-2"><label className="ed-check"><input type="checkbox" checked={selected.includes(key)} onChange={e => { setApplied(''); setSelected(current => e.target.checked ? [...current, key] : current.filter(item => item !== key)); }} /><span className="text-xs font-medium">Apply {label.toLowerCase()}</span></label><label htmlFor={`${id}-${key}`} className="sr-only">Draft {label}</label>{choices ? <select id={`${id}-${key}`} disabled={!selected.includes(key)} value={display} onChange={e => editField(key, e.target.value)}>{!choices.includes(display) && <option value={display}>{display || 'Choose a verified value'}</option>}{choices.map(choice => <option key={choice}>{choice}</option>)}</select> : multiline ? <textarea id={`${id}-${key}`} rows={2} disabled={!selected.includes(key)} value={display} onChange={e => editField(key, e.target.value)} /> : <input id={`${id}-${key}`} type={key === 'powerKw' || key === 'hourlyRatePaise' ? 'number' : 'text'} min={key === 'powerKw' ? '0.1' : key === 'hourlyRatePaise' ? '1' : undefined} max={key === 'powerKw' ? '1000' : key === 'hourlyRatePaise' ? '100000' : undefined} step={key === 'hourlyRatePaise' ? '0.01' : key === 'powerKw' ? '0.1' : undefined} disabled={!selected.includes(key)} value={display} placeholder={key === 'powerKw' ? 'Unknown' : undefined} onChange={e => editField(key, e.target.value)} />}</div>;
        })}</div> : <p className="text-sm text-neutral-600">No usable fields were extracted. Add explicit labels to your notes or fill the form manually.</p>}
        {!!result.missingFields.length && <div className="rounded-xl bg-neutral-50 p-3"><h5 className="text-xs font-semibold">Still needed</h5><p className="mt-1 text-xs leading-5 text-neutral-600">{result.missingFields.map(field => fieldNames[field] || field).join(' · ')}</p></div>}
        {!!result.warnings.length && <ul className="space-y-1 text-xs leading-5 text-amber-900">{result.warnings.map((warning, i) => <li key={i}>• {warning}</li>)}</ul>}
        <p className="text-xs leading-5 text-neutral-500">{result.notice}</p>
        {invalid && <p className="text-xs leading-5 text-amber-900">Review selected fields: text cannot be empty, power must be unknown or 0.1–1,000 kW, and the hourly rate must be ₹1–₹100,000.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4"><p className="max-w-lg text-xs leading-5 text-neutral-500">Coordinates, availability, private instructions and publish status remain under your control in the form below.</p><button type="button" className="ed-button ed-button-dark" disabled={invalid || !selectedFields.length} onClick={apply}>Apply {selectedFields.length ? selectedFields.length : ''} {selectedFields.length === 1 ? 'field' : 'fields'} to form<Icon name="check" size={16} /></button></div>
        {applied && <p className="rounded-xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-900" role="status">{applied}</p>}
      </div>}
    </div>}
  </section>;
}
