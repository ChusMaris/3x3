/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { 
  Trophy, 
  Settings, 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  Search,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  Hash,
  LayoutGrid,
  ListOrdered,
  Save,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSchedule, parseTeams, Team, Match, ScheduleConfig, formatTime } from './lib/scheduler';
import { supabase, isSupabaseConfigured } from './lib/supabase';

interface Tournament {
  id: string;
  name: string;
  event_date: string;
  data: {
    matches: Match[];
    config: ScheduleConfig;
    teamInput: string;
  };
  created_at: string;
}

const DEFAULT_TEAMS_INPUT = `BEN M,Elite
BEN M,Makina
BEN M,Tornado
BEN F,Mini Jordan
BEN F,Las profesionales
BEN F,El Barça
BEN F,Girls
BEN F,The banana chips
ALV M,BCN Bulls
ALV M,All Star
ALV M,Wildwolves
ALV M,Los Ambiot
ALV M,Splash Brothers
ALV M,Los sin nombre
ALV M,Las Panteras
ALV M,Tralalelitos
ALV F,Bombastic side eye
ALV F,Patatas fritas
ALV F,Brafa girls
INF F,The panthers
INF F,Queen tigers
INF F,Cookies
INF M,Air NO Jordan
INF M,Haribo shooters
INF M,Macarrones con queso
INF M,La pepa pig
INF M,N.B.A.
INF M,Mastudontes
INF M,Call of duty black ops 2
INF M,The King
CAD M,Lakers in 5
CAD M,BBC
CAD M,Callejón letal
CAD M,Los pinettys
CAD M,Aston Birra
CAD M,Black Panters`;

type ViewMode = 'calendar' | 'grid' | 'classification';

