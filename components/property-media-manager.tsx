'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { VISUAL_UPLOAD_ACCEPT, validateVisualUpload } from '@/lib/property-media-upload';

type MediaItem = { id: string; fileName: string | null; type: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; isCover: boolean; url?: string };

export function PropertyMediaManager({ propertyId, media, canUpload = false }: { propertyId: string; media: MediaItem[]; canUpload?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState<{ name: string; error?: string }[]>([]);

  async function uploadOne(file: File) {
    const signResponse = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: { kind: 'property', propertyId, mediaScope: 'visual' }, fileName: file.name, mimeType: file.type, size: file.size }),
    });
    const signed = await signResponse.json();
    if (!signResponse.ok) throw new Error(typeof signed.error === 'string' ? signed.error : 'Could not authorize the upload.');
    const form = new FormData();
    form.set('file', file);
    form.set('api_key', signed.data.apiKey);
    form.set('timestamp', String(signed.data.timestamp));
    form.set('folder', signed.data.folder);
    form.set('public_id', signed.data.publicId);
    form.set('overwrite', 'false');
    form.set('signature', signed.data.signature);
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signed.data.cloudName}/${signed.data.resourceType}/upload`, { method: 'POST', body: form });
    const uploaded = await uploadResponse.json();
    if (!uploadResponse.ok || !uploaded.secure_url) throw new Error('The media upload failed.');
    const attach = await fetch(`/api/properties/${propertyId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: signed.data.ticket, fileName: file.name, mimeType: file.type, size: file.size, secureUrl: uploaded.secure_url, publicId: uploaded.public_id, resourceType: signed.data.resourceType, mediaScope: 'visual' }),
    });
    const attached = await attach.json();
    if (!attach.ok) throw new Error(typeof attached.error === 'string' ? attached.error : 'Could not attach the uploaded file.');
  }

  async function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    setUploading(true);
    setResults([]);
    const outcome: { name: string; error?: string }[] = [];
    for (const [index, file] of files.entries()) {
      setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
      const invalid = validateVisualUpload(file);
      if (invalid) {
        outcome.push({ name: file.name, error: invalid });
        continue;
      }
      try {
        await uploadOne(file);
        outcome.push({ name: file.name });
      } catch (uploadError) {
        outcome.push({ name: file.name, error: uploadError instanceof Error ? uploadError.message : 'Upload failed.' });
      }
    }
    setResults(outcome);
    setProgress('');
    setUploading(false);
    if (outcome.some((item) => !item.error)) router.refresh();
  }

  async function update(mediaId: string, method: 'PATCH' | 'DELETE') {
    setPendingId(mediaId);
    setError('');
    try {
      const response = await fetch(`/api/properties/${propertyId}/media/${mediaId}`, { method });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not update property media.');
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update property media.');
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Manage listing media</h3>
      {canUpload && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <label className="block text-sm font-semibold text-slate-700">Add photos or videos
            <input type="file" multiple accept={VISUAL_UPLOAD_ACCEPT} disabled={uploading} onChange={(event) => void handleFiles(event)} className="mt-2 block w-full text-sm disabled:opacity-50" />
          </label>
          <p className="mt-1 text-xs text-slate-500">JPEG, PNG, WebP, AVIF up to 20 MB · MP4, WebM, MOV up to 200 MB. Documents are not accepted here.</p>
          {uploading && <p role="status" className="mt-2 text-sm text-slate-700">{progress}</p>}
          {results.length > 0 && <ul className="mt-2 space-y-1 text-sm" role="status">
            {results.map((item, index) => <li key={`${item.name}-${index}`} className={item.error ? 'text-red-700' : 'text-emerald-700'}>{item.error ? `${item.name}: ${item.error}` : `${item.name} uploaded.`}</li>)}
          </ul>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {media.length === 0 ? <p className="mt-3 text-sm text-slate-500">No listing media has been uploaded yet.</p> : (
      <ul className="mt-3 space-y-2">
        {media.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{item.fileName ?? item.type}{item.isCover ? ' · Cover image' : ''}</span>
          <div className="flex gap-2">
            {item.type === 'DOCUMENT' && <a href={`/api/properties/${propertyId}/media/${item.id}/document`} className="text-xs font-semibold text-emerald-700">Open securely</a>}
            {item.type !== 'DOCUMENT' && item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700">Preview</a>}
            {item.type === 'IMAGE' && !item.isCover && <button disabled={pendingId === item.id} onClick={() => void update(item.id, 'PATCH')} className="text-xs font-semibold text-emerald-700 disabled:opacity-50">Set cover</button>}
            <button disabled={pendingId === item.id} onClick={() => void update(item.id, 'DELETE')} className="text-xs font-semibold text-red-700 disabled:opacity-50">Delete</button>
          </div>
        </li>)}
      </ul>
      )}
    </section>
  );
}
