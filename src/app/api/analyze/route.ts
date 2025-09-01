import { NextRequest, NextResponse } from 'next/server';

// If you prefer Edge runtime, uncomment the next line
// export const runtime = 'edge';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Small guard to avoid giant payloads
const MAX_BYTES = 2_000_000; // ~2MB

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing OPENAI_API_KEY on server' }, { status: 500 });
    }

    const { jsonText, notes } = await req.json();

    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return NextResponse.json({ error: 'Missing or empty jsonText' }, { status: 400 });
    }
    if (new Blob([jsonText]).size > MAX_BYTES) {
      return NextResponse.json({ error: 'JSON is too large' }, { status: 413 });
    }

    const system = [
      'You are a meticulous baseball analyst.',
      'Given a single-game scorecard JSON, produce a concise, insightful report.',
      'Include: team overview, inning-by-inning scoring, standout players, basic per-batter stats if derivable (R, AB, H, RBI, BB, K), and notable moments.',
      'If some stats are not present or derivable, say so briefly—do not invent data.',
      'Use short sections with headers and bullet points where helpful.',
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
      model: 'gpt-4o-mini', // solid + cost-effective; change if you prefer
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
      return NextResponse.json({ error: `OpenAI error: ${errText || resp.statusText}` }, { status: 502 });
    }

    const data = await resp.json();
    const content =
      data?.choices?.[0]?.message?.content ||
      'No content returned by the model.';

    return NextResponse.json({ report: content });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