export default function App() {
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [teamInput, setTeamInput] = useState(DEFAULT_TEAMS_INPUT);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [config, setConfig] = useState<ScheduleConfig>({
    courts: 5,
    gameDuration: 10,
    breakDuration: 5,
    startTime: "09:30",
    generalBreakTime: "11:30",
    generalBreakDuration: 15
  });
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch all tournaments on mount
  useEffect(() => {
    if (isSupabaseConfigured) {
      fetchTournaments();
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchTournaments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);
    } catch (e) {
      console.error("Error fetching tournaments:", e);
      setError("No se pudieron cargar los torneos de la base de datos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTournament = (t: Tournament) => {
    setCurrentTournament(t);
    setTeamInput(t.data.teamInput || '');
    
    // Convert string dates back to Date objects
    const restoredMatches = (t.data.matches || []).map(m => ({
      ...m,
      startTime: new Date(m.startTime),
      endTime: new Date(m.endTime)
    }));
    
    setMatches(restoredMatches);
    setConfig(t.data.config || {
      courts: 5,
      gameDuration: 10,
      breakDuration: 5,
      startTime: "09:30",
      generalBreakTime: "11:30",
      generalBreakDuration: 15
    });
  };

  const saveTournament = async () => {
    if (!currentTournament) return;
    try {
      setIsSaving(true);
      const updatedData = {
        matches,
        config,
        teamInput
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ data: updatedData, updated_at: new Date().toISOString() })
        .eq('id', currentTournament.id);

      if (error) throw error;
      
      // Update local cache
      setTournaments(prev => prev.map(t => t.id === currentTournament.id ? { ...t, data: updatedData } : t));
    } catch (e) {
      console.error("Error saving tournament:", e);
      setError("Error al guardar en el servidor.");
    } finally {
      setIsSaving(false);
    }
  };

  const createTournament = async (name: string, date: string) => {
    try {
      setIsLoading(true);
      const initialData = {
        matches: [],
        config: {
          courts: 5,
          gameDuration: 10,
          breakDuration: 5,
          startTime: "09:30",
          generalBreakTime: "11:30",
          generalBreakDuration: 15
        },
        teamInput: ""
      };

      const { data, error } = await supabase
        .from('tournaments')
        .insert([{ name, event_date: date, data: initialData }])
        .select()
        .single();

      if (error) throw error;
      
      setTournaments(prev => [data, ...prev]);
      handleSelectTournament(data);
    } catch (e) {
      console.error("Error creating tournament:", e);
      setError("No se pudo crear el torneo.");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTournament = async (id: string) => {
    if (!window.confirm("¿Estás seguro de que quieres borrar este torneo? No se puede deshacer.")) return;
    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('tournaments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setTournaments(prev => prev.filter(t => t.id !== id));
      if (currentTournament?.id === id) setCurrentTournament(null);
    } catch (e) {
      console.error("Error deleting tournament:", e);
      setError("No se pudo borrar el torneo.");
    } finally {
      setIsLoading(false);
    }
  };

  const [highlightedTeam, setHighlightedTeam] = useState<string | null>(null);

  const teams = useMemo(() => parseTeams(teamInput), [teamInput]);
  const teamNames = useMemo(() => Array.from(new Set(teams.map(t => t.name))).sort(), [teams]);

  const handleGenerate = () => {
    try {
      if (teams.length === 0) {
        setError("Introduce equipos válidos.");
        return;
      }
      setError(null);
      const generated = generateSchedule(teams, config);
      setMatches(generated);
    } catch (e) {
      setError("Error al generar el calendario.");
    }
  };

  const updateScore = (matchId: string, t1: number | undefined, t2: number | undefined) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, score1: t1, score2: t2 } : m));
  };

  const categoryColors: Record<string, string> = {
    'BEN M': 'border-blue-500 bg-blue-50 text-blue-600',
    'BEN F': 'border-cyan-500 bg-cyan-50 text-cyan-600',
    'ALV M': 'border-green-500 bg-green-50 text-green-600',
    'ALV F': 'border-emerald-500 bg-emerald-50 text-emerald-600',
    'INF M': 'border-purple-500 bg-purple-50 text-purple-600',
    'INF F': 'border-indigo-500 bg-indigo-50 text-indigo-600',
    'CAD M': 'border-orange-500 bg-orange-50 text-orange-600',
    'CAD F': 'border-amber-500 bg-amber-50 text-amber-600',
    'JUN M': 'border-rose-500 bg-rose-50 text-rose-600',
    'JUN F': 'border-pink-500 bg-pink-50 text-pink-600',
  };

  const getCatStyles = (cat: string) => {
    const uc = cat.toUpperCase();
    return categoryColors[uc] || 'border-slate-500 bg-slate-50 text-slate-600';
  };

  // Stats / Classification Logic
  const classification = useMemo(() => {
    const stats: Record<string, Record<string, { pj: number, pg: number, pp: number, pts: number, pf: number, pc: number, headToHead: Record<string, number> }>> = {};
    
    // Initialize stats
    teams.forEach(t => {
      if (!stats[t.category]) stats[t.category] = {};
      stats[t.category][t.name] = { pj: 0, pg: 0, pp: 0, pts: 0, pf: 0, pc: 0, headToHead: {} };
    });

    matches.forEach(m => {
      if (m.score1 === undefined || m.score2 === undefined) return;
      const cat = m.category;
      const t1 = m.team1;
      const t2 = m.team2;
      
      // We only compute stats for base teams
      if (!stats[cat] || !stats[cat][t1] || !stats[cat][t2]) return;

      const s1 = stats[cat][t1];
      const s2 = stats[cat][t2];

      s1.pj++;
      s2.pj++;
      s1.pf += m.score1;
      s1.pc += m.score2;
      s2.pf += m.score2;
      s2.pc += m.score1;

      if (m.score1 > m.score2) {
        s1.pg++;
        s1.pts++;
        s2.pp++;
        s1.headToHead[t2] = (s1.headToHead[t2] || 0) + 1;
      } else if (m.score2 > m.score1) {
        s2.pg++;
        s2.pts++;
        s1.pp++;
        s2.headToHead[t1] = (s2.headToHead[t1] || 0) + 1;
      }
    });

    // Helper to sort a list of teams using the tournament rules
    const sortTeams = (teamList: any[]) => {
      return [...teamList].sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const aWonAgainstB = a.headToHead[b.name] || 0;
        const bWonAgainstA = b.headToHead[a.name] || 0;
        if (aWonAgainstB !== bWonAgainstA) return bWonAgainstA - aWonAgainstB;
        return (b.pf - b.pc) - (a.pf - a.pc);
      });
    };

    // Results per category, potentially split by groups
    const result: Record<string, { all: any[], groups?: Record<string, any[]> }> = {};
    
    Object.keys(stats).forEach(cat => {
      const catTeamsBase = teams.filter(t => t.category === cat);
      const allTeamsData = Object.entries(stats[cat]).map(([name, data]) => ({ name, ...data }));
      
      if (catTeamsBase.length > 6) {
        // Handle 2 groups logic (same as scheduler.ts)
        const n = catTeamsBase.length;
        const groupA_Names = catTeamsBase.slice(0, Math.ceil(n/2)).map(t => t.name);
        const groupB_Names = catTeamsBase.slice(Math.ceil(n/2)).map(t => t.name);
        
        const dataA = allTeamsData.filter(t => groupA_Names.includes(t.name));
        const dataB = allTeamsData.filter(t => groupB_Names.includes(t.name));
        
        result[cat] = {
          all: sortTeams(allTeamsData),
          groups: {
            'A': sortTeams(dataA),
            'B': sortTeams(dataB)
          }
        };
      } else {
        result[cat] = {
          all: sortTeams(allTeamsData)
        };
      }
    });

    return result;
  }, [matches, teams]);

  // Derived matches with resolved team names
  const resolvedMatches = useMemo(() => {
    return matches.map(m => {
      const resolveName = (name: string): string => {
        const catClass = classification[m.category];
        if (!catClass) return name;

        // Reglas de resolución de "Gr." (Grupos A/B)
        if (name.includes('Gr.')) {
          const match = name.match(/(\d+)º Gr\.([A-B])/);
          if (match && catClass.groups) {
            const pos = parseInt(match[1]) - 1;
            const groupLetter = match[2];
            const groupData = catClass.groups[groupLetter];
            
            // Verificar si TODOS los partidos de ese grupo han finalizado
            const groupMatches = matches.filter(gm => 
              gm.category === m.category && 
              gm.phase.includes(`Grupo ${groupLetter}`)
            );
            const allFinished = groupMatches.length > 0 && groupMatches.every(gm => 
              typeof gm.score1 === 'number' && !isNaN(gm.score1) && 
              typeof gm.score2 === 'number' && !isNaN(gm.score2)
            );

            if (allFinished && groupData && groupData[pos]) {
              return groupData[pos].name;
            }
          }
        }
        
        // Reglas de resolución de "1º Clasificado" (Liga única)
        if (name.includes('Clasificado')) {
          const match = name.match(/(\d+)º Clasificado/);
          if (match) {
            const pos = parseInt(match[1]) - 1;
            
            // Verificar si TODOS los partidos de grupo de esta categoría han finalizado
            const groupMatches = matches.filter(gm => 
              gm.category === m.category && 
              gm.phase.includes('Grupo')
            );
            const allFinished = groupMatches.length > 0 && groupMatches.every(gm => 
              typeof gm.score1 === 'number' && !isNaN(gm.score1) && 
              typeof gm.score2 === 'number' && !isNaN(gm.score2)
            );

            if (allFinished && catClass.all[pos]) {
              return catClass.all[pos].name;
            }
          }
        }

        // Resolución de Ganadores de Semifinales
        if (name.includes('Ganador S')) {
          const semiId = name.includes('S1') ? 'Semifinal 1' : 'Semifinal 2';
          const semiMatch = matches.find(sm => sm.category === m.category && sm.phase === semiId);
          // Solo se resuelve si el partido de la semifinal ha terminado y hay un ganador
          if (semiMatch && 
              typeof semiMatch.score1 === 'number' && !isNaN(semiMatch.score1) && 
              typeof semiMatch.score2 === 'number' && !isNaN(semiMatch.score2) &&
              semiMatch.score1 !== semiMatch.score2) {
            const winnerRaw = semiMatch.score1 > semiMatch.score2 ? semiMatch.team1 : semiMatch.team2;
            return resolveName(winnerRaw); // Recursivo para manejar si la semi tenía un placeholder
          }
        }

        return name;
      };

      return {
        ...m,
        team1: resolveName(m.team1),
        team2: resolveName(m.team2)
      };
    });
  }, [matches, classification]);

  const groupedMatchesByTime = useMemo(() => {
    const groups = new Map<string, Match[]>();
    resolvedMatches.forEach(m => {
      const time = formatTime(m.startTime);
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time)!.push(m);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [resolvedMatches]);

  const categories = Array.from(new Set(teams.map(t => t.category)));
  const phases = Array.from(new Set(resolvedMatches.map(m => m.phase)));
  const courtNumbers = Array.from({ length: config.courts }, (_, i) => (i + 1).toString());

  const filteredMatches = useMemo(() => {
    return resolvedMatches.filter(m => {
      const matchCat = filterCat === 'all' || m.category === filterCat || m.phase === filterCat;
      const matchCourt = filterCourt === 'all' || m.court.toString() === filterCourt;
      return matchCat && matchCourt;
    });
  }, [resolvedMatches, filterCat, filterCourt]);

  if (!currentTournament) {
    return (
      <LandingPage 
        tournaments={tournaments} 
        onSelect={handleSelectTournament} 
        onCreate={createTournament} 
        onDelete={deleteTournament}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900">
      {/* Top Header */}
      <header className="bg-[#1a1a2e] text-white py-4 px-8 border-b-4 border-[#e94560] flex items-center justify-between shadow-xl shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCurrentTournament(null)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors border border-white/10 mr-2"
            title="Volver al inicio"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="bg-[#e94560] p-2 rounded-lg transform -rotate-3">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter uppercase leading-none">
              {currentTournament.name} <span className="text-[#e94560]">3x3</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {new Date(currentTournament.event_date).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <button 
            onClick={saveTournament}
            disabled={isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black transition-all ${isSaving ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-[#e94560] hover:bg-[#ff516f] text-white shadow-lg active:scale-95'}`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
          </button>

          <div className="h-8 w-px bg-slate-700" />
          <div className="flex bg-[#16213e] rounded-xl p-1 border border-slate-700 shadow-inner">
            <button 
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black transition-all ${viewMode === 'grid' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutGrid className="w-4 h-4" /> PISTAS
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black transition-all ${viewMode === 'calendar' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-4 h-4" /> CALENDARIO
            </button>
            <button 
              onClick={() => setViewMode('classification')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black transition-all ${viewMode === 'classification' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <ListOrdered className="w-4 h-4" /> CLASIFICACIÓN
            </button>
          </div>
          
          <div className="h-8 w-px bg-slate-700" />
          
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Canchas</p>
              <p className="font-mono text-xl font-black text-[#e94560] leading-none">{config.courts}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Final Prep</p>
              <p className="font-mono text-xl font-black text-white leading-none">
                {matches.length > 0 ? formatTime(matches[matches.length-1].endTime) : '--:--'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shadow-2xl shrink-0 z-10">
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-[#e94560]" />
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Ajustes del Torneo</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pistas Totales</label>
                  <div className="flex items-center justify-between">
                    <button onClick={() => setConfig(c => ({...c, courts: Math.max(1, c.courts - 1)}))} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-400 transition-colors">
                      <Plus className="w-4 h-4 rotate-45" />
                    </button>
                    <span className="font-mono text-xl font-black">{config.courts}</span>
                    <button onClick={() => setConfig(c => ({...c, courts: c.courts + 1}))} className="w-8 h-8 flex items-center justify-center bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-400 transition-colors">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Juego (m)</label>
                  <input type="number" value={config.gameDuration} onChange={e => setConfig(c => ({...c, gameDuration: +e.target.value}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Descanso (m)</label>
                  <input type="number" value={config.breakDuration} onChange={e => setConfig(c => ({...c, breakDuration: +e.target.value}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Inicio</label>
                  <input type="time" value={config.startTime} onChange={e => setConfig(c => ({...c, startTime: e.target.value}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pausa Gral</label>
                  <input type="time" value={config.generalBreakTime} onChange={e => setConfig(c => ({...c, generalBreakTime: e.target.value}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
                </div>
              </div>
            </section>

            <section className="flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#e94560]" />
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Equipos</h2>
                </div>
                <span className="text-[10px] font-black bg-slate-900 text-white px-2 py-0.5 rounded-full">{teams.length}</span>
              </div>
              <textarea 
                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] font-mono resize-none focus:ring-4 focus:ring-[#e94560]/10 focus:border-[#e94560] outline-none transition-all"
                value={teamInput}
                onChange={e => setTeamInput(e.target.value)}
                placeholder="CATEGORIA TAB EQUIPO"
              />
            </section>
          </div>
          
          <div className="p-6 bg-slate-50 border-t border-slate-200">
            {error && (
              <div className="mb-4 p-3 bg-red-100 text-red-600 rounded-xl text-[10px] font-bold flex gap-2 animate-bounce">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button 
              onClick={handleGenerate}
              className="w-full bg-[#1a1a2e] hover:bg-[#e94560] text-white py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 shadow-xl hover:shadow-[#e94560]/20"
            >
              GENERAR TORNEO
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <section className="flex-1 bg-slate-100 overflow-hidden flex flex-col">
          {matches.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Trophy className="w-24 h-24 mb-4 opacity-10" />
              <p className="text-sm font-black uppercase tracking-widest">Configura y pulsa "Generar" para ver los cruces</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
               {/* Grid Header & Highlight Controller */}
               <div className="bg-white border-b border-slate-200 p-3 flex items-center justify-between gap-4 shrink-0 px-6">
                 <div className="flex items-center gap-3">
                   <div className="flex items-center gap-2">
                     <Search className="w-4 h-4 text-slate-400" />
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Resaltar Equipo:</span>
                   </div>
                   <select 
                     value={highlightedTeam || ''} 
                     onChange={e => setHighlightedTeam(e.target.value || null)}
                     className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none min-w-[200px]"
                   >
                     <option value="">Ninguno (Todos visibles)</option>
                     {teamNames.map(name => (
                       <option key={name} value={name}>{name}</option>
                     ))}
                   </select>
                   {highlightedTeam && (
                     <button 
                       onClick={() => setHighlightedTeam(null)}
                       className="text-[10px] font-black text-[#e94560] uppercase tracking-widest hover:underline"
                     >
                       Limpiar
                     </button>
                   )}
                 </div>
                 
                 <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-[#e94560]" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Pista Principal</span>
                    </div>
                    <div className="h-4 w-px bg-slate-200" />
                    <div className="flex items-center gap-1.5 opacity-50">
                      <div className="w-2 h-2 rounded-full bg-slate-300" />
                      <span className="text-[9px] font-bold text-slate-500 uppercase">Sin Jugador Resaltado</span>
                    </div>
                 </div>
               </div>

               <div 
                 className="grid bg-[#1a1a2e] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 shrink-0 select-none z-10"
                 style={{ gridTemplateColumns: `120px repeat(${config.courts}, 1fr)` }}
               >
                 <div className="py-4 px-6 border-r border-slate-800">Horario</div>
                 {Array.from({ length: config.courts }).map((_, i) => (
                   <div key={i} className={`py-4 px-6 text-center ${i < config.courts - 1 ? 'border-r border-slate-800' : ''}`}>
                     Pista {i + 1}
                     {i < 2 && <span className="block text-[7px] text-[#e94560] mt-1 font-bold tracking-tighter">Aro Bajo</span>}
                   </div>
                 ))}
               </div>

               <div className="flex-1 overflow-y-auto bg-slate-300/50 custom-scrollbar">
                  <div className="flex flex-col min-w-min">
                    <AnimatePresence>
                      {groupedMatchesByTime.map(([time, slotMatches], idx) => (
                        <div key={time} className="contents">
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            className="grid border-b border-white/20 min-h-[90px]"
                            style={{ gridTemplateColumns: `120px repeat(${config.courts}, 1fr)` }}
                          >
                            <div className="bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center border-r border-slate-200 px-4">
                               <Clock className="w-3 h-3 mb-1 text-slate-300" />
                               <span className="font-mono text-base font-black text-slate-700">{time}</span>
                               <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Inicio</span>
                            </div>

                            {Array.from({ length: config.courts }).map((_, courtIdx) => {
                               const match = slotMatches.find(m => m.court === courtIdx + 1);
                               const isHighlighted = highlightedTeam 
                                 ? (match?.team1 === highlightedTeam || match?.team2 === highlightedTeam)
                                 : true;
                               
                               const isOtherHighlighted = highlightedTeam && !isHighlighted;

                               return (
                                 <div key={courtIdx} className={`p-1.5 bg-white relative hover:bg-slate-50 transition-all ${courtIdx < config.courts - 1 ? 'border-r border-slate-100' : ''}`}>
                                    {match ? (
                                      <div className={`h-full rounded-lg border-l-4 p-3 shadow-sm flex flex-col justify-center transition-all cursor-pointer group ${getCatStyles(match.category)} ${isOtherHighlighted ? 'opacity-10 grayscale scale-95 blur-[0.5px]' : 'opacity-100 ring-2 ring-transparent'} ${highlightedTeam && isHighlighted ? 'ring-[#e94560] ring-offset-2 scale-105 z-20 shadow-2xl bg-white brightness-110' : ''}`}>
                                        <div className="flex justify-between items-start mb-2">
                                          <p className="text-[8px] font-black uppercase tracking-tighter opacity-80 truncate">{match.category}</p>
                                          {match.phase.includes('Final') || match.phase.includes('Semi') ? (
                                            <span className="bg-slate-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded leading-none shrink-0">{match.phase}</span>
                                          ) : null}
                                        </div>
                                        <div className="text-[11px] font-bold leading-tight flex flex-col gap-1 items-center">
                                          <span 
                                            onClick={(e) => { e.stopPropagation(); setHighlightedTeam(match.team1); }}
                                            className={`truncate w-full text-center hover:text-[#e94560] transition-colors ${highlightedTeam === match.team1 ? 'text-[#e94560] font-black' : 'text-slate-900'}`}
                                          >
                                            {match.team1}
                                          </span>
                                          <span className="text-slate-300 font-black italic text-[8px] group-hover:text-[#e94560]">VS</span>
                                          <span 
                                            onClick={(e) => { e.stopPropagation(); setHighlightedTeam(match.team2); }}
                                            className={`truncate w-full text-center hover:text-[#e94560] transition-colors ${highlightedTeam === match.team2 ? 'text-[#e94560] font-black' : 'text-slate-900'}`}
                                          >
                                            {match.team2}
                                          </span>
                                        </div>
                                        {match.score1 !== undefined && (
                                          <div className="mt-2 text-center">
                                            <span className="bg-white text-slate-900 px-2 py-0.5 rounded-full text-[10px] font-black border border-slate-200">
                                              {match.score1} - {match.score2}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                       <div className="h-full border-2 border-dashed border-slate-100/50 rounded-lg flex items-center justify-center opacity-30">
                                         <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Libre</p>
                                       </div>
                                    )}
                                 </div>
                               )
                            })}
                          </motion.div>
                           
                           {idx < groupedMatchesByTime.length - 1 && (
                             <div className="h-6 bg-slate-400/20 flex items-center px-6 relative border-b border-white/10">
                               <div className="w-full h-px bg-white/20" />
                               <span className="absolute left-[140px] px-3 py-1 bg-[#1a1a2e] rounded-full text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm">
                                 Pausa {config.breakDuration} min
                               </span>
                             </div>
                           )}
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
               </div>
            </div>
          ) : viewMode === 'calendar' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Filter Bar */}
              <div className="bg-white border-b border-slate-200 p-4 flex gap-4 items-center shrink-0">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtros:</span>
                </div>
                
                <select 
                  value={filterCat} 
                  onChange={e => setFilterCat(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none"
                >
                  <option value="all">Todas las Categorías / Fases</option>
                  <optgroup label="Categorías">
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </optgroup>
                  <optgroup label="Fases">
                    {phases.map(p => <option key={p} value={p}>{p}</option>)}
                  </optgroup>
                </select>

                <select 
                  value={filterCourt} 
                  onChange={e => setFilterCourt(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none"
                >
                  <option value="all">Todas las Pistas</option>
                  {courtNumbers.map(c => <option key={c} value={c}>Pista {c}</option>)}
                </select>

                <button 
                  onClick={() => { setFilterCat('all'); setFilterCourt('all'); }}
                  className="text-[10px] font-black text-[#e94560] uppercase tracking-widest hover:underline"
                >
                  Limpiar
                </button>

                <div className="ml-auto text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Resultados: <span className="text-slate-900">{filteredMatches.length}</span>
                </div>
              </div>

              {/* Table Header */}
              <div className="bg-[#1a1a2e] text-slate-400 py-3 px-6 grid grid-cols-12 gap-4 text-[10px] font-black uppercase tracking-widest shrink-0 border-b border-white/5">
                <div className="col-span-1">Cod</div>
                <div className="col-span-2">Cat / Fase</div>
                <div className="col-span-1 text-center">Hora</div>
                <div className="col-span-1 text-center">Pista</div>
                <div className="col-span-7 grid grid-cols-7 items-center">
                  <div className="col-span-3 text-right">Equipo 1</div>
                  <div className="col-span-1 text-center">Resultado</div>
                  <div className="col-span-3 text-left">Equipo 2</div>
                </div>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence>
                  {filteredMatches.map((m, i) => {
                    const isFinal = m.phase === 'Final';
                    const isSemi = m.phase.includes('Semifinal');
                    const isPlayoff = isFinal || isSemi;
                    
                    return (
                      <motion.div 
                        key={m.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.01 }}
                        className={`grid grid-cols-12 gap-4 items-center py-4 px-6 border-b transition-all group relative ${isFinal ? 'bg-[#0f172a] border-[#e94560]/30' : isSemi ? 'bg-[#1a1a2e] border-white/5' : i % 2 === 0 ? 'bg-white border-slate-200' : 'bg-transparent border-slate-200'} hover:z-10`}
                      >
                        <div className={`col-span-1 font-mono text-[10px] font-black ${isPlayoff ? 'text-slate-500' : 'text-slate-400 group-hover:text-[#e94560]'}`}>#{m.id}</div>
                        <div className="col-span-2">
                          <p className={`text-[10px] font-black uppercase truncate ${isPlayoff ? 'text-[#e94560]' : 'text-slate-900'}`}>{m.category}</p>
                          <div className="flex items-center gap-1">
                            {isFinal && <Trophy className="w-2.5 h-2.5 text-amber-500" />}
                            <p className={`text-[8px] font-bold uppercase tracking-tighter ${isFinal ? 'text-amber-500' : 'text-slate-400'}`}>{m.phase}</p>
                          </div>
                        </div>
                        <div className="col-span-1 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded font-mono text-xs font-black shadow-sm ${isFinal ? 'bg-amber-500 text-slate-900' : isSemi ? 'bg-[#e94560] text-white' : 'bg-slate-900 text-white'}`}>
                            {formatTime(m.startTime)}
                          </span>
                        </div>
                        <div className="col-span-1 text-center">
                          <div className="inline-flex flex-col items-center">
                            <MapPin className={`w-3 h-3 ${isPlayoff ? 'text-white/20' : 'text-slate-300'}`} />
                            <span className={`text-xs font-black ${isPlayoff ? 'text-slate-300' : 'text-slate-900'}`}>{m.court}</span>
                          </div>
                        </div>
                        <div className="col-span-7 grid grid-cols-7 items-center gap-4">
                          <div className="col-span-3 text-right">
                            <span className={`text-sm font-bold truncate block ${isPlayoff ? 'text-white' : 'text-slate-800'}`}>{m.team1}</span>
                          </div>
                          <div className="col-span-1 flex items-center justify-center gap-1">
                            <input 
                              type="number" 
                              className={`w-10 h-8 rounded text-center text-sm font-black border-2 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${isPlayoff ? 'bg-white/5 border-white/10 text-white focus:border-[#e94560]' : 'bg-white border-slate-200 text-slate-900 focus:border-[#e94560]'}`}
                              value={m.score1 ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                updateScore(m.id, val, m.score2);
                              }}
                            />
                            <span className={`font-black text-[10px] ${isPlayoff ? 'text-white/20' : 'text-slate-300'}`}>-</span>
                            <input 
                              type="number" 
                              className={`w-10 h-8 rounded text-center text-sm font-black border-2 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all ${isPlayoff ? 'bg-white/5 border-white/10 text-white focus:border-[#e94560]' : 'bg-white border-slate-200 text-slate-900 focus:border-[#e94560]'}`}
                              value={m.score2 ?? ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? undefined : parseInt(e.target.value);
                                updateScore(m.id, m.score1, val);
                              }}
                            />
                          </div>
                          <div className="col-span-3 text-left">
                            <span className={`text-sm font-bold truncate block ${isPlayoff ? 'text-white' : 'text-slate-800'}`}>{m.team2}</span>
                          </div>
                        </div>
                        {isPlayoff && (
                          <div className={`absolute left-0 top-0 bottom-0 w-1 ${isFinal ? 'bg-amber-500' : 'bg-[#e94560]'}`} />
                        )}
                        {isPlayoff && (
                          <div className="absolute top-0 right-0 p-1 opacity-20 pointer-events-none">
                            <Trophy className={`w-12 h-12 ${isFinal ? 'text-amber-500' : 'text-white'}`} />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-12 custom-scrollbar bg-white shadow-inner">
              {categories.map(cat => {
                const catData = classification[cat];
                if (!catData) return null;

                return (
                  <section key={cat} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-4 mb-6">
                      <div className="h-10 w-2 bg-[#e94560]" />
                      <h2 className="text-xl font-black italic uppercase tracking-tighter text-[#1a1a2e]">{cat}</h2>
                    </div>
                    
                    {catData.groups ? (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {Object.entries(catData.groups as Record<string, any[]>).map(([letter, groupTeams]) => (
                          <div key={letter} className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-4">Grupo {letter}</h3>
                            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                              <ClassificationTable teams={groupTeams} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <ClassificationTable teams={catData.all} />
                      </div>
                    )}

                    {/* Playoff Bracket Section */}
                    <PlayoffSection category={cat as string} matches={resolvedMatches} onUpdateScore={updateScore} />
                  </section>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="h-12 bg-[#1a1a2e] text-white flex items-center justify-between px-8 text-[10px] font-bold uppercase tracking-widest shrink-0 border-t border-[#e94560]/30 shadow-2xl">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className="text-slate-400">Motor de Calendarios BRAFA v3.0</span>
          </div>
          <div className="text-slate-600">|</div>
          <div className="text-slate-500">Sesión Activa: {new Date().toLocaleDateString('es-ES')}</div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.print()}
            className="bg-[#e94560] px-6 py-1.5 rounded-lg text-white hover:bg-[#ff516f] transition-all flex items-center gap-2 shadow-lg hover:shadow-[#e94560]/20"
          >
            <Download className="w-3 h-3" /> IMPRIMIR ACTAS
          </button>
        </div>
      </footer>
    </div>
  );
}

function ClassificationTable({ teams }: { teams: any[] }) {
  return (
    <table className="w-full text-left">
      <thead className="bg-[#1a1a2e] text-white text-[9px] font-black uppercase tracking-[0.2em]">
        <tr>
          <th className="px-6 py-4">Equipos</th>
          <th className="px-4 py-4 text-center">PJ</th>
          <th className="px-4 py-4 text-center">PG</th>
          <th className="px-4 py-4 text-center">PP</th>
          <th className="px-4 py-4 text-center">Pts</th>
          <th className="px-4 py-4 text-center">PF</th>
          <th className="px-4 py-4 text-center">PC</th>
          <th className="px-4 py-4 text-center">Dif</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {teams.map((t, idx) => (
          <tr key={t.name} className={`hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-amber-50/50' : ''}`}>
            <td className="px-6 py-4 flex items-center gap-3">
              <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${idx === 0 ? 'bg-amber-400 text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}>
                {idx + 1}
              </span>
              <span className="font-bold text-slate-900">{t.name}</span>
              {idx === 0 && <Trophy className="w-3 h-3 text-amber-500 fill-amber-500" />}
            </td>
            <td className="px-4 py-4 text-center font-mono font-bold text-slate-500">{t.pj}</td>
            <td className="px-4 py-4 text-center font-mono font-bold text-green-600">{t.pg}</td>
            <td className="px-4 py-4 text-center font-mono font-bold text-red-600">{t.pp}</td>
            <td className="px-4 py-4 text-center font-mono font-black text-slate-900 bg-slate-50">{t.pts}</td>
            <td className="px-4 py-4 text-center font-mono text-slate-500">{t.pf}</td>
            <td className="px-4 py-4 text-center font-mono text-slate-500">{t.pc}</td>
            <td className={`px-4 py-4 text-center font-mono font-bold ${t.pf - t.pc > 0 ? 'text-blue-500' : 'text-slate-400'}`}>
              {t.pf - t.pc > 0 ? `+${t.pf - t.pc}` : t.pf - t.pc}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayoffSection({ category, matches, onUpdateScore }: { category: string, matches: Match[], onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void }) {
  const playoffMatches = matches.filter(m => m.category === category && (m.phase.includes('Semifinal') || m.phase === 'Final'));
  
  if (playoffMatches.length === 0) return null;

  const s1 = playoffMatches.find(m => m.phase === 'Semifinal 1');
  const s2 = playoffMatches.find(m => m.phase === 'Semifinal 2');
  const final = playoffMatches.find(m => m.phase === 'Final');

  return (
    <div className="mt-12 bg-[#1a1a2e] rounded-3xl p-10 overflow-hidden relative border border-white/5 shadow-2xl">
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <Trophy className="w-64 h-64 text-white" />
      </div>

      <div className="flex justify-center mb-12">
        <div className="bg-[#e94560] px-6 py-2 rounded-full border-t border-white/20 shadow-lg">
          <span className="text-xs font-black text-white uppercase tracking-[0.3em]">PLAY-OFF</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-8 relative z-10">
        {/* Semifinals Column */}
        {(s1 || s2) && (
          <div className="flex flex-col gap-12 w-64">
            {s1 && <MatchNode match={s1} label="Semifinal 1" onUpdateScore={onUpdateScore} />}
            {s2 && <MatchNode match={s2} label="Semifinal 2" onUpdateScore={onUpdateScore} />}
          </div>
        )}

        {/* Connectors Semis -> Final */}
        {(s1 || s2) && final && (
          <div className="flex flex-col justify-center h-full">
            <div className="w-12 h-[120px] border-y-2 border-r-2 border-slate-500 rounded-r-xl translate-y-2" />
            <div className="w-8 h-px bg-slate-500 -translate-y-[58px] translate-x-12" />
          </div>
        )}

        {/* Final Column */}
        {final && (
          <div className="flex flex-col justify-center w-80">
            <MatchNode match={final} label="GRAN FINAL" isMain onUpdateScore={onUpdateScore} />
          </div>
        )}
      </div>
    </div>
  );
}

function MatchNode({ match, label, isMain = false, onUpdateScore }: { match: Match, label: string, isMain?: boolean, onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void }) {
  const formatTimeStr = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className={`relative ${isMain ? 'scale-110' : ''}`}>
      <div className="flex justify-between items-end mb-1 px-2">
        <div className="bg-slate-800 px-2 py-0.5 rounded text-[7px] font-black text-slate-400 uppercase tracking-widest border border-white/5">
          {label}
        </div>
        <div className="flex items-center gap-2 opacity-60">
          <div className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5 text-[#e94560]" />
            <span className="text-[9px] font-mono font-black text-white">{formatTimeStr(match.startTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 text-[#e94560]" />
            <span className="text-[9px] font-black text-white">P{match.court}</span>
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
        />
        <div className="h-px bg-slate-800" />
        <TeamSlot 
          name={match.team2} 
          score={match.score2} 
          isWinner={typeof match.score1 === 'number' && typeof match.score2 === 'number' && match.score2 > match.score1} 
          isMain={isMain}
          onChange={(val) => onUpdateScore(match.id, match.score1, val)}
        />
      </div>
    </div>
  );
}

function TeamSlot({ name, score, isWinner, isMain, onChange }: { name: string, score: number | undefined, isWinner: boolean, isMain: boolean, onChange: (val: number | undefined) => void }) {
  return (
    <div className={`flex items-center justify-between p-2 min-h-[44px] transition-colors ${isWinner ? 'bg-white/10' : ''}`}>
      <span className={`text-[10px] font-black uppercase truncate flex-1 px-2 ${isWinner ? 'text-white' : 'text-slate-400 opacity-60'}`}>
        {name}
      </span>
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

function LandingPage({ tournaments, onSelect, onCreate, onDelete, isLoading }: { 
  tournaments: Tournament[], 
  onSelect: (t: Tournament) => void, 
  onCreate: (name: string, date: string) => void,
  onDelete: (id: string) => void,
  isLoading: boolean
}) {
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentDate, setNewTournamentDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white font-sans overflow-x-hidden pb-12">
      {/* Background decoration - absolute or fixed to stay behind content */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20 z-0">
        <Trophy className="absolute -top-24 -right-24 w-[600px] h-[600px] text-white rotate-12" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#e94560]/10 rounded-full blur-[120px]" />
      </div>

      <header className="relative z-10 py-12 px-8 flex flex-col items-center text-center">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-[#e94560] p-4 rounded-2xl shadow-2xl shadow-[#e94560]/20 mb-6"
        >
          <Trophy className="w-12 h-12 text-white" />
        </motion.div>
        <motion.h1 
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-5xl font-black italic tracking-tighter uppercase mb-2"
        >
          BRAFA 3x3 <span className="text-[#e94560]">HUB</span>
        </motion.h1>
        <motion.p 
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px]"
        >
          Gestión Centralizada de Torneos
        </motion.p>
      </header>

      <main className="relative z-10 flex-1 max-w-6xl w-full mx-auto p-8 flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-black uppercase tracking-widest text-[#e94560] italic">
            Torneos Guardados
          </h2>
          <button 
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 bg-white text-[#1a1a2e] px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#e94560] hover:text-white transition-all shadow-xl active:scale-95"
          >
            {showCreateForm ? 'CANCELAR' : <><Plus className="w-4 h-4" /> NUEVO TORNEO</>}
          </button>
        </div>

        <AnimatePresence>
          {showCreateForm && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-12"
            >
              <div className="bg-[#16213e] p-8 rounded-3xl border border-white/5 shadow-2xl flex flex-col md:flex-row gap-6 items-end">
                <div className="flex-1 space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre del Torneo</label>
                  <input 
                    type="text" 
                    value={newTournamentName}
                    onChange={e => setNewTournamentName(e.target.value)}
                    placeholder="Ej: III Memorial Juanito 3x3"
                    className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#e94560] outline-none transition-all"
                  />
                </div>
                <div className="w-full md:w-64 space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha del Evento</label>
                  <input 
                    type="date" 
                    value={newTournamentDate}
                    onChange={e => setNewTournamentDate(e.target.value)}
                    className="w-full bg-[#1a1a2e] border border-white/10 rounded-xl px-4 py-3 text-sm font-bold focus:border-[#e94560] outline-none transition-all"
                  />
                </div>
                <button 
                  onClick={() => {
                    if (newTournamentName) {
                      onCreate(newTournamentName, newTournamentDate);
                      setNewTournamentName('');
                      setShowCreateForm(false);
                    }
                  }}
                  className="bg-[#e94560] text-white px-8 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#ff516f] transition-all shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" /> CREAR AHORA
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isSupabaseConfigured ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-amber-500/10 rounded-3xl border-2 border-dashed border-amber-500/20">
            <Settings className="w-16 h-16 text-amber-500 mb-6 animate-pulse" />
            <h3 className="text-2xl font-black uppercase italic mb-4">Base de datos no configurada</h3>
            <p className="text-slate-400 max-w-md mx-auto mb-8 font-medium">
              Para guardar y cargar tus torneos, necesitas configurar tus credenciales de <strong>Supabase</strong> en el menú de ajustes de AI Studio.
            </p>
            <div className="bg-[#16213e] p-6 rounded-2xl text-left w-full max-w-lg font-mono text-[11px] border border-white/5">
              <p className="text-[#e94560] mb-2 font-black">// Añade estas variables en Settings &gt; AI Studio:</p>
              <p className="text-white">VITE_SUPABASE_URL=tu_url_aqui</p>
              <p className="text-white">VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin text-[#e94560]" />
            <p className="font-black text-xs uppercase tracking-widest">Sincronizando con Supabase...</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600 bg-white/5 rounded-3xl border-2 border-dashed border-white/5 p-20 text-center">
            <Calendar className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-sm font-black uppercase tracking-widest max-w-xs">No hay torneos guardados. ¡Crea el primero para empezar a gestionar!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t, i) => (
              <motion.div 
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group relative bg-[#16213e] rounded-3xl p-6 border border-white/5 hover:border-[#e94560]/50 transition-all hover:translate-y-[-4px] shadow-xl"
              >
                <div 
                  className="cursor-pointer"
                  onClick={() => onSelect(t)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="bg-[#1a1a2e] p-3 rounded-xl text-[#e94560] group-hover:bg-[#e94560] group-hover:text-white transition-colors">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {new Date(t.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-xl font-black italic uppercase tracking-tighter mb-2 group-hover:text-[#e94560] transition-colors line-clamp-1">
                    {t.name}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-400 mb-6">
                    <Calendar className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {new Date(t.event_date).toLocaleDateString('es-ES', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                       {/* Avatares mock para visual */}
                       {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-[#16213e] bg-slate-700" />)}
                    </div>
                    <span className="text-[9px] font-black text-slate-500 uppercase">Gestión Activa</span>
                  </div>
                  <button 
                    onClick={() => onDelete(t.id)}
                    className="p-2 text-slate-600 hover:text-red-500 transition-colors"
                    title="Eliminar torneo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Decoration */}
                <div className="absolute top-2 right-2 text-white/5 font-black text-4xl select-none group-hover:opacity-20 transition-opacity">
                  #{tournaments.length - i}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <footer className="relative z-10 py-8 px-8 border-t border-white/5 text-center">
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em]">
          Powered by BRAFA Technology · {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
