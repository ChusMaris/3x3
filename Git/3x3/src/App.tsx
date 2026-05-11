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
  Filter,
  List,
  Menu,
  X,
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
    teamsByCategory?: Record<string, string[]>;
  };
  created_at: string;
}

const INITIAL_CATEGORIES = [
  "BEN M", "BEN F", 
  "ALV M", "ALV F", 
  "INF M", "INF F", 
  "CAD M", "CAD F",
  "JUN M", "JUN F"
];

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

  const [appCategories, setAppCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('app_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  useEffect(() => {
    localStorage.setItem('app_categories', JSON.stringify(appCategories));
  }, [appCategories]);

  const [teamsByCategory, setTeamsByCategory] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tournamentView, setTournamentView] = useState<'matches' | 'teams'>('matches');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const teamInput = useMemo(() => {
    return (Object.entries(teamsByCategory) as [string, string[]][])
      .map(([cat, tmList]) => tmList.map(name => `${cat},${name}`).join('\n'))
      .filter(line => line !== '')
      .join('\n');
  }, [teamsByCategory]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterCat, setFilterCat] = useState<string>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [config, setConfig] = useState<ScheduleConfig>({
    courts: 5,
    lowRimCourts: 2,
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
      setTournaments((data as unknown as Tournament[]) || []);
    } catch (e) {
      console.error("Error fetching tournaments:", e);
      setError("No se pudieron cargar los torneos de la base de datos.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTournament = (t: Tournament) => {
    setCurrentTournament(t);
    
    // Legacy migration + loading
    const teamsData = t.data.teamsByCategory as Record<string, string[]> | undefined;
    if (teamsData && Object.keys(teamsData).length > 0) {
      setTeamsByCategory(teamsData);
    } else if (t.data.teamInput) {
      // Parse legacy string input
      const parsed = parseTeams(t.data.teamInput);
      const mig: Record<string, string[]> = {};
      parsed.forEach(team => {
        if (!mig[team.category]) mig[team.category] = [];
        mig[team.category].push(team.name);
      });
      setTeamsByCategory(mig);
    } else {
      setTeamsByCategory({});
    }
    
    // Reset active tab to first category that has teams, or first in list
    const firstCat = Object.keys(t.data.teamsByCategory || {}).sort()[0] || appCategories[0];
    setActiveTab(firstCat);
    
    // Convert string dates back to Date objects
    const restoredMatches = (t.data.matches || []).map(m => ({
      ...m,
      startTime: new Date(m.startTime),
      endTime: new Date(m.endTime)
    }));
    
    setMatches(restoredMatches);
    setConfig(t.data.config || {
      courts: 5,
      lowRimCourts: 2,
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
        teamInput,
        teamsByCategory
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
          lowRimCourts: 2,
          gameDuration: 10,
          breakDuration: 5,
          startTime: "09:30",
          generalBreakTime: "11:30",
          generalBreakDuration: 15
        },
        teamInput: "",
        teamsByCategory: {}
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
      <header className="bg-[#1a1a2e] text-white py-3 md:py-4 px-4 md:px-8 border-b-4 border-[#e94560] flex items-center justify-between shadow-xl shrink-0 gap-4">
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setCurrentTournament(null)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
            title="Volver al inicio"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </button>
          <div className="hidden sm:block bg-[#e94560] p-1.5 md:p-2 rounded-lg transform -rotate-3">
            <Trophy className="w-5 h-5 md:w-8 md:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm md:text-xl font-black italic tracking-tighter uppercase leading-none truncate">
              {currentTournament.name} <span className="text-[#e94560] hidden xs:inline">3x3</span>
            </h1>
            <p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">
              {new Date(currentTournament.event_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        <div className="flex gap-2 md:gap-4 items-center">
          <div className="flex bg-[#16213e] rounded-xl p-1 border border-slate-700 shadow-inner overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setTournamentView('teams')}
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'teams' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">EQUIPOS</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); if (viewMode === 'classification') setViewMode('grid'); }}
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && (viewMode === 'grid' || viewMode === 'calendar') ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">CALENDARIO</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); setViewMode('classification'); }}
              className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[9px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && viewMode === 'classification' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <ListOrdered className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">CLASIFICACIÓN</span>
            </button>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 border-l border-slate-700 pl-4">
            <div className="text-right">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Canchas</p>
              <p className="font-mono text-lg font-black text-[#e94560] leading-none">{config.courts}</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Fin Previsto</p>
              <p className="font-mono text-lg font-black text-white leading-none">
                {matches.length > 0 ? formatTime(matches[matches.length-1].endTime) : '--:--'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex h-screen bg-slate-900 font-sans overflow-hidden relative">
        {/* Mobile Overlay */}
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-slate-200 flex flex-col shadow-2xl shrink-0 transition-transform duration-300 transform
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:flex
        `}>
          <div className="flex items-center justify-between p-6 border-b border-slate-100 md:hidden bg-[#1a1a2e] text-white">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#e94560]" />
              <span className="font-black italic text-sm tracking-tighter">CONFIGURACIÓN</span>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-[#e94560]" />
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Ajustes del Torneo</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pistas Totales</label>
                  <input type="number" value={config.courts} onChange={e => setConfig(c => ({...c, courts: Math.max(1, +e.target.value)}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-1">Pistas Aro Bajo</label>
                  <input type="number" value={config.lowRimCourts} onChange={e => setConfig(c => ({...c, lowRimCourts: Math.max(0, +e.target.value)}))} className="w-full bg-transparent font-mono font-black text-lg outline-none" />
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

            {/* Inscripciones Summary */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#e94560]" />
                  <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Resumen Equipos</h2>
                </div>
                <div className="flex gap-2">
                  <span className="text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase" title="Equipos totales">
                    {teams.length} Q
                  </span>
                </div>
              </div>
              
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                {(Object.entries(teamsByCategory) as [string, string[]][]).filter(([_, list]) => list.length > 0).length === 0 ? (
                  <p className="text-[9px] font-bold text-slate-400 italic text-center py-2">Sin equipos inscritos</p>
                ) : (
                  (Object.entries(teamsByCategory) as [string, string[]][]).map(([cat, list]) => (
                    list.length > 0 && (
                      <div key={cat} className="flex items-center justify-between text-[10px]">
                        <span className="font-black text-slate-400">{cat}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-900 font-black">{list.length}</span>
                          <div className="w-1.5 h-1.5 rounded-full bg-[#e94560]" />
                        </div>
                      </div>
                    )
                  ))
                )}
                <button 
                  onClick={() => setTournamentView('teams')}
                  className="w-full mt-2 py-2 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest hover:border-[#e94560] hover:text-[#e94560] transition-all"
                >
                  GESTIONAR INSCRIPCIONES
                </button>
              </div>
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
        <section className="flex-1 bg-slate-100 overflow-hidden flex flex-col min-w-0">
          {/* Tournament Actions Bar */}
          <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-3 flex items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 bg-slate-100 rounded-lg md:hidden text-[#1a1a2e] hover:bg-slate-200 transition-colors"
                title="Abrir configuración"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
                {tournamentView === 'teams' ? 'Gestión de Equipos' : viewMode === 'grid' ? 'Vista de Pistas' : viewMode === 'calendar' ? 'Calendario Completo' : 'Clasificación'}
              </h2>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button 
                onClick={saveTournament}
                disabled={isSaving}
                className="flex items-center gap-2 px-3 md:px-4 py-2 bg-[#1a1a2e] text-white rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isSaving ? 'Guardando...' : 'GUARDAR'}</span>
              </button>
            </div>
          </div>

          {tournamentView === 'matches' ? (
            matches.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                <Trophy className="w-24 h-24 mb-4 opacity-10" />
                <p className="text-sm font-black uppercase tracking-widest">Configura y pulsa "Generar" para ver los cruces</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                {(viewMode === 'grid' || viewMode === 'calendar') ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Unified Header with Toggle and Filters */}
                    <div className="bg-white border-b border-slate-200 p-4 flex flex-wrap gap-4 items-center shrink-0 px-4 md:px-8 shadow-sm z-20">
                       <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
                         <button 
                           onClick={() => setViewMode('grid')}
                           className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${viewMode === 'grid' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                         >
                           POR PISTA
                         </button>
                         <button 
                           onClick={() => setViewMode('calendar')}
                           className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${viewMode === 'calendar' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                         >
                           CRONOLÓGICO
                         </button>
                       </div>

                       <div className="flex items-center gap-3">
                         <Search className="w-4 h-4 text-slate-400" />
                         <select 
                           value={highlightedTeam || ''} 
                           onChange={e => setHighlightedTeam(e.target.value || null)}
                           className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none min-w-[180px]"
                         >
                           <option value="">Resaltar Equipo (Todos)</option>
                           {teamNames.map(name => (
                             <option key={name} value={name}>{name}</option>
                           ))}
                         </select>
                       </div>

                       <div className="ml-auto text-[10px] font-black text-slate-400 shrink-0">Total: {filteredMatches.length} partidos</div>
                    </div>
                    
                    {viewMode === 'grid' ? (
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div 
                          className="grid bg-[#1a1a2e] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 shrink-0 select-none z-10"
                       style={{ gridTemplateColumns: `120px repeat(${config.courts}, 1fr)` }}
                     >
                       <div className="py-4 px-6 border-r border-slate-800">Horario</div>
                        {Array.from({ length: config.courts }).map((_, i) => (
                          <div key={i} className={`py-4 px-6 text-center ${i < config.courts - 1 ? 'border-r border-slate-800' : ''}`}>
                            Pista {i + 1}
                            {i < config.lowRimCourts && (
                              <span className="block text-[7px] text-[#e94560] mt-1 font-black tracking-tighter uppercase">Aro Bajo</span>
                            )}
                          </div>
                        ))}
                     </div>

                     <div className="flex-1 overflow-auto bg-slate-300/50 custom-scrollbar">
                        <div className="flex flex-col min-w-[800px] md:min-w-min">
                          <AnimatePresence>
                            {groupedMatchesByTime.map(([time, slotMatches], idx) => (
                              <div key={time} className="contents">
                                <div 
                                  className="grid border-b border-white/20 min-h-[90px]"
                                  style={{ gridTemplateColumns: `120px repeat(${config.courts}, 1fr)` }}
                                >
                                  <div className="bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center border-r border-slate-200 px-4">
                                     <span className="font-mono text-base font-black text-slate-700">{time}</span>
                                  </div>
                                  {Array.from({ length: config.courts }).map((_, courtIdx) => {
                                     const match = slotMatches.find(m => m.court === courtIdx + 1);
                                     const isHighlighted = highlightedTeam ? (match?.team1 === highlightedTeam || match?.team2 === highlightedTeam) : true;
                                     const isOtherHighlighted = highlightedTeam && !isHighlighted;
                                     return (
                                       <div key={courtIdx} className={`p-1.5 bg-white relative ${courtIdx < config.courts - 1 ? 'border-r border-slate-100' : ''}`}>
                                          {match ? (
                                            <div className={`h-full rounded-lg border-l-4 p-3 shadow-sm flex flex-col justify-center ${getCatStyles(match.category)} ${isOtherHighlighted ? 'opacity-10 grayscale scale-95' : 'opacity-100'} ${highlightedTeam && isHighlighted ? 'ring-2 ring-[#e94560] scale-105 z-20 bg-white' : ''}`}>
                                              <div className="flex justify-between items-start mb-1">
                                                <p className="text-[7px] font-black uppercase opacity-60">{match.category}</p>
                                                {match.court <= config.lowRimCourts && (
                                                  <span className="text-[6px] font-black bg-[#e94560] text-white px-1 rounded-sm leading-tight">ARO BAJO</span>
                                                )}
                                              </div>
                                              <div className="text-[10px] font-bold leading-tight flex flex-col gap-0.5">
                                                <span className="truncate">{match.team1}</span>
                                                <span className="text-slate-300 font-black italic text-[7px]">VS</span>
                                                <span className="truncate">{match.team2}</span>
                                              </div>
                                            </div>
                                          ) : null}
                                       </div>
                                     )
                                  })}
                                </div>
                                {idx < groupedMatchesByTime.length - 1 && (
                                  <div className="h-6 bg-slate-400/10 flex items-center px-6 relative border-b border-white/5">
                                    <div className="w-full h-px bg-white/10" />
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
                  ) : (
                      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                        {groupedMatchesByTime.map(([time, slotMatches]) => (
                          <div key={time} className="border-b border-slate-100">
                            <div className="bg-slate-50 px-4 md:px-8 py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:sticky md:top-0 md:z-10">{time}</div>
                            <div className="divide-y divide-slate-50 min-w-min overflow-x-auto">
                              {slotMatches.map(m => {
                                const lowerCat = m.category.toLowerCase();
                                const isSemi = lowerCat.includes('semi');
                                const isFinal = lowerCat.includes('final') || lowerCat.includes('3er');
                                const isSpecial = isSemi || isFinal;
                                
                                return (
                                  <div key={m.id} className={`px-4 md:px-8 py-4 grid grid-cols-[100px_80px_1fr_80px_1fr] md:grid-cols-12 items-center gap-4 hover:bg-slate-50 transition-colors min-w-[650px] md:min-w-0 ${isSpecial ? 'bg-[#1a1a2e] text-white hover:bg-[#252542]' : ''}`}>
                                    <div className="col-span-1 md:col-span-2 text-[10px] font-black flex flex-col">
                                      <span className={isSpecial ? 'text-[#e94560]' : 'text-slate-400'}>#{m.id}</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[9px] font-bold ${isSpecial ? 'text-white' : 'text-slate-900'}`}>{m.category}</span>
                                        {isSpecial && (isFinal ? <Trophy className="w-3 h-3 text-[#e94560]" /> : <MapPin className="w-3 h-3 text-[#e94560]" />)}
                                      </div>
                                    </div>
                                    <div className="text-center md:col-span-1">
                                      <span className={`px-2 py-1 text-[9px] md:text-[10px] font-black rounded uppercase tracking-tighter whitespace-nowrap ${isSpecial ? 'bg-[#e94560] text-white' : 'bg-slate-900 text-white'}`}>PISTA {m.court}</span>
                                      {m.court <= config.lowRimCourts && (
                                        <span className={`block text-[7px] font-black tracking-tighter uppercase mt-0.5 ${isSpecial ? 'text-slate-400' : 'text-[#e94560]'}`}>Aro Bajo</span>
                                      )}
                                    </div>
                                    <div className={`text-right font-bold text-xs md:col-span-3 ${isSpecial ? 'text-white italic' : ''}`}>{m.team1}</div>
                                    <div className="flex items-center justify-center gap-2 md:col-span-2">
                                      <input 
                                        type="number" 
                                        value={m.score1 ?? ''} 
                                        onChange={e => updateScore(m.id, e.target.value === '' ? undefined : parseInt(e.target.value), m.score2)}
                                        className={`w-8 h-8 rounded border text-center text-xs font-black outline-none focus:border-[#e94560] ${isSpecial ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                                      />
                                      <span className={isSpecial ? 'text-[#e94560]' : 'text-slate-300'}>-</span>
                                      <input 
                                        type="number" 
                                        value={m.score2 ?? ''} 
                                        onChange={e => updateScore(m.id, m.score1, e.target.value === '' ? undefined : parseInt(e.target.value))}
                                        className={`w-8 h-8 rounded border text-center text-xs font-black outline-none focus:border-[#e94560] ${isSpecial ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                                      />
                                    </div>
                                    <div className={`font-bold text-xs md:col-span-4 ${isSpecial ? 'text-white italic' : ''}`}>{m.team2}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-8 space-y-12 bg-white">
                    {/* ... existing Classification/List view ... */}
                    {(categories as string[]).map(cat => {
                      const catData = classification[cat];
                      return (
                        <section key={cat} className="space-y-6">
                          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-[#1a1a2e]">{cat}</h2>
                          
                          {catData?.groups ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                              {Object.entries(catData.groups as Record<string, any[]>).map(([letter, groupTeams]) => (
                                <div key={letter} className="space-y-4">
                                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-4 text-slate-400">Grupo {letter}</h3>
                                  <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <ClassificationTable teams={groupTeams} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                              <ClassificationTable teams={catData?.all || []} />
                            </div>
                          )}

                          <PlayoffSection category={cat} matches={resolvedMatches} onUpdateScore={updateScore} />
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            <TeamsManagementView 
              appCategories={appCategories}
              setAppCategories={setAppCategories}
              teamsByCategory={teamsByCategory}
              setTeamsByCategory={setTeamsByCategory}
              initialCategories={INITIAL_CATEGORIES}
            />
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

function TeamsManagementView({ 
  appCategories, 
  setAppCategories, 
  teamsByCategory, 
  setTeamsByCategory,
  initialCategories 
}: { 
  appCategories: string[], 
  setAppCategories: (cats: string[]) => void,
  teamsByCategory: Record<string, string[]>,
  setTeamsByCategory: (teams: Record<string, string[]>) => void,
  initialCategories: string[]
}) {
  const [newCatName, setNewCatName] = useState('');
  const [newTeamInputs, setNewTeamInputs] = useState<Record<string, string>>({});

  const addCategory = () => {
    if (newCatName && !appCategories.includes(newCatName)) {
      setAppCategories([...appCategories, newCatName]);
      setNewCatName('');
    }
  };

  const removeCategory = (cat: string) => {
    setAppCategories(appCategories.filter(c => c !== cat));
    const newTeams = { ...teamsByCategory };
    delete newTeams[cat];
    setTeamsByCategory(newTeams);
  };

  const addTeamToCategory = (cat: string) => {
    const teamName = newTeamInputs[cat];
    if (teamName) {
      const currentTeams = teamsByCategory[cat] || [];
      if (!currentTeams.includes(teamName)) {
        setTeamsByCategory({
          ...teamsByCategory,
          [cat]: [...currentTeams, teamName]
        });
      }
      setNewTeamInputs({ ...newTeamInputs, [cat]: '' });
    }
  };

  const removeTeamFromCategory = (cat: string, teamName: string) => {
    const currentTeams = teamsByCategory[cat] || [];
    setTeamsByCategory({
      ...teamsByCategory,
      [cat]: currentTeams.filter(t => t !== teamName)
    });
  };

  const totalTeams = Object.values(teamsByCategory).reduce((acc, teams) => acc + teams.length, 0);

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Management Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-[#1a1a2e] mb-2">Panel de Inscripciones</h2>
            <p className="text-slate-500 text-sm font-medium">Gestiona las categorías y equipos registrados para este torneo.</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Inscritos</p>
              <p className="text-2xl font-black text-[#e94560]">{totalTeams} <span className="text-sm">EQUIPOS</span></p>
            </div>
            <div className="w-12 h-12 bg-[#e94560]/10 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-[#e94560]" />
            </div>
          </div>
        </div>

        {/* Categories Editor */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Filter className="w-4 h-4" /> Configurar Categorías
            </h3>
            <div className="flex gap-2">
               <button 
                 onClick={() => setAppCategories(initialCategories)}
                 className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
               >
                 Restablecer Predeterminadas
               </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {appCategories.map(cat => (
              <div key={cat} className="group relative bg-slate-100 px-4 py-2 rounded-xl flex items-center gap-3 border border-slate-200 hover:border-[#e94560]/30 transition-all">
                <span className="text-[11px] font-bold text-slate-700">{cat}</span>
                <button 
                  onClick={() => removeCategory(cat)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input 
                type="text" 
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nueva Categoría..."
                className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold focus:border-[#e94560] outline-none transition-all w-48"
                onKeyDown={e => e.key === 'Enter' && addCategory()}
              />
              <button 
                onClick={addCategory}
                className="bg-[#1a1a2e] text-white p-2 rounded-xl hover:bg-slate-800 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {appCategories.map(cat => (
            <div key={cat} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl transition-all hover:border-[#e94560]/20">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 group-hover:bg-white transition-colors">
                <div>
                  <h4 className="text-lg font-black italic uppercase tracking-tighter text-[#1a1a2e]">{cat}</h4>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {teamsByCategory[cat]?.length || 0} Equipos
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${(teamsByCategory[cat] || []).length > 0 ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-300'}`}>
                  <Users className="w-5 h-5" />
                </div>
              </div>
              
              <div className="p-6 space-y-4 flex-1 flex flex-col">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTeamInputs[cat] || ''}
                    onChange={e => setNewTeamInputs({ ...newTeamInputs, [cat]: e.target.value })}
                    placeholder="Nombre del equipo..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:border-[#e94560] outline-none transition-all"
                    onKeyDown={e => e.key === 'Enter' && addTeamToCategory(cat)}
                  />
                  <button 
                    onClick={() => addTeamToCategory(cat)}
                    className="bg-[#e94560] text-white p-2.5 rounded-xl hover:bg-[#ff516f] transition-all"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2 flex-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                  {(teamsByCategory[cat] || []).length === 0 ? (
                    <div className="h-20 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-100 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest">Sin equipos</span>
                    </div>
                  ) : (
                    (teamsByCategory[cat] || []).map((team, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={`${cat}-${team}-${idx}`} 
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group/team border border-transparent hover:border-[#e94560]/10 hover:bg-white hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-slate-300">{(idx + 1).toString().padStart(2, '0')}</span>
                          <span className="text-xs font-bold text-slate-700">{team}</span>
                        </div>
                        <button 
                          onClick={() => removeTeamFromCategory(cat, team)}
                          className="opacity-0 group-hover/team:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
