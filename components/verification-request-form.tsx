'use client';

import { FormEvent, useState } from 'react';

type VerificationType = 'EMAIL' | 'PHONE' | 'IDENTITY' | 'PROFESSIONAL' | 'PROPERTY_OWNERSHIP' | 'AGENCY' | 'COMPANY';

type UploadedDocument = {
  ticket: string;
  fileName: string;
  mimeType: string;
  size: number;
  secureUrl: string;
  publicId: string;
  resourceType: 'image' | 'video' | 'raw';
  deliveryType: 'authenticated';
};

async function uploadVerificationDocument(file: File, type: VerificationType, propertyId?: string) {
  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purpose: { kind: 'verification', verificationType: type, ...(propertyId ? { propertyId } : {}) },
      fileName: file.name,
      mimeType: file.type,
      size: file.size,
    }),
  });
  const signResult = await signResponse.json();
  if (!signResponse.ok) throw new Error(typeof signResult.error === 'string' ? signResult.error : 'Could not authorize this upload.');
  const signed = signResult.data;
  const form = new FormData();
  form.set('file', file);
  form.set('api_key', signed.apiKey);
  form.set('timestamp', String(signed.timestamp));
  form.set('folder', signed.folder);
  form.set('public_id', signed.publicId);
  form.set('overwrite', 'false');
  form.set('type', signed.deliveryType);
  form.set('signature', signed.signature);
  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resourceType}/upload`, {
    method: 'POST',
    body: form,
  });
  const uploadResult = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error('Cloudinary could not upload the document.');
  return {
    ticket: signed.ticket,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    secureUrl: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    resourceType: signed.resourceType,
    deliveryType: signed.deliveryType,
  } satisfies UploadedDocument;
}

export function VerificationRequestForm({ defaultPropertyId = '', defaultType = 'IDENTITY' }: { defaultPropertyId?: string; defaultType?: VerificationType }) {
  const [type, setType] = useState<VerificationType>(defaultType);
  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const documents = files ? await Promise.all(Array.from(files).map((file) => uploadVerificationDocument(file, type, propertyId || undefined))) : [];
      const response = await fetch('/api/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(propertyId ? { propertyId } : {}),
          notes,
          documents,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to submit verification request.');
      setFeedback('Verification request submitted. An admin will review it.');
      setNotes('');
      setFiles(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit verification request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Verification type
          <select value={type} onChange={(event) => setType(event.target.value as VerificationType)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2">
            <option value="IDENTITY">Identity</option>
            <option value="EMAIL">Email</option>
            <option value="PHONE">Phone</option>
            <option value="PROFESSIONAL">Professional</option>
            <option value="PROPERTY_OWNERSHIP">Property ownership</option>
            <option value="AGENCY">Agency</option>
            <option value="COMPANY">Company</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Property ID (optional)
          <input value={propertyId} onChange={(event) => setPropertyId(event.target.value)} placeholder="Property id for listing verification" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" placeholder="Add any details that help the reviewer." />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Documents
        <input type="file" multiple onChange={(event) => setFiles(event.target.files)} className="mt-1 block w-full text-sm" />
      </label>
      <button disabled={busy} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit verification request'}
      </button>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {feedback && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p>}
    </form>
  );
}
