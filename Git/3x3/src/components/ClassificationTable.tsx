import { Trophy } from 'lucide-react';

interface ClassificationTeam {
  name: string;
  pj: number;
  pg: number;
  pp: number;
  pts: number;
  pf: number;
  pc: number;
}

interface ClassificationTableProps {
  teams: ClassificationTeam[];
  filterTeams?: string[];
  canDragTeams?: boolean;
  cat?: string;
}

export function ClassificationTable({ teams, filterTeams = [], canDragTeams = false, cat = '' }: ClassificationTableProps) {
  return (
    <table className="w-full text-left text-[10px] md:text-[13px]">
      <thead className="bg-slate-200 text-slate-700 text-[8px] md:text-[9px] font-black uppercase tracking-[0.18em]">
        <tr>
          <th className="px-2 md:px-6 py-2 md:py-3">Equipos</th>
          <th className="px-1 md:px-3 py-2 md:py-3 text-center">PJ</th>
          <th className="px-1 md:px-3 py-2 md:py-3 text-center">PG</th>
          <th className="px-1 md:px-3 py-2 md:py-3 text-center">PP</th>
          <th className="px-1 md:px-3 py-2 md:py-3 text-center bg-slate-300">Pts</th>
          <th className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-center">PF</th>
          <th className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-center">PC</th>
          <th className="px-1 md:px-3 py-2 md:py-3 text-center">Dif</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {teams.map((t, idx) => {
          const isHighlighted = filterTeams.includes(t.name);
          return (
            <tr
              key={t.name}
              draggable={canDragTeams}
              onDragStart={(e) => {
                if (canDragTeams) {
                  const val = `${t.name}|${cat}`;
                  e.dataTransfer.setData('text/plain', val);
                  e.dataTransfer.setData('text', val);
                  e.dataTransfer.effectAllowed = 'move';
                  (e.currentTarget as HTMLElement).style.opacity = '0.4';
                }
              }}
              onDragEnd={(e) => {
                (e.currentTarget as HTMLElement).style.opacity = '1';
              }}
              className={`hover:bg-slate-50 transition-all ${idx === 0 ? 'bg-amber-50/70' : idx === 1 ? 'bg-slate-100/60' : idx === 2 ? 'bg-slate-100/40' : ''} ${isHighlighted ? 'bg-[#e94560]/10 ring-1 ring-[#e94560] relative z-10' : ''} ${canDragTeams ? 'cursor-grab active:cursor-grabbing hover:bg-slate-100/50' : ''}`}
            >
              <td className="px-2 md:px-6 py-2 md:py-3 flex items-center gap-1 md:gap-2">
                <span className={`w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full text-[9px] md:text-[10px] font-black ${idx === 0 ? 'bg-amber-400 text-white shadow-md' : isHighlighted ? 'bg-[#e94560] text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {idx + 1}
                </span>
                <span className={`text-[10px] md:text-[13px] font-bold truncate max-w-[80px] xs:max-w-none ${isHighlighted ? 'text-[#e94560]' : 'text-slate-900'}`}>{t.name}</span>
                {idx === 0 && <Trophy className="w-2.5 h-2.5 md:w-3 md:h-3 text-amber-500 fill-amber-500" />}
              </td>
              <td className="px-1 md:px-3 py-2 md:py-3 text-center font-mono text-[10px] md:text-xs font-bold text-slate-500">{t.pj}</td>
              <td className="px-1 md:px-3 py-2 md:py-3 text-center font-mono text-[10px] md:text-xs font-bold text-green-600">{t.pg}</td>
              <td className="px-1 md:px-3 py-2 md:py-3 text-center font-mono text-[10px] md:text-xs font-bold text-red-600">{t.pp}</td>
              <td className="px-1 md:px-3 py-2 md:py-3 text-center font-mono text-[10px] md:text-xs font-black text-slate-900 bg-slate-50">{t.pts}</td>
              <td className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-center font-mono text-slate-500 uppercase">{t.pf}</td>
              <td className="hidden sm:table-cell px-2 md:px-4 py-2 md:py-3 text-center font-mono text-slate-500">{t.pc}</td>
              <td className={`px-1 md:px-3 py-2 md:py-3 text-center font-mono text-[10px] md:text-xs font-bold ${t.pf - t.pc > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
                {t.pf - t.pc > 0 ? `+${t.pf - t.pc}` : t.pf - t.pc}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
