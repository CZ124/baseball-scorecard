'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AnalyzePanel from './AnalyzePanel';

// --- Types ---
type RunKind = 'hit' | 'advance' | 'error' | 'award'; 
type RunSeg = {
  from: 0 | 1 | 2 | 3;
  to: 1 | 2 | 3 | 4;
  kind: RunKind;
  byBatter?: number;
  note?: string;
  paIndex?: number;
  award?: 'Walk' | 'HBP';   
};

type PitchMark = 'B' | 'CS' | 'SS' | 'F' | 'D'; // Ball, Called Strike, Swinging Strike, Foul, Dead ball

const PITCH_SYMBOL: Record<PitchMark, string> = {
  B: '—',   // ball
  CS: '◯',  // called strike
  SS: '⦵',  // swinging strike
  F: '△',   // foul
  D: 'D',   // dead ball
};

type Outcome =
  | '—'
  | 'In Play'
  | 'Walk'
  | 'HBP'
  | 'K'
  | '1B'
  | '2B'
  | '3B'
  | 'HR'
  | 'Out';
  

type Cell = {
  pitchSeq?: PitchMark[];
  outcome?: Outcome;
  bases?: 0 | 1 | 2 | 3 | 4;
  outs?: 0 | 1 | 2 | 3;
  pathColor?: 'black' | 'red';
  notes?: string;
  runs?: RunSeg[];
};

type Player = {
  name: string;
  number?: string;
  position?: string;
};

const DEFAULT_PLAYERS: Player[] = [
  { name: 'Leadoff', number: '2', position: 'CF' },
  { name: 'Two-Hole', number: '7', position: 'SS' },
  { name: 'Three-Hole', number: '10', position: '1B' },
  { name: 'Cleanup', number: '23', position: '3B' },
  { name: 'Five', number: '9', position: 'LF' },
  { name: 'Six', number: '15', position: 'RF' },
  { name: 'Seven', number: '4', position: '2B' },
  { name: 'Eight', number: '12', position: 'C' },
  { name: 'Nine', number: '31', position: 'P' },
];

const INNINGS = Array.from({ length: 9 }, (_, i) => i + 1);

function makeEmptyRow(): Required<Cell>[] {
  return INNINGS.map(() => ({
    pitchSeq: [],
    outcome: '—',
    bases: 0,
    outs: 0,
    pathColor: 'black',
    notes: '',
    runs: [],              // 👈 add this
  }));
}

// --- Storage helpers ---
function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Normalize any loaded grid (migrate old shapes to new)
function normalizeCell(c: any): Required<Cell> {
  const pitchSeq: PitchMark[] = Array.isArray(c?.pitchSeq) ? c.pitchSeq : [];
  const outcome: Outcome = (c?.outcome as Outcome) ?? '—';
  const bases: 0 | 1 | 2 | 3 | 4 = (typeof c?.bases === 'number' ? c.bases : 0) as 0 | 1 | 2 | 3 | 4;
  const outs: 0 | 1 | 2 | 3 = (typeof c?.outs === 'number' ? c.outs : 0) as 0 | 1 | 2 | 3;
  const pathColor: 'black' | 'red' = c?.pathColor === 'red' ? 'red' : 'black';
  const notes: string = typeof c?.notes === 'string' ? c.notes : '';
  const runs: RunSeg[] = Array.isArray(c?.runs) ? c.runs : [];
  return { pitchSeq, outcome, bases, outs, pathColor, notes, runs };
}

function normalizeGrid(g: any, rows: number): Required<Cell>[][] {
  const grid: Required<Cell>[][] = Array.isArray(g) ? g : [];
  const out: Required<Cell>[][] = [];
  for (let r = 0; r < rows; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    const normalizedRow: Required<Cell>[] = INNINGS.map((_, c) => normalizeCell(row[c]));
    out.push(normalizedRow);
  }
  return out;
}

