'use client';

import React, { useMemo, useState, useRef } from 'react';
import { marked } from 'marked';

type Locale = 'zh' | 'en';

type AnalyzePanelProps = {
  locale?: Locale;                 // pass from page.tsx: <AnalyzePanel locale={locale} />
  grid?: unknown;                  // optional; kept to match your current usage
  players?: unknown;               // optional
  teamName?: string;               // optional
};

const LABELS: Record<Locale, Record<string, string>> = {
  en: {
    title: 'AI Game Report',
    generate: 'Generate',
    uploadJson: 'Upload exported JSON',
    loaded: 'Loaded',
    noFile: 'No file selected',
    chars: 'chars',
    notesLabel: 'Optional notes / context',
    notesPH: 'Opponent, venue, weather, injuries, key matchups…',
    previewLabel: 'Preview',
    reportLabel: 'Report',
    analyzing: 'Analyzing…',
    mustUpload: 'Please upload a JSON export first.',
    invalidJson: 'That file is not valid JSON.',
    requestFailed: 'Request failed',
    noReport: 'No report returned',
  },
  zh: {
    title: 'AI 比赛报告',
    generate: '生成',
    uploadJson: '上传导出的 JSON',
    loaded: '已载入',
    noFile: '未选择文件',
    chars: '字符',
    notesLabel: '可选备注 / 背景',
    notesPH: '对手、场地、天气、伤病、关键对位…',
    previewLabel: '预览',
    reportLabel: '报告',
    analyzing: '分析中…',
    mustUpload: '请先上传导出的 JSON 文件。',
    invalidJson: '文件不是有效的 JSON。',
    requestFailed: '请求失败',
    noReport: '未生成报告',
  },
};

export default function AnalyzePanel({
  locale = 'en',
  grid: _grid,
  players: _players,
  teamName: _teamName,
}: AnalyzePanelProps) {
  const L = LABELS[locale];

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
      alert(L.invalidJson);
      setJsonText('');
      setFileName('');
    } finally {
      // allow reselecting the same file
      if (fileRef.current) fileRef.current.value = '';
    }
    
  }

  const fileRef = useRef<HTMLInputElement | null>(null);

  // src/app/AnalyzePanel.tsx (only the analyze() change shown)
  async function analyze() {
    if (!jsonText) {
      alert(L.mustUpload);
      return;
    }
    setLoading(true);
    setReport('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonText, notes, locale }), // 👈 include locale
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === 'object' && data !== null && 'error' in data
            ? String((data as Record<string, unknown>).error)
            : L.requestFailed;
        throw new Error(msg);
      }
      const r =
        typeof data === 'object' &&
        data !== null &&
        'report' in data &&
        typeof (data as Record<string, unknown>).report === 'string'
          ? (data as Record<string, unknown>).report as string
          : L.noReport;
      setReport(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setReport(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }


  const rendered = useMemo(
    () => (report ? (marked.parse(report) as string) : ''),
    [report]
  );

  return (
    <section className="bg-white border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{L.title}</h2>
        <button
          onClick={analyze}
          disabled={!jsonText || loading}
          className="px-3 py-1.5 rounded-md text-white bg-black disabled:opacity-40"
        >
          {loading ? L.analyzing : L.generate}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">{L.uploadJson}</label>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFile}
            className="border rounded-md p-2 text-sm bg-white"
          />

          <div className="text-xs text-gray-500 mt-2">
            {fileName ? (
              <>
                {L.loaded}: <span className="font-medium">{fileName}</span>{' '}
                ({jsonText.length.toLocaleString()} {L.chars})
              </>
            ) : (
              L.noFile
            )}
          </div>

          {/* Optional read-only preview */}
          {jsonText && (
            <textarea
              readOnly
              value={jsonText}
              className="mt-2 min-h-[140px] border rounded-md p-2 font-mono text-xs bg-gray-50"
              aria-label={L.previewLabel}
            />
          )}
        </div>

        <div className="flex flex-col">
          <label className="text-sm font-medium mb-1">{L.notesLabel}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={L.notesPH}
            className="min-h-[180px] border rounded-md p-2 text-sm"
          />
        </div>
      </div>

      {/* Markdown output */}
      <div className="mt-4">
        <label className="text-sm font-medium mb-1 block">{L.reportLabel}</label>
        <div
          className="prose prose-sm max-w-none border rounded-md p-3 min-h-[160px]"
          dangerouslySetInnerHTML={{ __html: rendered || '—' }}
        />
        {loading && <p className="text-sm text-gray-500 mt-2">{L.analyzing}</p>}
      </div>
    </section>
  );
}
