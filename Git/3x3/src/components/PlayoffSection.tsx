import { Clock, MapPin, Trophy } from 'lucide-react';
import type { Match } from '../lib/scheduler';

interface PlayoffSectionProps {
  category: string;
  matches: Match[];
  onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void;
  isLocked: boolean;
  filterTeams?: string[];
}

export function PlayoffSection({ category, matches, onUpdateScore, isLocked, filterTeams = [] }: PlayoffSectionProps) {
  const playoffMatches = matches.filter((m) =>
    m.category === category &&
    (m.phase.toLowerCase().includes('semifinal') ||
      m.phase.toLowerCase().includes('final'))
  );

  if (playoffMatches.length === 0) return null;

  const s1 = playoffMatches.find((m) => m.phase === 'Semifinal 1');
  const s2 = playoffMatches.find((m) => m.phase === 'Semifinal 2');
  const final = playoffMatches.find((m) => m.phase === 'Final');

  return (
    <div className="mt-8 md:mt-12 bg-[#1a1a2e] rounded-2xl md:rounded-3xl p-6 md:p-10 overflow-hidden relative border border-white/5 shadow-2xl">
      <div className="absolute top-0 right-0 p-8 opacity-5 hidden md:block">
        <Trophy className="w-64 h-64 text-white" />
      </div>

      <div className="flex justify-center mb-8 md:mb-12">
        <div className="bg-[#e94560] px-4 md:px-6 py-1.5 md:py-2 rounded-full border-t border-white/20 shadow-lg">
          <span className="text-[10px] md:text-xs font-black text-white uppercase tracking-[0.3em]">PLAY-OFF</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 relative z-10">
        {(s1 || s2) && (
          <div className="flex flex-col gap-6 md:gap-12 w-full md:w-64">
            {s1 && <MatchNode match={s1} label="Semifinal 1" onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />}
            {s2 && <MatchNode match={s2} label="Semifinal 2" onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />}
          </div>
        )}

        {(s1 || s2) && final && (
          <div className="hidden md:flex flex-col justify-center h-full">
            <div className="w-12 h-[120px] border-y-2 border-r-2 border-slate-500 rounded-r-xl translate-y-2" />
            <div className="w-8 h-px bg-slate-500 -translate-y-[58px] translate-x-12" />
          </div>
        )}

        {final && (
          <div className="flex flex-col justify-center gap-6 md:gap-10 w-full md:w-80">
            <MatchNode match={final} label="GRAN FINAL" isMain onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />
          </div>
        )}
      </div>
    </div>
  );
}

interface MatchNodeProps {
  match: Match;
  label: string;
  isMain?: boolean;
  onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void;
  isLocked: boolean;
  filterTeams?: string[];
}

function MatchNode({ match, label, isMain = false, onUpdateScore, isLocked, filterTeams = [] }: MatchNodeProps) {
  const formatTimeStr = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className={`relative ${isMain ? 'scale-100 md:scale-110' : ''}`}>
      <div className="flex justify-between items-end mb-1 px-2">
        <div className="bg-slate-800 px-1.5 md:px-2 py-0.5 rounded text-[6px] md:text-[7px] font-black text-slate-400 uppercase tracking-widest border border-white/5">
          {label}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 opacity-60">
          <div className="flex items-center gap-0.5 md:gap-1">
            <Clock className="w-2 md:w-2.5 h-2 md:h-2.5 text-[#e94560]" />
            <span className="text-[8px] md:text-[9px] font-mono font-black text-white">{formatTimeStr(match.startTime)}</span>
          </div>
          <div className="flex items-center gap-0.5 md:gap-1">
            <MapPin className="w-2 md:w-2.5 h-2 md:h-2.5 text-[#e94560]" />
            <span className="text-[8px] md:text-[9px] font-black text-white">P{match.court}</span>
          </div>
        </div>
      </div>
      <div className={`rounded-xl border-2 overflow-hidden shadow-2xl transform transition-all hover:scale-[1.02] ${isMain ? 'border-amber-500 bg-[#0f172a]' : 'border-slate-700 bg-slate-900/50'}`}>
        <TeamSlot
          name={match.team1}
          score={match.score1}
          isWinner={typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score1 > match.score2}
          isMain={isMain}
          onChange={(val) => onUpdateScore(match.id, val, match.score2)}
          isLocked={isLocked}
          isHighlighted={filterTeams.includes(match.team1)}
        />
        <div className="h-px bg-slate-800" />
        <TeamSlot
          name={match.team2}
          score={match.score2}
          isWinner={typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score2 > match.score1}
          isMain={isMain}
          onChange={(val) => onUpdateScore(match.id, match.score1, val)}
          isLocked={isLocked}
          isHighlighted={filterTeams.includes(match.team2)}
        />
      </div>
    </div>
  );
}

interface TeamSlotProps {
  name: string;
  score: number | undefined;
  isWinner: boolean;
  isMain: boolean;
  onChange: (val: number | undefined) => void;
  isLocked: boolean;
  isHighlighted?: boolean;
}

function TeamSlot({ name, score, isWinner, isMain, onChange, isHighlighted = false }: TeamSlotProps) {
  return (
    <div className={`p-3 flex items-center justify-between transition-all ${isWinner ? 'bg-[#e94560]/10 ring-1 ring-inset ring-[#e94560]/30' : ''} ${isHighlighted ? 'bg-[#e94560]/20' : ''}`}>
      <div className="flex items-center gap-3">
        {isWinner && <Trophy className="w-3.5 h-3.5 text-[#e94560]" />}
        <span className={`text-[11px] font-black tracking-tight ${isWinner ? 'text-[#e94560]' : 'text-white'} ${isHighlighted ? 'text-[#e94560] underline decoration-2' : ''}`}>{name}</span>
      </div>
      <input
        type="number"
        value={score ?? ''}
        onChange={(e) => {
          const val = e.target.value === '' ? undefined : parseInt(e.target.value);
          onChange(val);
        }}
        className={`w-12 h-10 flex items-center justify-center font-mono text-base font-black border-l border-slate-800 bg-transparent text-center outline-none focus:bg-white/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${isWinner ? (isMain ? 'text-amber-500' : 'text-[#e94560]') : 'text-slate-600'}`}
        placeholder="-"
      />
    </div>
  );
}
