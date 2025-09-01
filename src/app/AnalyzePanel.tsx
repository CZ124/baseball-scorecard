'use client';

import React, { useMemo, useState } from 'react';
import { marked } from 'marked';

// optional: calmer defaults
marked.setOptions({ mangle: false, headerIds: false });

export default function AnalyzePanel() {
  const [jsonText, setJsonText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      JSON.parse(text); // quick validity check
      setJsonText(text);
      setFileName(f.name);
    } catch {
      alert('That file is not valid JSON.');
      setJsonText('');
      setFileName('');
    } finally {
      e.target.value = ''; // allow reselecting same file
    }
  }

  async function analyze() {
    if (!jsonText) {
      alert('Please upload a JSON export first.');
      return;
    }
    setLoading(true);
    setReport('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonText, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Request failed');
      setReport(data.report || 'No report returned');
    } catch (e: any) {
      setReport(`Error: ${e.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  // convert markdown → html once per change
  const rendered = useMemo(() => marked.parse(report || ''), [report]);

  return (
    <section className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">AI Game Report</h2>
        <button
          onClick={analyze}
          disabled={!jsonText || loading}
          className="px-3 py-1.5 rounded-md text-white bg-black disabled:opacity-40"
        >
          {loading ? 'Analyzing…' : 'Generate'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Upload exported JSON</label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
            className="border rounded-md p-2 text-sm bg-white"
          />
          <div className="text-xs text-gray-500 mt-2">
            {fileName
              ? <>Loaded: <span className="font-medium">{fileName}</span> ({jsonText.length.toLocaleString()} chars)</>
              : 'No file selected'}
          </div>

          {/* Optional read-only preview */}
          {jsonText && (
            <textarea
              readOnly
              value={jsonText}
              className="mt-2 min-h-[140px] border rounded-md p-2 font-mono text-xs bg-gray-50"
            />
          )}
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">Optional notes / context</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Opponent, venue, weather, injuries, key matchups…"
            className="min-h-[180px] border rounded-md p-2 text-sm"
          />
        </div>
      </div>

      {/* Markdown output */}
      <div className="mt-4">
        <label className="text-sm font-medium mb-1 block">Report</label>
        <div
          className="prose prose-sm max-w-none border rounded-md p-3 min-h-[160px]"
          dangerouslySetInnerHTML={{ __html: rendered || '—' as any }}
        />
        {loading && <p className="text-sm text-gray-500 mt-2">Analyzing…</p>}
      </div>
    </section>
  );
}
