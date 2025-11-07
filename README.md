# Gus12Green.github.io
import React, { useEffect, useMemo, useState } from "react";

// --- Simple Mobile PWA-style fitness tracker with fatigue model ---
// Persistence: localStorage
// Core ideas:
//  - Muscle-group fatigue grows with session "load" and minutes
//  - Fatigue decays automatically per day since last open
//  - Quick logging UI + history
//  - Everything works offline in the browser and can be added to Home Screen

// --- Types ---
type MuscleKey =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Calves"
  | "Core"
  | "Cardio";

type Muscle = { key: MuscleKey; label: string };

type Session = {
  id: string;
  date: string; // ISO date
  muscle: MuscleKey;
  minutes: number;
  load: number; // 1..5 perceived intensity
  notes?: string;
};

type FatigueMap = Record<MuscleKey, number>; // 0..100

// --- Constants ---
const MUSCLES: Muscle[] = [
  { key: "Chest", label: "Pectorales" },
  { key: "Back", label: "Espalda" },
  { key: "Shoulders", label: "Hombros" },
  { key: "Biceps", label: "Bíceps" },
  { key: "Triceps", label: "Tríceps" },
  { key: "Quads", label: "Cuádriceps" },
  { key: "Hamstrings", label: "Isquiotibiales" },
  { key: "Glutes", label: "Glúteos" },
  { key: "Calves", label: "Gemelos" },
  { key: "Core", label: "Core" },
  { key: "Cardio", label: "Cardio" },
];

const STORAGE_KEY = "fitness-fatigue-tracker-v1";

// Model parameters (tweakable in Settings later)
const DECAY_PER_DAY = 18; // points/day
const LOAD_FACTOR = 0.7; // scales minutes*load to fatigue points
const SESSION_BASE = 4; // base fatigue per session regardless of minutes

function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

function pctToColor(pct: number) {
  // 0..100 -> green..amber..red using Tailwind utility classes returned as string
  if (pct < 34) return "bg-green-500";
  if (pct < 67) return "bg-amber-500";
  return "bg-red-500";
}

