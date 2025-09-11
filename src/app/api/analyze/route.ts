// src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';          // ensure Node runtime (env + libs work)
export const dynamic = 'force-dynamic';   // don't cache results

// openai url and safeguard
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_BYTES = 2_000_000; // ~2MB guard

// body is the uploaded json file, notes, and locale which is the language switch
type Body = {
  jsonText?: string;
  notes?: string;
  locale?: 'en' | 'zh';
};

// request to get api response
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    // if there are no api key then show error message
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Missing OPENAI_API_KEY on server. Add it in Vercel → Project → Settings → Environment Variables.' },
        { status: 500 }
      );
    }

    // wait for json request and take the body object input with the file, notes, and language
    const { jsonText, notes = '', locale = 'en' } = (await req.json()) as Body;

    // if the json texts aren't string, trim the non json file content and return error because the file is not json
    if (typeof jsonText !== 'string' || !jsonText.trim()) {
      return NextResponse.json({ error: 'Missing or empty jsonText' }, { status: 400 });
    }
    // here, if json file is too large it cannot be used
    if (new Blob([jsonText]).size > MAX_BYTES) {
      return NextResponse.json({ error: 'JSON is too large' }, { status: 413 });
    }

    // Validate JSON early so we can show a friendly error
    try {
      JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON provided.' }, { status: 400 });
    }

    // the prompt part for the ai, the specific command for the language uses locale to switch between Chinese and English
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

    // contains the json text and notes where if there are no notes than the notes are ''
    // the json text and extra notes are split by blocks and this gets send to openai api as well with text for ai to understand better
    // each element in the array is joined by a new line, essentially
    const user = [
      '<scorecard-json>',
      jsonText,
      '</scorecard-json>',
      '',
      '<extra-notes>',
      (notes ?? '').toString(),
      '</extra-notes>',
    ].join('\n');

    // this defines what model is being used for ai analysis, as well as temperature and message
    // model temperature of 0.3 means it is deterministic and provides correct and consistent but less creative results
    const body = {
      model: 'gpt-4o-mini', // cost-effective, good quality
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };

    // this waits for the fetching of the openai url and creates the authorization through using the api key
    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // if there's an error with the response above, return the openai error and status 502
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return NextResponse.json(
        { error: `OpenAI error: ${errText || resp.statusText}` },
        { status: 502 }
      );
    }

    // data is the response we just got
    const data = await resp.json();
    // content is the report part of the data
    // if data is null, return message
    // if choices exist, return the first element
    // go down the levels, so check whether message and content exists, and if they all do, trim to remove whitespace
    const content: string =
      data?.choices?.[0]?.message?.content?.trim() || 'No content returned by the model.';

    
    // return the json report generated
    // return any error that occured
    return NextResponse.json({ report: content });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
