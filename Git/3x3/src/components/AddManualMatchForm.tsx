import { useState } from 'react';

interface AddManualMatchFormProps {
  courtId: number;
  time: string;
  allowedCategories: string[];
  teamsByCategory: Record<string, string[]>;
  onAdd: (courtId: number, time: string, category: string, t1: string, t2: string) => void;
}

export function AddManualMatchForm({
  courtId,
  time,
  allowedCategories,
  teamsByCategory,
  onAdd
}: AddManualMatchFormProps) {
  const [selectedCat, setSelectedCat] = useState(allowedCategories[0] || '');
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');

  const teamsInCat = teamsByCategory[selectedCat] || [];

  return (
    <div className="p-8 space-y-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoría</label>
        <select
          value={selectedCat}
          onChange={(e) => { setSelectedCat(e.target.value); setT1(''); setT2(''); }}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#e94560] outline-none transition-all appearance-none"
        >
          {allowedCategories.length === 0 && <option value="">No hay categorías permitidas</option>}
          {allowedCategories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Equipo 1</label>
          <select
            value={t1}
            onChange={(e) => setT1(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#e94560] outline-none transition-all appearance-none"
          >
            <option value="">Seleccionar equipo...</option>
            {teamsInCat.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Equipo 2</label>
          <select
            value={t2}
            onChange={(e) => setT2(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#e94560] outline-none transition-all appearance-none"
          >
            <option value="">Seleccionar equipo...</option>
            {teamsInCat.filter((t) => t !== t1).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <button
        disabled={!selectedCat || !t1 || !t2}
        onClick={() => onAdd(courtId, time, selectedCat, t1, t2)}
        className="w-full bg-[#1a1a2e] text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#e94560] transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:grayscale disabled:pointer-events-none"
      >
        Añadir Partido
      </button>
    </div>
  );
}
