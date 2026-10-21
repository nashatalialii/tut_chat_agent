'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { getAdminToken, setAdminToken } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

export function KnowledgeAdmin() {
  const [savedToken, setSavedToken] = useState(() => getAdminToken());
  const [token, setToken] = useState(() => getAdminToken());
  const [file, setFile] = useState<File | null>(null);
  const [selectedUploadId, setSelectedUploadId] = useState('');
  const [status, setStatus] = useState('');
  const [meta, setMeta] = useState({
    document_title: '', document_type: 'law', law_number: '', law_year: '', source_name: '', source_url: '', version: '', source_status: 'verified', is_current: true
  });

  const stats = trpc.knowledge.stats.useQuery(undefined, { enabled: Boolean(savedToken) });
  const uploads = trpc.upload.list.useQuery(undefined, { enabled: Boolean(savedToken) });
  const create = trpc.upload.create.useMutation();
  const pushChunk = trpc.upload.pushChunk.useMutation();
  const complete = trpc.upload.complete.useMutation();
  const publish = trpc.upload.publish.useMutation();
  const reject = trpc.upload.reject.useMutation();

  function saveToken() {
    setAdminToken(token);
    setSavedToken(token.trim());
    setStatus('تم حفظ التوكن لهذه الجلسة في المتصفح.');
  }

  async function uploadFile() {
    if (!file) return;
    setStatus('جاري رفع الملف إلى منطقة الحجر...');
    try {
      const created = await create.mutateAsync({ filename: file.name, totalBytes: file.size });
      const chunkSize = 512 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const base64 = await blobToBase64(file.slice(offset, Math.min(offset + chunkSize, file.size)));
        await pushChunk.mutateAsync({ uploadId: created.uploadId, base64 });
      }
      await complete.mutateAsync({ uploadId: created.uploadId });
      setSelectedUploadId(created.uploadId);
      setStatus('اكتمل التحقق. الملف Pending Review ولم يدخل قاعدة المعرفة بعد.');
      await uploads.refetch();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'فشل الرفع');
    }
  }

  async function publishSelected() {
    if (!selectedUploadId || !meta.source_name.trim()) return;
    setStatus('جاري نشر المستند المراجع...');
    try {
      await publish.mutateAsync({
        uploadId: selectedUploadId,
        metadata: {
          document_type: meta.document_type as 'law' | 'regulation' | 'amendment' | 'decision' | 'other',
          source_name: meta.source_name.trim(),
          source_status: meta.source_status as 'official' | 'verified',
          is_current: meta.is_current,
          ...(meta.document_title.trim() ? { document_title: meta.document_title.trim() } : {}),
          ...(meta.law_number.trim() ? { law_number: meta.law_number.trim() } : {}),
          ...(meta.law_year.trim() ? { law_year: meta.law_year.trim() } : {}),
          ...(meta.source_url.trim() ? { source_url: meta.source_url.trim() } : {}),
          ...(meta.version.trim() ? { version: meta.version.trim() } : {})
        }
      });
      setStatus('تم النشر وتحديث إصدار قاعدة المعرفة.');
      await Promise.all([uploads.refetch(), stats.refetch()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'فشل النشر');
    }
  }

  async function rejectUpload(uploadId: string) {
    try {
      await reject.mutateAsync({ uploadId, reason: 'Rejected by knowledge-base administrator from admin UI.' });
      await uploads.refetch();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'فشل الرفض');
    }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black">إدارة قاعدة المعرفة القانونية</h1>
        <p className="text-sm text-muted-foreground">الرفع لا ينشر أي مستند تلقائيًا. راجع المصدر والـmetadata قبل النشر.</p>
      </div>

      <Card className="space-y-3 p-4">
        <label className="text-sm font-bold">Admin API Token</label>
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(event) => setToken(event.target.value)} className="min-w-0 flex-1 rounded-xl border px-3 py-2" />
          <Button type="button" onClick={saveToken}>حفظ للجلسة</Button>
        </div>
        {stats.data ? <p className="text-sm">KB: {stats.data.knowledgeBaseVersion} · مستندات: {stats.data.documents} · Chunks: {stats.data.keywordChunks} · Pending: {stats.data.pendingReview}</p> : null}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-bold">1) رفع إلى Quarantine</h2>
        <input type="file" accept=".pdf,.md,.txt,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <Button type="button" disabled={!file || create.isPending || pushChunk.isPending || complete.isPending} onClick={uploadFile}>رفع وفحص الاستخراج</Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-bold">2) الملفات قيد المراجعة</h2>
        <div className="space-y-2">
          {(uploads.data ?? []).map((upload) => (
            <div key={upload.uploadId} className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
              <span className="font-mono text-xs">{upload.uploadId}</span>
              <span>{upload.filename}</span>
              <span className="rounded bg-slate-100 px-2 py-1">{upload.status}</span>
              {upload.status === 'pending_review' ? <Button type="button" onClick={() => setSelectedUploadId(upload.uploadId)}>اختيار للنشر</Button> : null}
              {upload.status === 'pending_review' ? <Button type="button" className="bg-slate-900" onClick={() => rejectUpload(upload.uploadId)}>رفض</Button> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-bold">3) Metadata والنشر</h2>
        <p className="text-xs text-muted-foreground">Upload ID: {selectedUploadId || 'اختر ملفًا Pending Review أولًا'}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <input placeholder="اسم الوثيقة" value={meta.document_title} onChange={(e) => setMeta({ ...meta, document_title: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input placeholder="اسم المصدر المراجع *" value={meta.source_name} onChange={(e) => setMeta({ ...meta, source_name: e.target.value })} className="rounded-xl border px-3 py-2" />
          <select value={meta.document_type} onChange={(e) => setMeta({ ...meta, document_type: e.target.value })} className="rounded-xl border px-3 py-2">
            <option value="law">law</option><option value="regulation">regulation</option><option value="amendment">amendment</option><option value="decision">decision</option><option value="other">other</option>
          </select>
          <select value={meta.source_status} onChange={(e) => setMeta({ ...meta, source_status: e.target.value })} className="rounded-xl border px-3 py-2">
            <option value="verified">verified</option><option value="official">official</option>
          </select>
          <input placeholder="رقم القانون (إن كان موثقًا)" value={meta.law_number} onChange={(e) => setMeta({ ...meta, law_number: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input placeholder="سنة القانون (إن كانت موثقة)" value={meta.law_year} onChange={(e) => setMeta({ ...meta, law_year: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input placeholder="Source URL" value={meta.source_url} onChange={(e) => setMeta({ ...meta, source_url: e.target.value })} className="rounded-xl border px-3 py-2" />
          <input placeholder="Version" value={meta.version} onChange={(e) => setMeta({ ...meta, version: e.target.value })} className="rounded-xl border px-3 py-2" />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={meta.is_current} onChange={(e) => setMeta({ ...meta, is_current: e.target.checked })} /> الإصدار الحالي</label>
        <Button type="button" disabled={!selectedUploadId || !meta.source_name.trim() || publish.isPending} onClick={publishSelected}>نشر في قاعدة المعرفة</Button>
      </Card>

      {status ? <p className="rounded-xl border bg-white p-3 text-sm">{status}</p> : null}
    </main>
  );
}