function initFatigue(): FatigueMap {
  return MUSCLES.reduce((acc, m) => {
    acc[m.key] = 0;
    return acc;
  }, {} as FatigueMap);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- Root Component ---
export default function App() {
  const [fatigue, setFatigue] = useState<FatigueMap>(() => initFatigue());
  const [history, setHistory] = useState<Session[]>([]);
  const [lastOpenISO, setLastOpenISO] = useState<string | null>(null);

  // Form state
  const [muscle, setMuscle] = useState<MuscleKey>("Chest");
  const [minutes, setMinutes] = useState<number>(45);
  const [load, setLoad] = useState<number>(3);
  const [notes, setNotes] = useState<string>("");

  // Load from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.fatigue) setFatigue(parsed.fatigue);
        if (parsed.history) setHistory(parsed.history);
        if (parsed.lastOpenISO) setLastOpenISO(parsed.lastOpenISO);
      } catch {}
    }
  }, []);

  // Apply decay on mount based on days since last open
  useEffect(() => {
    const nowISO = new Date().toISOString();
    if (!lastOpenISO) {
      setLastOpenISO(nowISO);
      return;
    }
    const then = new Date(lastOpenISO);
    const now = new Date();
    const days = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0) {
      setFatigue((prev) => {
        const next: FatigueMap = { ...prev };
        MUSCLES.forEach((m) => {
          next[m.key] = Math.max(0, prev[m.key] - DECAY_PER_DAY * days);
        });
        return next;
      });
    }
    setLastOpenISO(nowISO);
  }, [lastOpenISO]);

  // Persist on change
  useEffect(() => {
    const payload = { fatigue, history, lastOpenISO };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [fatigue, history, lastOpenISO]);

  const totals = useMemo(() => {
    const sessions = history.length;
    const minutesTotal = history.reduce((s, h) => s + h.minutes, 0);
    return { sessions, minutesTotal };
  }, [history]);

  function addSession() {
    const session: Session = {
      id: uid(),
      date: new Date().toISOString(),
      muscle,
      minutes: Math.max(1, Math.round(minutes)),
      load: Math.min(5, Math.max(1, Math.round(load))),
      notes: notes.trim() || undefined,
    };

    // Update fatigue for chosen muscle, spread a little to synergists
    setFatigue((prev) => {
      const next = { ...prev };
      const delta = SESSION_BASE + LOAD_FACTOR * session.load * session.minutes;
      next[session.muscle] = Math.min(100, next[session.muscle] + delta);

      // simple spillover (10%) to a few neighbors
      const spill = Math.round(delta * 0.1);
      const neighbors: Partial<Record<MuscleKey, MuscleKey[]>> = {
        Chest: ["Triceps", "Shoulders"],
        Back: ["Biceps", "Shoulders"],
        Shoulders: ["Chest", "Back"],
        Biceps: ["Back"],
        Triceps: ["Chest"],
        Quads: ["Glutes", "Hamstrings"],
        Hamstrings: ["Glutes", "Quads"],
        Glutes: ["Quads", "Hamstrings"],
        Calves: ["Quads"],
        Core: ["Back", "Chest"],
        Cardio: ["Calves", "Quads"],
      };
      (neighbors[session.muscle] || []).forEach((n) => {
        next[n] = Math.min(100, next[n] + spill);
      });

      return next;
    });

    setHistory((prev) => [session, ...prev]);
    setNotes("");
  }

  function resetAll() {
    if (!confirm("¿Reiniciar fatiga e historial?")) return;
    setFatigue(initFatigue());
    setHistory([]);
  }

  function removeSession(id: string) {
    setHistory((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="py-3">
          <h1 className="text-2xl font-bold">Fitness Fatigue Tracker</h1>
          <p className="text-sm text-gray-600">Controla la fatiga por grupos musculares y registra tus sesiones.</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-2 pb-2">
          <div className="rounded-2xl border p-3 shadow-sm">
            <div className="text-xs text-gray-500">Sesiones</div>
            <div className="text-xl font-semibold">{totals.sessions}</div>
          </div>
          <div className="rounded-2xl border p-3 shadow-sm">
            <div className="text-xs text-gray-500">Minutos totales</div>
            <div className="text-xl font-semibold">{totals.minutesTotal}</div>
          </div>
        </div>
      </header>

      {/* Fatigue board */}
      <section className="mt-3 space-y-3">
        {MUSCLES.map((m) => {
          const pct = Math.round(fatigue[m.key]);
          return (
            <div key={m.key} className="rounded-2xl border p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-base font-medium">{m.label}</span>
                <span className="text-sm tabular-nums text-gray-700">{pct}%</span>
              </div>
              <div className="h-3 w-full rounded-full bg-gray-200">
                <div
                  className={`h-3 rounded-full ${pctToColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Logger */}
      <section className="mt-6 rounded-2xl border p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Registrar sesión</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-sm">
            Grupo muscular
            <select
              className="mt-1 w-full rounded-xl border p-2"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value as MuscleKey)}
            >
              {MUSCLES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            Minutos
            <input
              type="number"
              className="mt-1 w-full rounded-xl border p-2"
              value={minutes}
              onChange={(e) => setMinutes(parseInt(e.target.value || "0", 10))}
              min={1}
            />
          </label>

          <label className="text-sm">
            Intensidad (1–5)
            <input
              type="number"
              className="mt-1 w-full rounded-xl border p-2"
              value={load}
              onChange={(e) => setLoad(parseInt(e.target.value || "0", 10))}
              min={1}
              max={5}
            />
          </label>

          <label className="col-span-2 text-sm">
            Notas (opcional)
            <input
              type="text"
              className="mt-1 w-full rounded-xl border p-2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej. 4x8 press banca, RPE 8"
            />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button onClick={addSession} className="rounded-2xl border px-4 py-2 font-medium shadow-sm active:scale-95">
            Guardar sesión
          </button>
          <button onClick={resetAll} className="rounded-2xl border px-4 py-2 text-red-600">
            Reiniciar todo
          </button>
        </div>
      </section>

      {/* History */}
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Historial</h2>
        {history.length === 0 && <p className="text-sm text-gray-600">Sin registros todavía.</p>}
        <ul className="space-y-2">
          {history.map((s) => (
            <li key={s.id} className="rounded-2xl border p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {MUSCLES.find((m) => m.key === s.muscle)?.label} · {s.minutes} min · L{s.load}
                </div>
                <button
                  onClick={() => removeSession(s.id)}
                  className="text-sm text-red-600 underline"
                  title="Eliminar"
                >
                  Eliminar
                </button>
              </div>
              <div className="text-xs text-gray-600">
                {new Date(s.date).toLocaleString()}
                {s.notes ? ` · ${s.notes}` : ""}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Footer tips */}
      <footer className="mt-8 pb-10 text-center text-xs text-gray-500">
        Consejo: añade esta página a la pantalla de inicio para usarla como app.
      </footer>
    </div>
  );
}
