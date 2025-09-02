// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';          // ensure Node runtime (env + libs work)
export const dynamic = 'force-dynamic';   // don't cache results

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_BYTES = 2_000_000; // ~2MB guard

type Body = {
  jsonText?: string;
  notes?: string;
  locale?: 'en' | 'zh';
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY on server. Add it in Vercel → Project → Settings → Environment Variables.' },
        { status: 500 }
      );
    }

    const { jsonText, notes = '', locale = 'en' } = (await req.json()) as Body;

    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return NextResponse.json({ error: 'Missing or empty jsonText' }, { status: 400 });
    }
    if (new Blob([jsonText]).size > MAX_BYTES) {
      return NextResponse.json({ error: 'JSON is too large' }, { status: 413 });
    }

    // Validate JSON early so we can show a friendly error
    try {
      JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON provided.' }, { status: 400 });
    }

    const languageHint =
      locale === 'zh'
        ? '你必须使用简体中文撰写整份报告，避免中英文混杂。'
        : 'Write the entire report in clear, concise English.';

    const system = [
      'You are a meticulous baseball analyst.',
      'Given a single-game scorecard JSON, produce a concise, insightful markdown report.',
      'Include: team overview, inning-by-inning scoring, standout players, basic per-batter stats if derivable (R, AB, H, RBI, BB, K), and notable moments.',
      'If some stats are not present or derivable, say so briefly—do not invent data.',
      'Use short sections with headers and bullet points where helpful.',
      languageHint,
    ].join(' ');

    const user = [
      '<scorecard-json>',
      jsonText,
      '</scorecard-json>',
      '',
      '<extra-notes>',
      (notes ?? '').toString(),
      '</extra-notes>',
    ].join('\n');

    const body = {
      model: 'gpt-4o-mini', // cost-effective, good quality
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return NextResponse.json(
        { error: `OpenAI error: ${errText || resp.statusText}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const content: string =
      data?.choices?.[0]?.message?.content?.trim() || 'No content returned by the model.';

    return NextResponse.json({ report: content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
