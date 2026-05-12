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
  Loader2,
  RotateCw,
  Pencil,
  Lock,
  Unlock,
  Circle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateSchedule, parseTeams, Team, Match, ScheduleConfig, CourtConfig, formatTime } from './lib/scheduler';
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
    isLocked?: boolean;
  };
  created_at: string;
}

const INITIAL_CATEGORIES = [
  "BEN M", "BEN F", 
  "ALV M", "ALV F", 
  "INF M", "INF F", 
  "CAD M", "CAD F",
  "JUN M", "JUN F",
  "SEN M", "SEN F"
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [appCategories, setAppCategories] = useState<string[]>(() => {
    const saved = localStorage.getItem('app_categories');
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  useEffect(() => {
    localStorage.setItem('app_categories', JSON.stringify(appCategories));
  }, [appCategories]);

  const [teamsByCategory, setTeamsByCategory] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tournamentView, setTournamentView] = useState<'matches' | 'teams' | 'courts'>('matches');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  
  const teamInput = useMemo(() => {
    return (Object.entries(teamsByCategory) as [string, string[]][])
      .map(([cat, tmList]) => tmList.map(name => `${cat},${name}`).join('\n'))
      .filter(line => line !== '')
      .join('\n');
  }, [teamsByCategory]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLocked, setIsLocked] = useState(false);
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [showCatFilter, setShowCatFilter] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig>({
    courtConfigs: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      rimType: (i + 1) <= 2 ? 'low' : 'normal',
      allowedCategories: []
    })),
    gameDuration: 10,
    breakDuration: 5,
    startTime: "09:30",
    endTime: "14:30",
    minGamesPerTeam: 3,
    generalBreakTime: "11:30",
    generalBreakDuration: 15,
    useFillPhase: false
  });
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);

  const teams = useMemo(() => parseTeams(teamInput), [teamInput]);
  const hasScores = useMemo(() => matches.some(m => m.score1 !== undefined || m.score2 !== undefined), [matches]);

  // Auto-generate tournament when config or teams change (ONLY if Open and NO matches exist)
  useEffect(() => {
    if (!isLocked && teams.length > 0 && !hasScores && matches.length === 0) {
      try {
        const generated = generateSchedule(teams, config);
        setMatches(generated);
        setError(null);
      } catch (e) {
        if (e instanceof Error) {
          setError(e.message);
        }
      }
    }
  }, [teams, isLocked, hasScores, config]);

  const toggleFillPhase = () => {
    const nextVal = !config.useFillPhase;
    const newConfig = { ...config, useFillPhase: nextVal };
    setConfig(newConfig);
    
    // Si desactivamos, quitamos los partidos de relleno generados automáticamente
    // Si activamos, mantenemos lo que hay y dejamos que el scheduler rellene los huecos
    let baseMatches = matches;
    if (!nextVal) {
      baseMatches = matches.filter(m => m.phase !== 'Fase Relleno' && m.phase !== 'Min. Partidos');
    }
    
    try {
      const updated = generateSchedule(teams, newConfig, baseMatches);
      setMatches(updated);
      setError(null);
    } catch (e) {
      console.error("Error toggling fill phase:", e);
      setError(e instanceof Error ? e.message : "Error al actualizar fase de relleno");
    }
  };

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
    setIsLocked(t.data.isLocked || false);

    // Migration logic for old configs
    let courtConfigs = (t.data.config as any).courtConfigs;
    if (!courtConfigs) {
      const courts = (t.data.config as any).courts || 5;
      const lowRimCourts = (t.data.config as any).lowRimCourts || 0;
      courtConfigs = Array.from({ length: courts }, (_, i) => ({
        id: i + 1,
        rimType: (i + 1) <= lowRimCourts ? 'low' : 'normal',
        allowedCategories: []
      }));
    }

    const newConfig = {
      courtConfigs,
      gameDuration: 10,
      breakDuration: 5,
      startTime: "09:30",
      endTime: "14:30",
      minGamesPerTeam: 3,
      generalBreakTime: "11:30",
      generalBreakDuration: 15,
      ...t.data.config
    };

    // Ensure no null/empty strings for critical time values
    newConfig.startTime = newConfig.startTime || "09:30";
    newConfig.endTime = newConfig.endTime || "14:30";
    newConfig.generalBreakTime = newConfig.generalBreakTime || "11:30";
    newConfig.minGamesPerTeam = newConfig.minGamesPerTeam || 3;
    newConfig.useFillPhase = newConfig.useFillPhase ?? false;

    setConfig(newConfig);
  };

  const refreshCurrentTournament = async () => {
    if (!currentTournament) return;
    try {
      setIsRefreshing(true);
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', currentTournament.id)
        .single();

      if (error) throw error;
      if (data) {
        // Just update everything with the new data
        handleSelectTournament(data as unknown as Tournament);
      }
    } catch (e) {
      console.error("Error refreshing tournament:", e);
      setError("Error al refrescar los datos.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const saveTournament = async () => {
    if (!currentTournament) return;
    try {
      setIsSaving(true);
      const updatedData = {
        matches,
        config,
        teamInput,
        teamsByCategory,
        isLocked
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ data: updatedData, updated_at: new Date().toISOString() })
        .eq('id', currentTournament.id);

      if (error) throw error;
      
      // Update local cache
      const updatedTournament = { ...currentTournament, data: updatedData };
      setTournaments(prev => prev.map(t => t.id === currentTournament.id ? updatedTournament : t));
      setCurrentTournament(updatedTournament);
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
          courtConfigs: Array.from({ length: 5 }, (_, i) => ({
            id: i + 1,
            rimType: (i + 1) <= 2 ? 'low' : 'normal',
            allowedCategories: []
          })),
          gameDuration: 10,
          breakDuration: 5,
          startTime: "09:30",
          endTime: "14:30",
          minGamesPerTeam: 3,
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

  const [filterTeams, setFilterTeams] = useState<string[]>([]);
  const [showTeamFilter, setShowTeamFilter] = useState(false);

  const teamNames = useMemo(() => Array.from(new Set(teams.map(t => t.name))).sort(), [teams]);

  const handleMatchDrop = (matchId: string, targetCourt: number, targetTimeStr: string) => {
    if (isLocked || hasScores) return;

    setMatches(prevMatches => {
      const sourceMatch = prevMatches.find(m => m.id === matchId);
      if (!sourceMatch) return prevMatches;

      const targetMatch = prevMatches.find(m => 
        m.court === targetCourt && 
        formatTime(m.startTime) === targetTimeStr
      );

      const newMatches = prevMatches.map(m => {
        if (m.id === sourceMatch.id) {
          if (targetMatch) {
            return {
              ...m,
              startTime: targetMatch.startTime,
              endTime: targetMatch.endTime,
              court: targetMatch.court
            };
          } else {
            const [h, min] = targetTimeStr.split(':').map(Number);
            const newStart = new Date(m.startTime);
            newStart.setHours(h, min, 0, 0);
            const duration = m.endTime.getTime() - m.startTime.getTime();
            const newEnd = new Date(newStart.getTime() + duration);
            return {
              ...m,
              startTime: newStart,
              endTime: newEnd,
              court: targetCourt
            };
          }
        }
        if (targetMatch && m.id === targetMatch.id) {
          return {
            ...m,
            startTime: sourceMatch.startTime,
            endTime: sourceMatch.endTime,
            court: sourceMatch.court
          };
        }
        return m;
      });

      return newMatches;
    });
  };

  const handleGenerate = () => {
    try {
      if (teams.length === 0) {
        setError("Introduce equipos válidos.");
        return;
      }

      if (matches.length > 0) {
        const hasScores = matches.some(m => m.score1 !== undefined || m.score2 !== undefined);
        const message = hasScores 
          ? "ATENCIÓN: El torneo ya ha empezado y hay resultados anotados.\n\nSi generas de nuevo, se borrarán TODOS los resultados y el calendario actual.\n\n¿Estás seguro de que quieres continuar?"
          : "¿Estás seguro de que quieres generar el calendario de nuevo? Se sobreescribirá el actual.";
        
        if (!window.confirm(message)) return;
      }

      setError(null);
      const generated = generateSchedule(teams, config);
      setMatches(generated);
      setIsLocked(false);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Error al generar el calendario.");
      }
    }
  };

  const updateScore = (matchId: string, t1: number | undefined, t2: number | undefined) => {
    setMatches(prev => prev.map(m => m.id === matchId ? { ...m, score1: t1, score2: t2 } : m));
  };

  const renameTeam = (cat: string, oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    
    // Update teamsByCategory
    const currentTeams = teamsByCategory[cat] || [];
    setTeamsByCategory({
      ...teamsByCategory,
      [cat]: currentTeams.map(t => t === oldName ? newName : t)
    });

    // Update matches to persist scores and schedule
    setMatches(prev => prev.map(m => {
      if (m.category !== cat) return m;
      return {
        ...m,
        team1: m.team1 === oldName ? newName : m.team1,
        team2: m.team2 === oldName ? newName : m.team2
      };
    }));
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
    'SEN M': 'border-slate-500 bg-slate-50 text-slate-600',
    'SEN F': 'border-zinc-500 bg-zinc-50 text-zinc-600',
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

  const filteredMatches = useMemo(() => {
    return resolvedMatches.filter(m => {
      const matchCat = filterCats.length === 0 || filterCats.includes(m.category) || filterCats.includes(m.phase);
      const matchCourt = filterCourt === 'all' || m.court.toString() === filterCourt;
      const matchTeam = filterTeams.length === 0 || filterTeams.includes(m.team1) || filterTeams.includes(m.team2);
      return matchCat && matchCourt && matchTeam;
    });
  }, [resolvedMatches, filterCats, filterCourt, filterTeams]);

  const groupedMatchesByTime = useMemo(() => {
    const groups = new Map<string, Match[]>();
    filteredMatches.forEach(m => {
      const time = formatTime(m.startTime);
      if (!groups.has(time)) groups.set(time, []);
      groups.get(time)!.push(m);
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, dayMatches]) => [
        time,
        [...dayMatches].sort((m1, m2) => m1.court - m2.court)
      ] as [string, Match[]]);
  }, [filteredMatches]);

  const categories = Array.from(new Set(teams.map(t => t.category)));
  const phases = Array.from(new Set(resolvedMatches.map(m => m.phase)));
  const courtNumbers = config.courtConfigs.map(c => c.id.toString());

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
      <header className="bg-[#1a1a2e] text-white py-1 md:py-4 px-4 md:px-8 border-b-4 border-[#e94560] flex items-center justify-between shadow-xl shrink-0 gap-4">
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
            <h1 className="text-[12px] md:text-xl font-black italic tracking-tighter uppercase leading-none truncate">
              {currentTournament.name} <span className="text-[#e94560] hidden xs:inline">3x3</span>
            </h1>
            <p className="text-[7px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 md:mt-1 truncate leading-none">
              {new Date(currentTournament.event_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        <div className="flex gap-1 md:gap-4 items-center">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-2 bg-[#16213e] rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button 
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            className="hidden lg:flex p-2 bg-[#16213e] rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors items-center gap-2"
            title={isSidebarVisible ? "Ocultar Ajustes" : "Mostrar Ajustes"}
          >
            {isSidebarVisible ? <Settings className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex bg-[#16213e] rounded-xl p-0.5 md:p-1 border border-slate-700 shadow-inner overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setTournamentView('courts')}
              className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-2 rounded-lg text-[8px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'courts' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <MapPin className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">PISTAS</span>
            </button>
            <button 
              onClick={() => setTournamentView('teams')}
              className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-2 rounded-lg text-[8px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'teams' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">EQUIPOS</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); if (viewMode === 'classification') setViewMode('grid'); }}
              className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-2 rounded-lg text-[8px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && (viewMode === 'grid' || viewMode === 'calendar') ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Calendar className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">CALENDARIO</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); setViewMode('classification'); }}
              className={`flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-2 rounded-lg text-[8px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && viewMode === 'classification' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <ListOrdered className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">CLASIFICACIÓN</span>
            </button>
          </div>
          
          <div className="hidden lg:flex items-center gap-4 border-l border-slate-700 pl-4">
            <div className="text-right">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">Canchas</p>
              <p className="font-mono text-lg font-black text-[#e94560] leading-none">{config.courtConfigs.length}</p>
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
          fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-slate-200 flex flex-col shadow-2xl shrink-0 transition-all duration-300 transform
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 
          ${isSidebarVisible ? 'lg:flex lg:w-80' : 'lg:hidden lg:w-0'}
        `}>
          <div className="flex items-center justify-between p-6 border-b border-slate-100 lg:border-b-0 lg:pb-0">
            <div className="flex items-center gap-2 lg:hidden bg-[#1a1a2e] text-white p-6 -m-6 mb-0 w-full">
              <Trophy className="w-5 h-5 text-[#e94560]" />
              <span className="font-black italic text-sm tracking-tighter">CONFIGURACIÓN</span>
              <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-2 hover:bg-white/10 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Desktop hide button */}
            <button 
              onClick={() => setIsSidebarVisible(false)}
              className="hidden lg:flex ml-auto p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
              title="Ocultar menú"
            >
              <ChevronRight className="w-5 h-5 rotate-180" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-[#e94560]" />
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Ajustes del Torneo</h2>
                {(isLocked || hasScores) && (
                  <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg text-[8px] font-black text-amber-600 uppercase border border-amber-100 animate-pulse">
                    <Lock className="w-2.5 h-2.5" />
                    Fijado
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Resumen Pistas</label>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-lg text-slate-900">{config.courtConfigs.length} Pistas</span>
                    <button 
                      onClick={() => setTournamentView('courts')}
                      className="text-[10px] font-black text-[#e94560] uppercase hover:underline"
                    >
                      Configurar
                    </button>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Juego (m)</label>
                  <input 
                    type="number" 
                    value={config.gameDuration ?? 10} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, gameDuration: +e.target.value}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Descanso (m)</label>
                  <input 
                    type="number" 
                    value={config.breakDuration ?? 5} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, breakDuration: +e.target.value}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Inicio</label>
                  <input 
                    type="time" 
                    value={config.startTime ?? "09:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, startTime: e.target.value}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pausa Gral</label>
                  <input 
                    type="time" 
                    value={config.generalBreakTime ?? "11:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, generalBreakTime: e.target.value}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-1">Hora Fin</label>
                  <input 
                    type="time" 
                    value={config.endTime ?? "14:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, endTime: e.target.value}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-1">Mín. Partidos</label>
                  <input 
                    type="number" 
                    value={config.minGamesPerTeam ?? 3} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, minGamesPerTeam: Math.max(1, +e.target.value)}))} 
                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-1 flex flex-col justify-center">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-2 text-center">Fase de Relleno</label>
                  <button
                    onClick={toggleFillPhase}
                    disabled={isLocked || hasScores}
                    className={`flex items-center justify-center p-2 rounded-lg border-2 transition-all ${config.useFillPhase ? 'bg-[#e94560] border-[#e94560] text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                  >
                    {config.useFillPhase ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>
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
                  className="w-full mt-2 py-2 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-500 uppercase tracking-widest hover:border-[#e94560] hover:text-[#e94560] transition-all flex items-center justify-center gap-2"
                >
                  {isLocked && <Lock className="w-3 h-3" />}
                  {isLocked ? 'VER INSCRIPCIONES' : 'GESTIONAR INSCRIPCIONES'}
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
              disabled={isLocked}
              className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 shadow-xl ${isLocked ? 'bg-slate-300 cursor-not-allowed text-slate-500' : 'bg-[#1a1a2e] hover:bg-[#e94560] text-white hover:shadow-[#e94560]/20'}`}
            >
              {isLocked ? (
                <div className="flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" />
                  CALENDARIO CERRADO
                </div>
              ) : 'GENERAR TORNEO'}
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <section className="flex-1 bg-slate-100 overflow-hidden flex flex-col min-w-0">
          {/* Tournament Actions Bar */}
          <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-0.5 md:py-3 flex items-center justify-between shrink-0 gap-4">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="p-1.5 bg-slate-100 rounded-lg lg:hidden text-[#1a1a2e] hover:bg-slate-200 transition-colors"
                title="Abrir configuración"
              >
                <Menu className="w-5 h-5" />
              </button>
              <h2 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
                {tournamentView === 'teams' ? 'Gestión de Equipos' : viewMode === 'grid' ? 'Vista de Pistas' : viewMode === 'calendar' ? 'Calendario Completo' : 'Clasificación'}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsLocked(!isLocked)}
                className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${isLocked ? 'bg-[#e94560] text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                title={isLocked ? "Desbloquear edición" : "Bloquear edición"}
              >
                {isLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">ABRIR CALENDARIO</span>
                    <span className="xs:hidden">CERRADO</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">CERRAR CALENDARIO</span>
                    <span className="xs:hidden">ABIERTO</span>
                  </>
                )}
              </button>

              <div className="h-6 w-px bg-slate-200 hidden sm:block" />
              
              <button 
                onClick={refreshCurrentTournament}
                disabled={isRefreshing}
                className="p-2 bg-slate-100 text-[#1a1a2e] rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
                title="Refrescar datos"
              >
                <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#e94560]' : ''}`} />
              </button>
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
                {/* Unified Header with Toggle and Filters */}
                <div className="bg-white border-b border-slate-200 p-2 md:p-4 flex flex-wrap items-center gap-3 shrink-0 px-4 md:px-8 shadow-sm z-[60]">
                    {(viewMode === 'grid' || viewMode === 'calendar') && (
                      <div className="flex bg-slate-100 p-0.5 md:p-1 rounded-xl shrink-0">
                        <button 
                          onClick={() => setViewMode('grid')}
                          className={`px-3 md:px-4 py-1 md:py-1.5 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${viewMode === 'grid' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          POR PISTA
                        </button>
                        <button 
                          onClick={() => setViewMode('calendar')}
                          className={`px-3 md:px-4 py-1 md:py-1.5 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${viewMode === 'calendar' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          CRONOLÓGICO
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2 md:gap-3 shrink-0 relative z-[70]">
                      <Filter className="w-3.5 h-3.5 text-slate-400" />
                      <button
                        onClick={() => setShowCatFilter(!showCatFilter)}
                        className={`bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none min-w-[100px] md:min-w-[140px] text-left flex justify-between items-center transition-all ${showCatFilter ? 'border-[#e94560] ring-2 ring-[#e94560]/10' : ''}`}
                      >
                        <span className="truncate pr-2">
                          {filterCats.length === 0 ? 'Categoría (Todas)' : `${filterCats.length === 1 ? filterCats[0] : `${filterCats.length} categorías`}`}
                        </span>
                        <ChevronRight className={`w-3 h-3 transition-transform shrink-0 ${showCatFilter ? 'rotate-90' : ''}`} />
                      </button>
                      
                      <AnimatePresence>
                        {showCatFilter && (
                          <>
                            <div 
                              className="fixed inset-0 z-[65]" 
                              onClick={() => setShowCatFilter(false)} 
                            />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-0 mt-2 w-[240px] bg-white rounded-xl shadow-2xl border border-slate-200 z-[70] py-2 max-h-[400px] overflow-y-auto custom-scrollbar"
                            >
                              <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 mb-1 sticky top-0 z-10">
                                <span className="text-[9px] font-black uppercase text-slate-400">Seleccionar</span>
                                <button 
                                  onClick={() => setFilterCats([])}
                                  className="text-[9px] font-black uppercase text-[#e94560] hover:underline"
                                >
                                  Limpiar
                                </button>
                              </div>
                              <div className="px-1">
                                {categories.map(cat => {
                                  const isSelected = filterCats.includes(cat);
                                  return (
                                    <button
                                      key={cat}
                                      onClick={() => {
                                        setFilterCats(prev => 
                                          prev.includes(cat) 
                                            ? prev.filter(c => c !== cat) 
                                            : [...prev, cat]
                                        );
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-[10px] md:text-[11px] font-bold transition-all ${isSelected ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                      {cat}
                                      {isSelected ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#e94560]" />
                                      ) : (
                                        <Circle className="w-3.5 h-3.5 text-slate-200" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 shrink-0 relative z-[70]">
                      <Search className="w-3.5 h-3.5 text-slate-400" />
                      <button
                        onClick={() => setShowTeamFilter(!showTeamFilter)}
                        className={`bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-[11px] font-bold focus:ring-2 focus:ring-[#e94560]/20 outline-none min-w-[120px] md:min-w-[180px] text-left flex justify-between items-center transition-all ${showTeamFilter ? 'border-[#e94560] ring-2 ring-[#e94560]/10' : ''}`}
                      >
                        <span className="truncate pr-2">
                          {filterTeams.length === 0 ? 'Equipo (Todos)' : `${filterTeams.length === 1 ? filterTeams[0] : `${filterTeams.length} equipos`}`}
                        </span>
                        <ChevronRight className={`w-3 h-3 transition-transform shrink-0 ${showTeamFilter ? 'rotate-90' : ''}`} />
                      </button>

                      <AnimatePresence>
                        {showTeamFilter && (
                          <>
                            <div 
                              className="fixed inset-0 z-[65]" 
                              onClick={() => setShowTeamFilter(false)} 
                            />
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full right-0 mt-2 w-[240px] bg-white rounded-xl shadow-2xl border border-slate-200 z-[70] py-2 max-h-[400px] overflow-y-auto custom-scrollbar"
                            >
                              <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 mb-1 sticky top-0 z-10">
                                <span className="text-[9px] font-black uppercase text-slate-400">Seleccionar</span>
                                <button 
                                  onClick={() => setFilterTeams([])}
                                  className="text-[9px] font-black uppercase text-[#e94560] hover:underline"
                                >
                                  Limpiar
                                </button>
                              </div>
                              <div className="px-1">
                                {teamNames.map(name => {
                                  const isSelected = filterTeams.includes(name);
                                  return (
                                    <button
                                      key={name}
                                      onClick={() => {
                                        setFilterTeams(prev => 
                                          prev.includes(name) 
                                            ? prev.filter(n => n !== name) 
                                            : [...prev, name]
                                        );
                                      }}
                                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left text-[10px] md:text-[11px] font-bold transition-all ${isSelected ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                      {name}
                                      {isSelected ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-[#e94560]" />
                                      ) : (
                                        <Circle className="w-3.5 h-3.5 text-slate-200" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="ml-auto text-[8px] md:text-[10px] font-black text-slate-400 shrink-0 whitespace-nowrap">Total: {filteredMatches.length}</div>
                 </div>


                {(viewMode === 'grid' || viewMode === 'calendar') ? (

                  <div className="flex-1 flex flex-col overflow-hidden">
                    
                    {viewMode === 'grid' ? (
                      <div className="flex-1 overflow-auto bg-slate-300/50 custom-scrollbar">
                        <div className="min-w-max flex flex-col">
                          {/* Sticky Header now inside the scrollable area */}
                          <div 
                            className="flex sticky top-0 z-30 bg-[#1a1a2e] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-800 select-none shadow-md"
                            style={{ minWidth: `calc(80px + ${config.courtConfigs.length * 160}px)` }}
                          >
                            <div className="w-[80px] md:w-[120px] py-3 md:py-4 px-4 md:px-6 border-r border-slate-800 shrink-0 bg-[#1a1a2e] sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.2)]">Horario</div>
                            {config.courtConfigs.map((c, i) => (
                              <div key={i} className={`w-[160px] md:w-[180px] py-3 md:py-4 px-2 md:px-6 text-center border-r border-slate-800 shrink-0 bg-[#1a1a2e]`}>
                                Pista {c.id}
                                {c.rimType === 'low' && (
                                  <span className="block text-[7px] text-[#e94560] mt-1 font-black tracking-tighter uppercase">Aro Bajo</span>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex-1">
                            <AnimatePresence>
                              {groupedMatchesByTime.map(([time, slotMatches], idx) => (
                                <div key={time} className="flex flex-col">
                                  <div 
                                    className="flex border-b border-white/20 min-h-[60px] md:min-h-[90px]"
                                    style={{ minWidth: `calc(80px + ${config.courtConfigs.length * 160}px)` }}
                                  >
                                    <div className="w-[80px] md:w-[120px] bg-white sticky left-0 z-20 flex flex-col items-center justify-center border-r border-slate-200 px-2 md:px-4 shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                                       <span className="font-mono text-sm md:text-base font-black text-slate-700">{time}</span>
                                    </div>
                                    {config.courtConfigs.map((cc, courtIdx) => {
                                       const match = slotMatches.find(m => m.court === cc.id);
                                       const isHighlighted = filterTeams.length > 0 ? (filterTeams.includes(match?.team1 || '') || filterTeams.includes(match?.team2 || '')) : false;
                                       const isOtherHighlighted = filterTeams.length > 0 && !isHighlighted;
                                       return (
                                         <div 
                                           key={courtIdx} 
                                           className={`w-[160px] md:w-[180px] p-1 md:p-1.5 bg-white relative shrink-0 ${courtIdx < config.courtConfigs.length - 1 ? 'border-r border-slate-100' : ''}`}
                                           onDragOver={(e) => {
                                             if (isLocked || hasScores) return;
                                             e.preventDefault();
                                             (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc';
                                           }}
                                           onDragLeave={(e) => {
                                             (e.currentTarget as HTMLElement).style.backgroundColor = '';
                                           }}
                                           onDrop={(e) => {
                                             if (isLocked || hasScores) return;
                                             e.preventDefault();
                                             (e.currentTarget as HTMLElement).style.backgroundColor = '';
                                             const mId = e.dataTransfer.getData("matchId");
                                             if (mId) {
                                               handleMatchDrop(mId, cc.id, time);
                                             }
                                           }}
                                         >
                                            {match ? (
                                              <div 
                                                draggable={!isLocked && !hasScores}
                                                onDragStart={(e) => {
                                                  if (isLocked || hasScores) {
                                                    e.preventDefault();
                                                    return;
                                                  }
                                                  e.dataTransfer.setData("matchId", match.id);
                                                  e.dataTransfer.effectAllowed = "move";
                                                }}
                                                className={`h-full rounded-lg border-l-4 p-2 md:p-3 shadow-sm flex flex-col justify-center cursor-move active:scale-95 transition-transform ${getCatStyles(match.category)} ${isOtherHighlighted ? 'opacity-10 grayscale scale-95' : 'opacity-100'} ${filterTeams.length > 0 && isHighlighted ? 'ring-2 ring-[#e94560] scale-105 z-20 bg-white' : ''} ${(match.phase === 'Fase Relleno' || match.phase === 'Min. Partidos') ? 'border-dashed border-2 opacity-80 bg-slate-50/50' : ''}`}
                                              >
                                                <div className="flex justify-between items-start mb-0.5 md:mb-1">
                                                  <div className="flex items-center gap-1">
                                                    <p className="text-[6px] md:text-[7px] font-black uppercase opacity-60">{match.category}</p>
                                                    {(match.phase === 'Fase Relleno' || match.phase === 'Min. Partidos') && (
                                                      <span className="text-[5px] font-black bg-slate-900/10 text-slate-500 px-1 rounded-sm leading-tight uppercase">EXTRA</span>
                                                    )}
                                                  </div>
                                                  {cc.rimType === 'low' && (
                                                    <span className="text-[5px] md:text-[6px] font-black bg-[#e94560] text-white px-1 rounded-sm leading-tight">ARO BAJO</span>
                                                  )}
                                                </div>
                                                <div className="text-[9px] md:text-[10px] font-bold leading-tight flex flex-col gap-0.5">
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
                                    <div className="h-4 md:h-6 bg-slate-400/10 flex items-center px-6 relative border-b border-white/5" style={{ minWidth: `calc(80px + ${config.courtConfigs.length * 160}px)` }}>
                                      <div className="w-full h-px bg-white/10" />
                                      <span className="absolute left-[100px] md:left-[140px] px-2 md:px-3 py-0.5 md:py-1 bg-[#1a1a2e] rounded-full text-[6px] md:text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] shadow-sm">
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
                             <div className="bg-slate-50 px-4 md:px-8 py-1 md:py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:sticky md:top-0 md:z-10">{time}</div>
                            <div className="divide-y divide-slate-50 min-w-min overflow-x-auto">
                              {slotMatches.map(m => {
                                const lowerCat = m.category.toLowerCase();
                                const isSemi = lowerCat.includes('semi');
                                const isFinal = lowerCat.includes('final') || lowerCat.includes('3er');
                                const isSpecial = isSemi || isFinal;
                                
                                return (
                                  <div key={m.id} className={`px-4 md:px-8 py-2 md:py-4 grid grid-cols-[100px_80px_1fr_80px_1fr] md:grid-cols-12 items-center gap-4 hover:bg-slate-50 transition-colors min-w-[650px] md:min-w-0 ${isSpecial ? 'bg-[#1a1a2e] text-white hover:bg-[#252542]' : ''}`}>
                                    <div className="col-span-1 md:col-span-2 text-[10px] font-black flex flex-col justify-center">
                                      <div className="flex items-center gap-1.5">
                                        <span className={`text-[9px] font-bold ${isSpecial ? 'text-white' : 'text-slate-900'}`}>{m.category}</span>
                                        {(m.phase === 'Fase Relleno' || m.phase === 'Min. Partidos') && (
                                          <span className="text-[7px] bg-slate-100 text-slate-400 px-1 rounded-sm leading-tight font-black uppercase border border-slate-200">Extra</span>
                                        )}
                                        {isSpecial && (isFinal ? <Trophy className="w-3 h-3 text-[#e94560]" /> : <MapPin className="w-3 h-3 text-[#e94560]" />)}
                                      </div>
                                    </div>
                                    <div className="text-center md:col-span-1">
                                      <span className={`px-2 py-1 text-[9px] md:text-[10px] font-black rounded uppercase tracking-tighter whitespace-nowrap ${isSpecial ? 'bg-[#e94560] text-white' : 'bg-slate-900 text-white'}`}>PISTA {m.court}</span>
                                      {config.courtConfigs.find(cc => cc.id === m.court)?.rimType === 'low' && (
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
                    <div className="flex-1 overflow-y-auto p-8 space-y-12 bg-white scroll-smooth custom-scrollbar">
                      {/* Classification view respects filterCats */}
                      {(categories as string[]).filter(cat => filterCats.length === 0 || filterCats.includes(cat)).map(cat => {
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
                                    <ClassificationTable teams={groupTeams} filterTeams={filterTeams} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                              <ClassificationTable teams={catData?.all || []} filterTeams={filterTeams} />
                            </div>
                          )}

                          <PlayoffSection category={cat} matches={resolvedMatches} onUpdateScore={updateScore} isLocked={isLocked} filterTeams={filterTeams} />
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : tournamentView === 'teams' ? (
            <TeamsManagementView 
              appCategories={appCategories}
              setAppCategories={setAppCategories}
              teamsByCategory={teamsByCategory}
              setTeamsByCategory={setTeamsByCategory}
              initialCategories={INITIAL_CATEGORIES}
              onRenameTeam={renameTeam}
              isLocked={isLocked}
            />
          ) : (
            <CourtsManagementView 
              config={config}
              setConfig={setConfig}
              categories={appCategories}
              isLocked={isLocked}
            />
          )}
        </section>
      </main>

      <footer className="hidden md:flex h-12 bg-[#1a1a2e] text-white items-center justify-between px-8 text-[10px] font-bold uppercase tracking-widest shrink-0 border-t border-[#e94560]/30 shadow-2xl">
        <div className="flex gap-8">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
            <span className="text-slate-400">Motor de Calendarios BRAFA v3.0</span>
          </div>
          <div className="text-slate-600">|</div>
          <div className="text-slate-500">Sesión Activa: {new Date().toLocaleDateString('es-ES')}</div>
        </div>
        <div></div>
      </footer>
    </div>
  );
}

function ClassificationTable({ teams, filterTeams = [] }: { teams: any[], filterTeams?: string[] }) {
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
        {teams.map((t, idx) => {
          const isHighlighted = filterTeams.includes(t.name);
          return (
            <tr key={t.name} className={`hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-amber-50/50' : ''} ${isHighlighted ? 'bg-[#e94560]/10 ring-1 ring-[#e94560] relative z-10' : ''}`}>
              <td className="px-6 py-4 flex items-center gap-3">
                <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-black ${idx === 0 ? 'bg-amber-400 text-white shadow-md' : isHighlighted ? 'bg-[#e94560] text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {idx + 1}
                </span>
                <span className={`font-bold ${isHighlighted ? 'text-[#e94560]' : 'text-slate-900'}`}>{t.name}</span>
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
          );
        })}
      </tbody>
    </table>
  );
}

function PlayoffSection({ category, matches, onUpdateScore, isLocked, filterTeams = [] }: { category: string, matches: Match[], onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void, isLocked: boolean, filterTeams?: string[] }) {
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
            {s1 && <MatchNode match={s1} label="Semifinal 1" onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />}
            {s2 && <MatchNode match={s2} label="Semifinal 2" onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />}
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
            <MatchNode match={final} label="GRAN FINAL" isMain onUpdateScore={onUpdateScore} isLocked={isLocked} filterTeams={filterTeams} />
          </div>
        )}
      </div>
    </div>
  );
}

function MatchNode({ match, label, isMain = false, onUpdateScore, isLocked, filterTeams = [] }: { match: Match, label: string, isMain?: boolean, onUpdateScore: (id: string, s1: number | undefined, s2: number | undefined) => void, isLocked: boolean, filterTeams?: string[] }) {
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

function TeamSlot({ name, score, isWinner, isMain, onChange, isLocked, isHighlighted = false }: { name: string, score: number | undefined, isWinner: boolean, isMain: boolean, onChange: (val: number | undefined) => void, isLocked: boolean, isHighlighted?: boolean }) {
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
  initialCategories,
  onRenameTeam,
  isLocked
}: { 
  appCategories: string[], 
  setAppCategories: (cats: string[]) => void,
  teamsByCategory: Record<string, string[]>,
  setTeamsByCategory: (teams: Record<string, string[]>) => void,
  initialCategories: string[],
  onRenameTeam: (cat: string, oldName: string, newName: string) => void,
  isLocked: boolean
}) {
  const [newCatName, setNewCatName] = useState('');
  const [newTeamInputs, setNewTeamInputs] = useState<Record<string, string>>({});
  const [editingTeam, setEditingTeam] = useState<{cat: string, name: string} | null>(null);
  const [editValue, setEditValue] = useState('');

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
                {!isLocked && (
                  <button 
                    onClick={() => removeCategory(cat)}
                    className="md:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!isLocked && (
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
            )}
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {appCategories
            .filter(cat => !isLocked || (teamsByCategory[cat] || []).length > 0)
            .map(cat => (
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
                {!isLocked && (
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
                )}

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
                        className="relative flex items-center p-2.5 bg-slate-50 rounded-xl group/team border border-transparent hover:border-[#e94560]/10 hover:bg-white hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 h-8">
                          <span className="text-[10px] font-black text-slate-300 shrink-0">{(idx + 1).toString().padStart(2, '0')}</span>
                          {editingTeam?.cat === cat && editingTeam?.name === team ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => {
                                onRenameTeam(cat, team, editValue);
                                setEditingTeam(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  onRenameTeam(cat, team, editValue);
                                  setEditingTeam(null);
                                }
                                if (e.key === 'Escape') setEditingTeam(null);
                              }}
                              className="flex-1 bg-white border border-[#e94560] rounded-lg px-2 h-full text-xs font-bold outline-none shadow-inner"
                            />
                          ) : (
                            <span className="text-xs font-semibold text-slate-700 truncate pr-16 group-hover/team:text-[#1a1a2e] transition-colors">
                              {team}
                            </span>
                          )}
                        </div>
                        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/team:opacity-100 transition-all scale-95 group-hover/team:scale-100 bg-white/95 backdrop-blur-sm shadow-sm rounded-lg border border-slate-100 p-0.5 z-10">
                          {isLocked ? (
                            <div className="px-2 py-1 flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 rounded-lg">
                              <Lock className="w-2.5 h-2.5" />
                              Fijado
                            </div>
                          ) : (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTeam({ cat, name: team });
                                  setEditValue(team);
                                }}
                                className="text-slate-400 hover:text-[#e94560] hover:bg-[#e94560]/5 p-1.5 rounded-md transition-all"
                                title="Editar nombre"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeTeamFromCategory(cat, team);
                                }}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-all"
                                title="Eliminar equipo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
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

function CourtsManagementView({ 
  config, 
  setConfig, 
  categories,
  isLocked 
}: { 
  config: ScheduleConfig, 
  setConfig: (config: ScheduleConfig) => void,
  categories: string[],
  isLocked: boolean
}) {
  const addCourt = () => {
    const nextId = config.courtConfigs.length > 0 
      ? Math.max(...config.courtConfigs.map(c => c.id)) + 1 
      : 1;
    
    // Default to Normal rim and all categories
    const newCourt: CourtConfig = {
      id: nextId,
      rimType: 'normal',
      allowedCategories: [...categories]
    };

    setConfig({
      ...config,
      courtConfigs: [...config.courtConfigs, newCourt]
    });
  };

  const removeCourt = (id: number) => {
    setConfig({
      ...config,
      courtConfigs: config.courtConfigs.filter(c => c.id !== id)
    });
  };

  const updateCourt = (id: number, updates: Partial<CourtConfig>) => {
    setConfig({
      ...config,
      courtConfigs: config.courtConfigs.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  const toggleCategory = (courtId: number, category: string) => {
    const court = config.courtConfigs.find(c => c.id === courtId);
    if (!court) return;

    const newAllowed = court.allowedCategories.includes(category)
      ? court.allowedCategories.filter(cat => cat !== category)
      : [...court.allowedCategories, category];
    
    updateCourt(courtId, { allowedCategories: newAllowed });
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-slate-50 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-[#1a1a2e] mb-2">Configuración de Pistas</h2>
            <p className="text-slate-500 text-sm font-medium">Define el tipo de aro y las categorías permitidas por pista.</p>
          </div>
          <div className="flex items-center gap-4">
            {!isLocked && (
              <button 
                onClick={addCourt}
                className="flex items-center gap-2 bg-[#e94560] text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#ff516f] transition-all shadow-xl active:scale-95"
              >
                <Plus className="w-4 h-4" /> AÑADIR PISTA
              </button>
            )}
            <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pistas</p>
                <p className="text-2xl font-black text-[#1a1a2e]">{config.courtConfigs.length}</p>
              </div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                <MapPin className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </div>
        </div>

        {config.courtConfigs.length === 0 ? (
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-20 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest mb-2">No hay pistas configuradas</h3>
            <p className="text-slate-400 max-w-sm mb-8">Añade pistas para poder generar el calendario del torneo.</p>
            <button 
              onClick={addCourt}
              className="bg-[#1a1a2e] text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
            >
              AÑADIR MI PRIMERA PISTA
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {config.courtConfigs.map((court, idx) => (
              <motion.div 
                key={court.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-xl transition-all"
              >
                {/* Court Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 group-hover:bg-white transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#1a1a2e] text-white rounded-xl flex items-center justify-center font-black italic text-xl shadow-lg">
                      {court.id}
                    </div>
                    <div>
                      <h4 className="text-lg font-black italic uppercase tracking-tighter text-[#1a1a2e]">Pista {court.id}</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {court.allowedCategories.length} categorías permitidas
                      </p>
                    </div>
                  </div>
                  {!isLocked && (
                    <button 
                      onClick={() => removeCourt(court.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-2"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Court Content */}
                <div className="p-6 space-y-6">
                  {/* Rim Type Toggle */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                       TIPO DE ARO
                    </label>
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                      <button 
                        disabled={isLocked}
                        onClick={() => updateCourt(court.id, { rimType: 'normal' })}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase transition-all ${court.rimType === 'normal' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Normal
                      </button>
                      <button 
                        disabled={isLocked}
                        onClick={() => updateCourt(court.id, { rimType: 'low' })}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-black uppercase transition-all ${court.rimType === 'low' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                         Aro Bajo
                      </button>
                    </div>
                  </div>

                  {/* Categories Selector */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Categorías Permitidas
                      </label>
                      {!isLocked && (
                        <button 
                          onClick={() => {
                            const allAllowed = court.allowedCategories.length === categories.length;
                            updateCourt(court.id, { allowedCategories: allAllowed ? [] : [...categories] });
                          }}
                          className="text-[9px] font-black text-[#e94560] uppercase tracking-tighter hover:underline"
                        >
                          {court.allowedCategories.length === categories.length ? 'QUITAR TODAS' : 'SELECCIONAR TODAS'}
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                      {([...categories].sort((a, b) => {
                        const aSelected = court.allowedCategories.includes(a);
                        const bSelected = court.allowedCategories.includes(b);
                        if (aSelected && !bSelected) return -1;
                        if (!aSelected && bSelected) return 1;
                        return a.localeCompare(b);
                      })).map(cat => {
                        const isSelected = court.allowedCategories.includes(cat);
                        return (
                          <motion.button
                            key={cat}
                            layout
                            initial={false}
                            disabled={isLocked}
                            onClick={() => toggleCategory(court.id, cat)}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                          >
                            <span className="text-[11px] font-bold uppercase truncate">{cat}</span>
                            {isSelected ? (
                              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-200 shrink-0" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Insight */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                  <Info className="w-3.5 h-3.5 text-slate-300" />
                  <p className="text-[9px] font-bold text-slate-400 leading-tight">
                    {court.rimType === 'low' 
                      ? 'Recomendada para categorías Baby o Benjamín.' 
                      : 'Equipada con aros a altura reglamentaria (3.05m).'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