// --- UI bits ---
function PitchTracker({ seq, onChange }: { seq?: PitchMark[]; onChange: (s: PitchMark[]) => void }) {
  const safe = Array.isArray(seq) ? seq : [];

  const add = (m: PitchMark) => {
    onChange([...safe, m]);
  };

  const setDragData = (e: React.DragEvent, data: Record<string, string>) => {
    Object.entries(data).forEach(([k, v]) => e.dataTransfer.setData(k, v));
    e.dataTransfer.effectAllowed = "copyMove";
  };

  
  const getDragData = (e: React.DragEvent) => {
    const from = e.dataTransfer.getData("source");
    const pitch = e.dataTransfer.getData("pitch") as PitchMark | "";
    const indexRaw = e.dataTransfer.getData("seqIndex");
    const seqIndex = indexRaw ? Number(indexRaw) : -1;
    return { from, pitch, seqIndex };
  };

  const replaceAt = (idx: number, m: PitchMark) => {
    const next = [...safe];
    next[idx] = m;
    onChange(next);
  };

  const swap = (a: number, b: number) => {
    if (a === b || a < 0 || b < 0) return;
    const next = [...safe];
    [next[a], next[b]] = [next[b], next[a]];
    onChange(next);
  };

  const balls = safe.filter((m) => m === 'B').length;
  const cs = safe.filter((m) => m === 'CS').length;   // called strikes
  const ss = safe.filter((m) => m === 'SS').length;   // swinging strikes
  const fouls = safe.filter((m) => m === 'F').length; // fouls
  const dead = safe.filter((m) => m === 'D').length;  // dead ball
  const total = safe.length;


  return (
    <div className="flex flex-col gap-2">
      {/* Buttons row */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => add('B')}
          draggable
          onDragStart={(e) => setDragData(e, { source: 'palette', pitch: 'B' })}
          className="px-2 py-1 rounded-md border bg-green-100 hover:bg-green-200"
          title="Ball (—)"
        >
          {PITCH_SYMBOL.B}
        </button>
        <button
          onClick={() => add('CS')}
          draggable
          onDragStart={(e) => setDragData(e, { source: 'palette', pitch: 'CS' })}
          className="px-2 py-1 rounded-md border bg-red-100 hover:bg-red-200"
          title="Called Strike (◯)"
        >
          {PITCH_SYMBOL.CS}
        </button>
        <button
          onClick={() => add('SS')}
          draggable
          onDragStart={(e) => setDragData(e, { source: 'palette', pitch: 'SS' })}
          className="px-2 py-1 rounded-md border bg-red-100 hover:bg-red-200"
          title="Swinging Strike (⦵)"
        >
          {PITCH_SYMBOL.SS}
        </button>
        <button
          onClick={() => add('F')}
          draggable
          onDragStart={(e) => setDragData(e, { source: 'palette', pitch: 'F' })}
          className="px-2 py-1 rounded-md border bg-yellow-100 hover:bg-yellow-200"
          title="Foul (△)"
        >
          {PITCH_SYMBOL.F}
        </button>
        <button
          onClick={() => add('D')}
          draggable
          onDragStart={(e) => setDragData(e, { source: 'palette', pitch: 'D' })}
          className="px-2 py-1 rounded-md border bg-blue-100 hover:bg-blue-200"
          title="Dead Ball (D)"
        >
          {PITCH_SYMBOL.D}
        </button>
      </div>

      {/* Pitch count */}
      <div className="text-xs text-gray-600">
        Pitches: <span className="font-semibold">{total}</span>
        <span className="ml-2">B:{balls}</span>
        <span className="ml-2">CS:{cs}</span>
        <span className="ml-2">SS:{ss}</span>
        <span className="ml-2">F:{fouls}</span>
        <span className="ml-2">D:{dead}</span>
      </div>


      {/* Sequence display */}
      <div className="flex items-center gap-1 text-base">
        {safe.length === 0 ? (
          <span className="text-gray-400">No pitches yet</span>
        ) : (
          safe.map((m, i) => (
            <button
              key={i}
              onClick={() => {
                const next = [...safe];
                next.splice(i, 1);
                onChange(next);
              }}
              draggable
              onDragStart={(e) => setDragData(e, { source: 'seq', pitch: m, seqIndex: String(i) })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const { from, pitch, seqIndex } = getDragData(e);
                if (from === 'palette' && pitch) {
                  replaceAt(i, pitch);
                } else if (from === 'seq' && seqIndex >= 0) {
                  swap(seqIndex, i);
                }
              }}
              className="inline-flex items-center justify-center w-6 h-6 border rounded bg-white hover:bg-blue-50 cursor-pointer"
              title="Click to remove • Drag here to replace/swap"
            >
              {PITCH_SYMBOL[m]}
            </button>
          ))
        )}
      </div>

      {/* <div className="text-[11px] text-gray-500">
        Legend: {PITCH_SYMBOL.B} ball · {PITCH_SYMBOL.CS} called strike · {PITCH_SYMBOL.SS} swinging strike · {PITCH_SYMBOL.F} foul · {PITCH_SYMBOL.D} dead ball
      </div> */}
    </div>
  );
}

function OutcomeSelect({ value, onChange }: { value?: Outcome; onChange: (v: Outcome) => void }) {
  const val = (value ?? '—') as Outcome;
  const opts: Outcome[] = ['—', 'In Play', 'Walk', 'HBP', 'K', '1B', '2B', '3B', 'HR', 'Out'];
  return (
    <select value={val} onChange={(e) => onChange(e.target.value as Outcome)} className="border rounded-md px-2 py-1 text-sm">
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Diamond
function Diamond({
  bases,
  runs,
  batterNumber,
  onAddRun,
  onResetRuns,
  onSelectRun,               
}: {
  bases?: 0 | 1 | 2 | 3 | 4;
  runs?: RunSeg[];
  batterNumber: number;
  onAddRun: (kind: RunKind, meta?: { byBatter?: number; note?: string }) => void;
  onResetRuns?: () => void;
  onSelectRun?: (index: number) => void;  
}) {
  const [pendingCause, setPendingCause] = useState<number | null>(null);
  const [pendingUntil, setPendingUntil] = useState<number>(0);
  const b = (typeof bases === 'number' ? bases : 0) as 0 | 1 | 2 | 3 | 4;
  const [pendingAward, setPendingAward] = useState<'Walk' | 'HBP' | null>(null);
  const [awardUntil, setAwardUntil] = useState(0);


  const corner = (base: 0 | 1 | 2 | 3 | 4): [number, number] =>
    base === 0 ? [50, 95] : base === 1 ? [95, 50] : base === 2 ? [50, 5] : base === 3 ? [5, 50] : [50, 95];

  const cornersBetween = (from: 0 | 1 | 2 | 3, to: 1 | 2 | 3 | 4): [number, number][] => {
    const order: (0 | 1 | 2 | 3 | 4)[] = [0, 1, 2, 3, 4];
    const pts: [number, number][] = [];
    let cur = from;
    while (cur !== to) {
      pts.push(corner(cur));
      const idx = order.indexOf(cur);
      cur = order[idx + 1] as 0 | 1 | 2 | 3;
    }
    pts.push(corner(to));
    return pts;
  };

  const strokePropsFor = (kind: RunKind) =>
    kind === 'hit'
      ? { stroke: '#dc2626', dash: undefined, marker: 'url(#arrow-red)' }
      : kind === 'advance'
      ? { stroke: '#111827', dash: undefined, marker: 'url(#arrow-black)' }
      : kind === 'error'
      ? { stroke: '#6b7280', dash: undefined, marker: 'url(#arrow-gray)' }
      : { stroke: '#111827', dash: '3 3', marker: 'url(#arrow-black)' }; // 👈 award = dotted black
  

  const midOf = (pts: [number, number][]) => {
    const a = pts[0], z = pts[pts.length - 1];
    return [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2] as [number, number];
  };

  // press 1–9 to set "cause", then click to add
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        setPendingCause(Number(e.key));
        setPendingUntil(Date.now() + 3000);
      } else if (e.key === 'Escape') {
        setPendingCause(null);
        setPendingUntil(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!pendingCause) return;
    const id = window.setInterval(() => {
      if (Date.now() > pendingUntil) {
        setPendingCause(null);
        setPendingUntil(0);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [pendingCause, pendingUntil]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        setPendingCause(Number(e.key));
        setPendingUntil(Date.now() + 3000);
      } else if (e.key === 'b' || e.key === 'B') {
        setPendingAward('Walk');          // arm Walk for 3s
        setAwardUntil(Date.now() + 3000);
      } else if (e.key === 'h' || e.key === 'H') {
        setPendingAward('HBP');           // arm HBP for 3s
        setAwardUntil(Date.now() + 3000);
      } else if (e.key === 'Escape') {
        setPendingCause(null);
        setPendingUntil(0);
        setPendingAward(null);
        setAwardUntil(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!pendingAward) return;
    const id = window.setInterval(() => {
      if (Date.now() > awardUntil) {
        setPendingAward(null);
        setAwardUntil(0);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [pendingAward, awardUntil]);
  
  

  const handleSvgClick: React.MouseEventHandler<SVGSVGElement> = (e) => {
    e.preventDefault();
  
    if (pendingAward) {
      const cause = pendingCause ?? batterNumber;
      onAddRun('award', { byBatter: cause, note: pendingAward, /* optional */ });
      // clear only the award arm (keep cause if you like)
      setPendingAward(null);
      setAwardUntil(0);
      return;
    }
  
    const kind: RunKind = e.shiftKey ? 'error' : e.ctrlKey ? 'hit' : 'advance';
    const cause = pendingCause ?? batterNumber;
    const meta: { byBatter?: number; note?: string } = { byBatter: cause };
    if (e.altKey) {
      const note = prompt('Note (optional):') || '';
      if (note) meta.note = note;
    }
    onAddRun(kind, meta);
    if (pendingCause) {
      setPendingCause(null);
      setPendingUntil(0);
    }
  };
  

  // midpoint on the *last* leg only (keeps badge off the diamond center)
  const lastLegMid = (from: 0|1|2|3, to: 1|2|3|4): [number, number] => {
    // the leg is from (to-1) -> to
    const startBase = (to - 1) as 0 | 1 | 2 | 3;
    const [x1, y1] = corner(startBase);
    const [x2, y2] = corner(to);
    return [ (x1 + x2) / 2, (y1 + y2) / 2 ];
  };


  return (
    <div className="relative select-none">
      <svg
        viewBox="0 0 100 100"
        className="w-16 h-16"
        onClick={handleSvgClick}
        onContextMenu={(e) => { e.preventDefault(); onResetRuns?.(); }}
      >
        <defs>
          <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 2 2 L 10 5 L 2 8" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id="arrow-black" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 2 2 L 10 5 L 2 8" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <marker id="arrow-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 2 2 L 10 5 L 2 8" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        <polygon points="50,5 95,50 50,95 5,50" className="fill-white stroke-gray-400" strokeWidth="4" />
        {b === 4 && <circle cx="50" cy="50" r="10" fill="#dc2626" />}

        {(runs ?? []).map((seg, idx) => {
        const pts = cornersBetween(seg.from, seg.to);
        const ptsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
        const { stroke, dash, marker } = strokePropsFor(seg.kind);
          <polyline
            points={ptsStr}
            fill="none"
            stroke={stroke}
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={marker}
            strokeDasharray={dash}           // 👈 this line
          />


        // use the midpoint of the LAST leg so badges don’t fall into the diamond center
        const [mx, my] = lastLegMid(seg.from, seg.to); // make sure lastLegMid helper exists

        // ✅ define the badge text here
        const numLabel = typeof seg.byBatter === 'number' ? String(seg.byBatter) : '?';

        return (
          <g key={idx}>
            <polyline
              points={ptsStr}
              fill="none"
              stroke={stroke}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd={marker}
            />
            {/* Batter badge — only stops propagation, doesn't overlay editor */}
            <g
              onClick={(e) => { e.stopPropagation(); onSelectRun?.(idx); }}
              style={{ cursor: 'pointer' }}
            >
              <rect x={mx - 9} y={my - 9} width="18" height="18" rx="4" fill="white" stroke="#9ca3af" />
              <text x={mx} y={my + 0.5} textAnchor="middle" fontSize="10" fill="#111827" dominantBaseline="central">
                {numLabel}
              </text>
            </g>
          </g>
        );
      })}

      </svg>

      <div className="text-[10px] text-gray-600 text-center mt-0.5">
        Cause: <span className="font-medium">{pendingCause ?? batterNumber}</span> <span className="text-gray-400">(press 1–9)</span>
      </div>
    </div>
  );
}




function OutsDots({
  outs,
  onNext,
  onResetFromHereDown,
}: {
  outs: 0 | 1 | 2 | 3;
  onNext: () => void;
  onResetFromHereDown: () => void;
}) {
  return (
    <button
      onClick={onNext}
      onContextMenu={(e) => {
        e.preventDefault();
        onResetFromHereDown();
      }}
      title="Click: record next out • Right-click: reset outs from this batter down"
      className="flex items-center gap-1"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`inline-block w-2.5 h-2.5 rounded-full ${i < outs ? 'bg-gray-800' : 'bg-gray-300'}`}
        />
      ))}
      <span className="ml-1 text-[10px] text-gray-600">{outs === 0 ? '—' : 'I'.repeat(outs)}</span>
    </button>
  );
}

function RunMetaEditor({
  onAdd,
}: {
  onAdd: (kind: RunKind, dist: 1 | 2 | 3 | 4, byBatter?: number, note?: string) => void;
}) {
  const [kind, setKind] = useState<RunKind>('advance');
  const [dist, setDist] = useState<1 | 2 | 3 | 4>(1);
  const [by, setBy] = useState<string>(''); // store as string; coerce on add
  const [note, setNote] = useState<string>('');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="text-xs border rounded px-2 py-1" value={kind} onChange={(e) => setKind(e.target.value as RunKind)}>
        <option value="hit">Hit (red)</option>
        <option value="advance">Advance (black)</option>
        <option value="error">FC/Error (black dashed)</option>
      </select>
      <select className="text-xs border rounded px-2 py-1" value={dist} onChange={(e) => setDist(Number(e.target.value) as 1 | 2 | 3 | 4)}>
        <option value={1}>+1 base</option>
        <option value={2}>+2 bases</option>
        <option value={3}>+3 bases</option>
        <option value={4}>Home (score)</option>
      </select>
      <input className="text-xs border rounded px-2 py-1 w-20" placeholder="by # (opt)" value={by} onChange={(e) => setBy(e.target.value)} />
      <input className="text-xs border rounded px-2 py-1 flex-1 min-w-[140px]" placeholder="note (opt)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button
        className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-100"
        onClick={() => onAdd(kind, dist, by ? Number(by) : undefined, note || undefined)}
      >Add</button>
    </div>
  );
}

function RunComments({
  runs,
  onChangeNote,
}: {
  runs: RunSeg[] | undefined;
  onChangeNote: (index: number, note: string) => void;
}) {
  const list = runs ?? [];
  if (!list.length) return null;
  return (
    <div className="mt-2 border rounded-md p-2 bg-gray-50">
      <div className="text-xs font-medium text-gray-700 mb-1">Run comments</div>
      <div className="flex flex-col gap-2">
        {list.map((seg, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="text-xs text-gray-500 shrink-0 w-28">
              {seg.kind === 'hit' ? 'Hit' : seg.kind === 'advance' ? 'Advance' : 'FC/Error'}
              {' · '}
              {seg.from}→{seg.to}
              {typeof seg.byBatter === 'number' ? ` · by #${seg.byBatter}` : ''}
            </span>
            <input
              value={seg.note ?? ''}
              onChange={(e) => onChangeNote(i, e.target.value)}
              placeholder="Add a note…"
              className="flex-1 text-xs border rounded px-2 py-1 bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function countStrikes(seq: PitchMark[]): number {
  let s = 0;
  for (const m of seq) {
    if (m === 'CS' || m === 'SS') {
      s++;
    } else if (m === 'F') {
      // foul balls count as strikes, but NOT the third strike
      if (s < 2) s++;
    }
    if (s >= 3) return 3;
  }
  return s;
}

function countBalls(seq: PitchMark[]): number {
  // only 'B' counts as a ball here; fouls don't, and 'D' is handled as HBP
  return seq.filter((m) => m === 'B').length;
}

function hasDeadBall(seq: PitchMark[]): boolean {
  return seq.includes('D'); // first D ⇒ HBP
}


// ⭐ Added onResetFromHereDown prop and passed through to OutsDots
function BigCell({
  cell,
  onChange,
  outsDisplay,
  onNextOut,
  disabled,
  onResetFromHereDown,
  batterNumber,                 // 👈 NEW
}: {
  cell: Cell;
  onChange: (c: Required<Cell>) => void;
  outsDisplay: 0 | 1 | 2 | 3;
  onNextOut: () => void;
  disabled?: boolean;
  onResetFromHereDown?: () => void;
  batterNumber: number;         // 👈 NEW
}) {
  const merged: Required<Cell> = {
    pitchSeq: [],
    outcome: '—',
    bases: 0,
    outs: 0,
    pathColor: 'black',
    notes: '',
    runs: [],
    ...cell,
  };

  // capture a quick 1–9 press to set "next caused by batter"
  const byDigitRef = useRef<{ num: number; t: number } | null>(null);
  const [pendingBy, setPendingBy] = useState<number | null>(null);

  // attach a keydown handler to THIS cell so digit+click feels local
  const cellRootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = cellRootRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '1' && e.key <= '9') {
        const num = Number(e.key);
        byDigitRef.current = { num, t: Date.now() };
        setPendingBy(num);
      }
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);

  const onOutcomeChange = (o: Outcome) => {
    const later = (merged.runs ?? []).filter(seg => seg.from > 0);
    const opening = firstRunForOutcome(o, batterNumber);
    const nextRuns = [...opening, ...later];
    const newBases = opening.length ? opening[0].to : merged.bases;
    onChange({ ...merged, outcome: o, runs: nextRuns, bases: newBases });
  };
  
  


  // ✅ keep this ref here (inside BigCell), not in ScorecardPage
  const lastClickRef = useRef<{ t: number; kind: RunKind } | null>(null);

  const hitOutcomeFrom = (to: 1 | 2 | 3 | 4): Outcome =>
    to === 1 ? '1B' : to === 2 ? '2B' : to === 3 ? '3B' : 'HR';
  
  const firstRunForOutcome = (o: Outcome, by: number): RunSeg[] => {
    if (o === '1B' || o === '2B' || o === '3B' || o === 'HR') {
      const to = (o === '1B' ? 1 : o === '2B' ? 2 : o === '3B' ? 3 : 4) as 1 | 2 | 3 | 4;
      return [{ from: 0, to, kind: 'hit', byBatter: by }];
    }
    if (o === 'Walk') {
      return [{ from: 0, to: 1, kind: 'award', byBatter: by, award: 'Walk' }]; // 👈 dotted
    }
    if (o === 'HBP') {
      return [{ from: 0, to: 1, kind: 'award', byBatter: by, award: 'HBP' }]; // 👈 dotted
    }
    return [];
  };
  
  const maybeSyncOutcomeFromRuns = (runs: RunSeg[], prevOutcome: Outcome): Outcome => {
    const first = runs[0];
    if (first && first.from === 0) {
      if (first.kind === 'hit') return hitOutcomeFrom(first.to);
      if (first.kind === 'award') return first.award ?? 'Walk'; // default to Walk if unspecified
    }
    return prevOutcome;
  };
  


  const addRunSegment = (kind: RunKind, meta?: { byBatter?: number; note?: string }) => {
    
  
    const runs = merged.runs ?? [];
    const lastTo = runs.length ? runs[runs.length - 1].to : 0;
    const from = (lastTo <= 3 ? (lastTo as 0 | 1 | 2 | 3) : 3);
    const now = Date.now();
  
    // quick extend same-kind clicks
    const lc = lastClickRef.current;
    if (lc && lc.kind === kind && now - lc.t < 350 && runs.length) {
      const last = runs[runs.length - 1];
      if (last.to === from && last.to < 4) {
        const extended = { ...last, to: (Math.min(4, last.to + 1) as 1 | 2 | 3 | 4) };
        const nextRuns = [...runs.slice(0, -1), extended];
        lastClickRef.current = { t: now, kind };
        const nextOutcome = maybeSyncOutcomeFromRuns(nextRuns, merged.outcome);
        onChange({ ...merged, runs: nextRuns, bases: extended.to, outcome: nextOutcome });
        return;
      }
    }
  
    const to = (Math.min(4, from + 1) as 1 | 2 | 3 | 4);
    const awardType = (kind === 'award' && (meta?.note === 'HBP' ? 'HBP' : 'Walk')) as 'Walk' | 'HBP' | undefined;
  
    const seg: RunSeg = kind === 'award'
      ? { from, to, kind, byBatter: meta?.byBatter, note: meta?.note, award: awardType }
      : { from, to, kind, ...meta };
  
    const nextRuns: RunSeg[] = [...runs, seg];
    lastClickRef.current = { t: now, kind };
  
    const nextOutcome =
      kind === 'hit'
        ? hitOutcomeFrom(to)
        : kind === 'award'
        ? (awardType ?? 'Walk')
        : maybeSyncOutcomeFromRuns(nextRuns, merged.outcome);
  
    onChange({ ...merged, runs: nextRuns, bases: to, outcome: nextOutcome });
  };
  
  

  
  const [editingRunIdx, setEditingRunIdx] = useState<number | null>(null);

  const updateRunNote = (index: number, note: string) => {
    const runs = merged.runs ?? [];
    const next = runs.map((r, i) => (i === index ? { ...r, note } : r));
    onChange({ ...merged, runs: next });
  };

  

  return (
    <div
      className={`bg-white rounded-xl p-2 shadow-sm border flex flex-col gap-2 min-w-[220px] min-w-0`}  // 👈 add min-w-0
    >
      <PitchTracker
        seq={merged.pitchSeq}
        onChange={(seq) => {
          // derive auto outcomes from the *new* seq
          const strikes = countStrikes(seq);
          const balls = countBalls(seq);
          const dead = hasDeadBall(seq);

          let nextOutcome: Outcome | null = null;
          if (strikes >= 3 && merged.outcome !== 'K') {
            nextOutcome = 'K';
          } else if (dead && merged.outcome !== 'HBP') {
            nextOutcome = 'HBP';
          } else if (balls >= 4 && merged.outcome !== 'Walk') {
            nextOutcome = 'Walk';
          }

          // build a single update object
          const update: Required<Cell> = { ...merged, pitchSeq: seq };

          if (nextOutcome === 'HBP' || nextOutcome === 'Walk') {
            // sync dotted opening run 0→1, preserve any later teammate advances
            const later = (merged.runs ?? []).filter(seg => seg.from > 0);
            const opening = firstRunForOutcome(nextOutcome, batterNumber); // returns award 0→1
            update.outcome = nextOutcome;
            update.runs = [...opening, ...later];
            update.bases = opening[0].to;
          } else if (nextOutcome === 'K') {
            update.outcome = 'K';
            // runs/bases unchanged
          }

          // 🚀 single state update prevents dropping the last pitch
          onChange(update);

          // record the out after state is saved (only for K)
          if (nextOutcome === 'K') {
            onNextOut();
          }
        }}
      />



      <div className="flex items-center justify-between">
        <Diamond
          bases={merged.bases}
          runs={merged.runs}
          batterNumber={batterNumber}
          onAddRun={(kind, meta) => addRunSegment(kind, meta)}
          onResetRuns={() => 
            onChange({ ...merged, runs: [], bases: 0, outcome: '—' })
          }

          onSelectRun={(idx) => setEditingRunIdx(idx)}         
        />
        <OutsDots outs={outsDisplay} onNext={onNextOut} onResetFromHereDown={onResetFromHereDown ?? (() => {})} />
        <OutcomeSelect value={merged.outcome} onChange={onOutcomeChange} />
        </div>

      {editingRunIdx !== null && merged.runs?.[editingRunIdx] && (
      <div className="w-full">
        <div className="flex items-center gap-2 w-full">
          {/* label: only show type (no “Run 4 …” or arrows) */}
          <span className="text-xs text-gray-600 shrink-0">
            {merged.runs[editingRunIdx].kind === 'hit'
              ? 'Hit'
              : merged.runs[editingRunIdx].kind === 'advance'
              ? 'Advance'
              : 'FC/Error'}
          </span>

          {/* textbox fills the card width and stays inside */}
          <input
            className="flex-1 w-full text-xs border rounded px-2 py-1 bg-white"
            placeholder="Short note…"
            value={merged.runs[editingRunIdx].note ?? ''}
            onChange={(e) => updateRunNote(editingRunIdx, e.target.value)}
          />

          <button
            className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-100"
            onClick={() => setEditingRunIdx(null)}
            title="Done"
          >
            Done
          </button>
        </div>
      </div>
    )}


      <textarea
        value={merged.notes}
        onChange={(e) => onChange({ ...merged, notes: e.target.value })}
        placeholder="Cell comments (RBI, situation, etc.)"
        className="w-full text-sm border rounded-md p-2 resize-none h-14"
      />
    </div>
  );
}

  




export default function ScorecardPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [teamName, setTeamName] = useState(() => loadFromStorage('teamName', 'My Team'));
  type TeamKey = 'home' | 'away';
  const TEAM_LABEL: Record<TeamKey, string> = { home: 'Home', away: 'Away' };

  // active tab
  const [teamTab, setTeamTab] = useState<TeamKey>('home');

  // use team-scoped storage keys
  const tkey = (k: string) => `${teamTab}:${k}`;

  // save/load the whole team bundle
  const saveTeamToStorage = (team: TeamKey) => {
    const prefix = (k: string) => `${team}:${k}`;
    saveToStorage(prefix('teamName'), teamName);
    saveToStorage(prefix('players'), players);
    saveToStorage(prefix('grid'), grid);
    saveToStorage(prefix('inningOuts'), inningOuts);
  };

  const loadTeamFromStorage = (team: TeamKey) => {
    const prefix = (k: string) => `${team}:${k}`;

    // teamName
    const tn = loadFromStorage(prefix('teamName'), team === 'home' ? 'Home Team' : 'Away Team');
    setTeamName(tn);

    // players (with your migration)
    const storedPlayers = (() => {
      const raw = loadFromStorage<any>(prefix('players'), DEFAULT_PLAYERS);
      if (Array.isArray(raw) && typeof raw[0] === 'string') {
        return (raw as string[]).map((name, i) => ({ name: name.replace(/^\d+\.?\s*/, '') || `Player ${i + 1}` })) as Player[];
      }
      return (raw as Player[]) ?? DEFAULT_PLAYERS;
    })();
    setPlayers(storedPlayers);

    // grid
    const loadedGrid = loadFromStorage(prefix('grid'), storedPlayers.map(() => makeEmptyRow()));
    setGrid(normalizeGrid(loadedGrid, storedPlayers.length));

    // inning outs
    const outs = loadFromStorage(prefix('inningOuts'), Array(INNINGS.length).fill(0));
    setInningOuts(outs);
  };


  // --- Players with jersey number & position ---
  const migratePlayers = (): Player[] => {
    const stored = loadFromStorage<any>('players', DEFAULT_PLAYERS);
    if (Array.isArray(stored) && typeof stored[0] === 'string') {
      return (stored as string[]).map((name, i) => ({ name: name.replace(/^\d+\.?\s*/, '') || `Player ${i + 1}` }));
    }
    return (stored as Player[]) ?? DEFAULT_PLAYERS;
  };
  const [players, setPlayers] = useState<Player[]>(migratePlayers);

  const initialGrid = useMemo(() => players.map(() => makeEmptyRow()), []);
  const [grid, setGrid] = useState<Required<Cell>[][]>(() => normalizeGrid(loadFromStorage('grid', initialGrid), players.length));

  // inherited outs up to row r in inning c
  const outsUpTo = (c: number, r: number): 0 | 1 | 2 | 3 => {
    let last: 0 | 1 | 2 | 3 = 0;
    for (let i = 0; i <= r; i++) {
      const o = grid[i]?.[c]?.outs ?? 0;
      if (o > 0) last = o as 0 | 1 | 2 | 3;
    }
    return last;
  };

  const disabledAfterThirdOut = (c: number, r: number): boolean => {
    const up = outsUpTo(c, r);
    const thisCellOuts = grid[r]?.[c]?.outs ?? 0;
    return up === 3 && thisCellOuts !== 3;
  };

  const resetInning = (c: number) => {
    setInningOuts((prev) => {
      const next = [...prev];
      next[c] = 0;
      return next;
    });

    setGrid((g) => {
      const next = g.map((row) => row.slice());
      for (let r = 0; r < next.length; r++) {
        if (next[r]?.[c]) {
          next[r][c] = { ...next[r][c], outs: 0 };
        }
      }
      return next;
    });
  };

  const recomputeInningOuts = (c: number, g: Required<Cell>[][]): 0 | 1 | 2 | 3 => {
    let maxOuts: 0 | 1 | 2 | 3 = 0;
    for (let r = 0; r < g.length; r++) {
      const o = (g[r]?.[c]?.outs ?? 0) as 0 | 1 | 2 | 3;
      if (o > maxOuts) maxOuts = o;
    }
    return maxOuts;
  };

  const resetOutsFromHereDown = (c: number, startRow: number) => {
    setGrid((g) => {
      const next = g.map((row) => row.slice());
      for (let r = startRow; r < next.length; r++) {
        if (next[r]?.[c]) next[r][c] = { ...next[r][c], outs: 0 };
      }
      const newCount = recomputeInningOuts(c, next);
      setInningOuts((prev) => {
        const arr = [...prev];
        arr[c] = newCount;
        return arr;
      });
      return next;
    });
  };
  
  const [inningOuts, setInningOuts] = useState<number[]>(
    Array(INNINGS.length).fill(0)
  );

  // keep players and grid lengths in sync
  useEffect(() => {
    setGrid((g) => normalizeGrid(g, players.length));
  }, [players.length]);

  

  // persist
  useEffect(() => { if (mounted) saveToStorage(tkey('teamName'), teamName); }, [mounted, teamName, teamTab]);
  useEffect(() => { if (mounted) saveToStorage(tkey('players'), players); }, [mounted, players, teamTab]);
  useEffect(() => { if (mounted) saveToStorage(tkey('grid'), grid); }, [mounted, grid, teamTab]);
  useEffect(() => { if (mounted) saveToStorage(tkey('inningOuts'), inningOuts); }, [mounted, inningOuts, teamTab]);


  useEffect(() => {
    if (!mounted) return;
    // try to load 'home' team state; if nothing saved yet, your current defaults remain
    loadTeamFromStorage('home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);
  

  const resetAll = () => {
    if (confirm('Clear the whole scorecard?')) {
      setGrid(players.map(() => makeEmptyRow()));
    }
  };

  const exportJSON = () => {
    const data = { teamName, players, grid, innings: INNINGS };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${teamName.replace(/\s+/g, '_')}_scorecard.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // track outs for each inning (0..3)
  

  // call this when the dots button is clicked
  const recordOut = (inningIdx: number, batterIdx: number) => {
    const newCount = Math.min(3, (inningOuts[inningIdx] ?? 0) + 1);

    setInningOuts((prev) => {
      const next = [...prev];
      next[inningIdx] = newCount;
      return next;
    });

    setGrid((g) => {
      const next = g.map((row) => row.slice());
      const cell = next[batterIdx][inningIdx] ?? { pitchSeq: [], outcome: '—', bases: 0, outs: 0, pathColor: 'black', notes: '' };
      next[batterIdx][inningIdx] = { ...cell, outs: newCount };
      return next;
    });
  };
    // --- analytics helpers ---
  // what counts as a hit for basic box stats
  const isHit = (o?: Outcome) => o === '1B' || o === '2B' || o === '3B' || o === 'HR';

  // count team runs by inning: any run segment that ends at home (to === 4)
  const inningRuns = useMemo(() => {
    return INNINGS.map((_, c) => {
      let runs = 0;
      for (let r = 0; r < players.length; r++) {
        const cell = grid[r]?.[c];
        const segs = cell?.runs ?? [];
        for (const seg of segs) if (seg.to === 4) runs++;
      }
      return runs;
    });
  }, [grid, players.length]);

  const teamTotals = useMemo(() => {
    const R = inningRuns.reduce((a, b) => a + b, 0);
    // compute team H, BB, K from player stats below
    return { R };
  }, [inningRuns]);

  // per-batter statline
  type BatStats = { ab: number; hits: number; rbi: number; bb: number; k: number };

  const playerStats: BatStats[] = useMemo(() => {
    return players.map((_, r) => {
      let ab = 0, hits = 0, rbi = 0, bb = 0, k = 0;
      const batterNo = r + 1;
  
      for (let c = 0; c < INNINGS.length; c++) {
        const cell = grid[r]?.[c];
  
        // AB: official at-bats (exclude Walk, HBP, and empty "—")
        const outc = cell?.outcome;
        if (outc && outc !== '—' && outc !== 'Walk' && outc !== 'HBP') ab++;
  
        // H / BB / K
        if (outc === '1B' || outc === '2B' || outc === '3B' || outc === 'HR') hits++;
        if (outc === 'Walk') bb++;
        if (outc === 'K') k++;
  
        // ✅ RBI: any runner who scores (to===4) in this inning,
        // credited to THIS batter if seg.byBatter matches their order #
        for (let rr = 0; rr < players.length; rr++) {
          const segs = grid[rr]?.[c]?.runs ?? [];
          for (const seg of segs) {
            if (seg.to === 4 && seg.byBatter === batterNo) {
              rbi++;
            }
          }
        }
      }
  
      return { ab, hits, rbi, bb, k };
    });
  }, [grid, players]);
  
  

  if (!mounted) {
    return <main className="min-h-screen bg-gray-50 p-6" />;
  }   
  


  return (
    <main className="min-h-screen bg-gray-50 p-6 text-blue-800">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold">⚾ Baseball Scorecard</h1>
            <p className="text-gray-600">Pitch symbols, basepath lines (Ctrl+Click toggles red), outs & results per PA.</p>
          </div>
          

          <div className="flex items-center gap-2 flex-wrap">
            {/* Team tabs */}
            <div className="inline-flex rounded-md border bg-white overflow-hidden">
              <button
                onClick={() => { saveTeamToStorage(teamTab); setTeamTab('home'); loadTeamFromStorage('home'); }}
                className={`px-3 py-2 text-sm ${teamTab === 'home' ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                title="Switch to Home"
              >
                Home
              </button>
              <button
                onClick={() => { saveTeamToStorage(teamTab); setTeamTab('away'); loadTeamFromStorage('away'); }}
                className={`px-3 py-2 text-sm ${teamTab === 'away' ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                title="Switch to Away"
              >
                Away
              </button>
            </div>

            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="border rounded-md px-3 py-2"
              placeholder={`${teamTab === 'home' ? 'Home' : 'Away'} Team`}
            />

            {/* One Reset + one Export */}
            <button onClick={resetAll} className="px-3 py-2 bg-white border rounded-md shadow-sm hover:bg-gray-100">
              Reset
            </button>
            <button onClick={exportJSON} className="px-3 py-2 bg-black text-white rounded-md shadow-sm">
              Export
            </button>
          </div>
        </header>


        {/* Players editor */}
        <section className="bg-white border rounded-xl p-4 mb-6">
        {/* Scoreboard / line score */}
        <section className="bg-white border rounded-xl p-3 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Scoreboard</h2>
            <div className="text-sm text-gray-500">{teamName}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2">Inning</th>
                  {INNINGS.map((inn) => (
                    <th key={inn} className="text-center p-2">{inn}</th>
                  ))}
                  <th className="text-center p-2">R</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-2 font-medium">Runs</td>
                  {inningRuns.map((r, i) => (
                    <td key={i} className="text-center p-2">{r}</td>
                  ))}
                  <td className="text-center p-2 font-semibold">{teamTotals.R}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        

          <h2 className="font-semibold mb-3">Batting Order</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {players.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 text-gray-500">{idx + 1}.</span>
                <input
                  value={p.number ?? ''}
                  onChange={(e) => {
                    const next = [...players];
                    next[idx] = { ...next[idx], number: e.target.value };
                    setPlayers(next);
                  }}
                  className="w-16 border rounded-md px-2 py-1"
                  placeholder="#"
                />
                <input
                  value={p.name}
                  onChange={(e) => {
                    const next = [...players];
                    next[idx] = { ...next[idx], name: e.target.value };
                    setPlayers(next);
                  }}
                  className="flex-1 border rounded-md px-2 py-1"
                  placeholder={`Player ${idx + 1}`}
                />
                <select
                  value={p.position ?? ''}
                  onChange={(e) => {
                    const next = [...players];
                    next[idx] = { ...next[idx], position: e.target.value };
                    setPlayers(next);
                  }}
                  className="w-24 border rounded-md px-2 py-1 text-sm"
                >
                  <option value="P">P</option>
                  <option value="C">C</option>
                  <option value="1B">1B</option>
                  <option value="2B">2B</option>
                  <option value="3B">3B</option>
                  <option value="SS">SS</option>
                  <option value="LF">LF</option>
                  <option value="CF">CF</option>
                  <option value="RF">RF</option>
                  <option value="DH">DH</option>
                </select>

              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={() => setPlayers((prev) => [...prev, { name: `Player ${prev.length + 1}` }])} className="px-3 py-2 bg-white border rounded-md hover:bg-gray-100">
              + Add Player
            </button>
            <button onClick={() => setPlayers((p) => (p.length > 1 ? p.slice(0, -1) : p))} className="px-3 py-2 bg-white border rounded-md hover:bg-gray-100">
              − Remove Last
            </button>
          </div>
        </section>

        {/* Batter stats */}
        <section className="bg-white border rounded-xl p-4 mb-6">
          <h2 className="font-semibold mb-3">Batter Stats</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Batter</th>
                  <th className="text-center p-2">AB</th>
                  <th className="text-center p-2">H</th>
                  <th className="text-center p-2">RBI</th>
                  <th className="text-center p-2">BB</th>
                  <th className="text-center p-2">K</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, r) => {
                  const s = playerStats[r];
                  return (
                    <tr key={r} className="border-b">
                      <td className="p-2">{p.number || r + 1}</td>
                      <td className="p-2">{p.name || `Player ${r + 1}`}</td>
                      <td className="text-center p-2">{s.ab}</td>
                      <td className="text-center p-2">{s.hits}</td>
                      <td className="text-center p-2">{s.rbi}</td>
                      <td className="text-center p-2">{s.bb}</td>
                      <td className="text-center p-2">{s.k}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>


        {/* Scorecard table */}
        <section className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 bg-gray-50 z-10 top-0 text-left p-3 border-b">Batter</th>
                {INNINGS.map((inn) => (
                  <th key={inn} className="text-center p-3 border-b min-w-[240px]">
                    <div className="flex items-center justify-center gap-2">
                      <span>Inning {inn}</span>
                      <button
                        onClick={() => resetInning(inn - 1)}
                        className="text-xs px-2 py-1 border rounded bg-white hover:bg-gray-100"
                        title="Reset outs for this inning"
                      >
                        Reset outs
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((p, r) => (
                <tr key={r}>
                  <th className="sticky left-0 bg-gray-50 z-10 text-left p-2 border-b align-top w-64">
                    <div className="font-medium flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full border">{p.number || '—'}</span>
                      <span>{p.name || `Player ${r + 1}`}</span>
                      <span className="text-xs text-gray-500">({p.position || '—'})</span>
                    </div>
                    <div className="text-[11px] text-gray-500">#{r + 1}</div>
                  </th>
                  {INNINGS.map((_, c) => (
                    <td key={c} className="p-2 border-b align-top">
                      <BigCell
                        cell={grid[r]?.[c]}
                        onChange={(updated) => {
                          setGrid((g) => {
                            const next = g.map((row) => row.slice());
                            if (!next[r]) next[r] = makeEmptyRow();
                            next[r][c] = updated;
                            return next;
                          });
                        }}
                        outsDisplay={outsUpTo(c, r)}
                        onNextOut={() => recordOut(c, r)}
                        disabled={disabledAfterThirdOut(c, r)}
                        onResetFromHereDown={() => resetOutsFromHereDown(c, r)}
                        batterNumber={r + 1}       // 👈 NEW
                      />

                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <AnalyzePanel grid={grid} players={players} teamName={teamName} />
        </section>
      </div>
    </main>
  );
}
