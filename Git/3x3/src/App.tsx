/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Trophy, 
  Settings, 
  Users, 
  Calendar, 
  MapPin, 
  Search,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  Filter,
  Menu,
  X,
  LayoutGrid,
  ListOrdered,
  Save,
  ArrowLeft,
  Lock,
  Unlock,
  Circle,
  CheckCircle2,
  Info,
  Printer,
  LogOut,
  Eye,
  QrCode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { generateSchedule, parseTeams, Team, Match, ScheduleConfig, formatTime, CategoryMatchType } from './lib/scheduler';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { TeamsManagementView } from './components/TeamsManagementView';
import { CourtsManagementView } from './components/CourtsManagementView';
import { ClassificationTable } from './components/ClassificationTable';
import { PlayoffSection } from './components/PlayoffSection';
import { LandingPage } from './components/LandingPage';
import { AddManualMatchForm } from './components/AddManualMatchForm';
import { INITIAL_CATEGORIES, createDefaultScheduleConfig } from './constants/tournament';
import { getCatStyles } from './utils/categoryStyles';
import type { Tournament, TeamData } from './types/tournament';

type ViewMode = 'calendar' | 'grid' | 'classification';

export default function App() {
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [eventDate, setEventDate] = useState('');

  const [appCategories, setAppCategories] = useState<string[]>(INITIAL_CATEGORIES);

  const [teamsByCategory, setTeamsByCategory] = useState<Record<string, TeamData[]>>({});
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tournamentView, setTournamentView] = useState<'matches' | 'teams' | 'courts'>('matches');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  
  const teamInput = useMemo(() => {
    return (Object.entries(teamsByCategory) as [string, TeamData[]][])
      .map(([cat, tmList]) => tmList.map(team => `${cat},${team.name},${team.playerCount}`).join('\n'))
      .filter(line => line !== '')
      .join('\n');
  }, [teamsByCategory]);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLocked, setIsLocked] = useState(false);
  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [showCatFilter, setShowCatFilter] = useState(false);
  const [config, setConfig] = useState<ScheduleConfig>(createDefaultScheduleConfig());
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const qrCodePreviewRef = useRef<HTMLDivElement | null>(null);
  const qrCodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scoreSyncTimeoutRef = useRef<number | null>(null);
  const eventDatePickerRef = useRef<HTMLInputElement | null>(null);

  const normalizeIsoDate = (value: string) => {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const normalizeStoredTeamsByCategory = (raw: unknown): Record<string, TeamData[]> => {
    if (!raw || typeof raw !== 'object') return {};
    const next: Record<string, TeamData[]> = {};

    Object.entries(raw as Record<string, unknown>).forEach(([cat, teamList]) => {
      if (!Array.isArray(teamList)) return;
      next[cat] = teamList
        .map((item) => {
          if (typeof item === 'string') {
            return { name: item, playerCount: 0 };
          }
          if (typeof item === 'object' && item !== null) {
            const source = item as Record<string, unknown>;
            const name = typeof source.name === 'string' ? source.name : '';
            const playerCount = Number.isFinite(source.playerCount as number) ? (source.playerCount as number) : 0;
            return { name, playerCount };
          }
          return { name: '', playerCount: 0 };
        })
        .filter(team => Boolean(team.name));
    });

    return next;
  };

  const formatEventDateDisplay = (isoDate: string) => {
    const normalized = normalizeIsoDate(isoDate);
    if (!normalized) return 'DD/MM/YYYY';
    const [year, month, day] = normalized.split('-');
    return `${day}/${month}/${year}`;
  };

  const openEventDatePicker = () => {
    if (isLocked) return;
    const picker = eventDatePickerRef.current;
    if (!picker) return;

    const pickerWithShow = picker as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerWithShow.showPicker === 'function') {
      pickerWithShow.showPicker();
      return;
    }

    picker.focus();
    picker.click();
  };

  const teams = useMemo(() => {
    const list: Team[] = [];
    let idCounter = 0;
    (Object.entries(teamsByCategory) as [string, TeamData[]][]).forEach(([cat, teams]) => {
      teams.forEach(team => {
        list.push({
          id: `team-${idCounter++}`,
          category: cat,
          name: team.name,
          playerCount: team.playerCount
        });
      });
    });
    return list;
  }, [teamsByCategory]);
  const hasScores = useMemo(() => matches.some(m => m.score1 !== undefined || m.score2 !== undefined), [matches]);

  // Auto-generate tournament when config or teams change (ONLY if Open and NO matches exist)
  useEffect(() => {
    if (!isLocked && teams.length > 0 && !hasScores && matches.length === 0 && !criticalError) {
      try {
        const generated = generateSchedule(teams, config);
        setMatches(generated);
        setError(null);
      } catch (e) {
        if (e instanceof Error) {
          // Check if it's a critical error
          if (e.message.includes("está configurada para comenzar")) {
            setCriticalError(e.message);
          } else {
            setError(e.message);
          }
        }
      }
    }
  }, [teams, isLocked, hasScores, config, criticalError]);

  const toggleFillPhase = () => {
    const nextVal = !config.useFillPhase;
    const newConfig = { ...config, useFillPhase: nextVal };
    setConfig(newConfig);
    
    // Si desactivamos, quitamos SOLAMENTE los partidos de relleno extra
    let baseMatches = matches;
    if (!nextVal) {
      baseMatches = matches.filter((m: Match) => 
        m.phase !== 'Fase Relleno' && 
        !m.id.startsWith('FILL-')
      );
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
        .is('deleted_at', null)
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
    const teamsData = t.data.teamsByCategory;
    let resolvedTeamsByCategory: Record<string, TeamData[]> = {};
    if (teamsData && Object.keys(teamsData).length > 0) {
      resolvedTeamsByCategory = normalizeStoredTeamsByCategory(teamsData);
    } else if (t.data.teamInput) {
      const parsed = parseTeams(t.data.teamInput);
      const mig: Record<string, TeamData[]> = {};
      parsed.forEach(team => {
        if (!mig[team.category]) mig[team.category] = [];
        mig[team.category].push({ name: team.name, playerCount: 0 });
      });
      resolvedTeamsByCategory = mig;
    }

    setTeamsByCategory(resolvedTeamsByCategory);

    // Categories are scoped to each tournament.
    const storedCategories = Array.isArray(t.data.appCategories) ? t.data.appCategories : [];
    const configCategories = Object.keys((t.data.config as any)?.categoryConfig || {});
    const loadedCategories = Array.from(new Set([
      ...INITIAL_CATEGORIES,
      ...storedCategories,
      ...Object.keys(resolvedTeamsByCategory),
      ...configCategories
    ]));
    setAppCategories(loadedCategories);
    
    // Reset active tab to first category that has teams, or first in list
    const firstCat = Object.keys(resolvedTeamsByCategory).sort()[0] || loadedCategories[0] || INITIAL_CATEGORIES[0];
    setActiveTab(firstCat);
    
    // Convert string dates back to Date objects
    const restoredMatches = (t.data.matches || []).map(m => ({
      ...m,
      startTime: new Date(m.startTime),
      endTime: new Date(m.endTime)
    }));
    
    setMatches(restoredMatches);
    setIsLocked(t.data.isLocked || false);
    setEventDate(normalizeIsoDate(t.event_date || ''));

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
      ...createDefaultScheduleConfig(),
      ...t.data.config,
      courtConfigs
    };

    // Ensure no null/empty strings for critical time values
    newConfig.startTime = newConfig.startTime || "09:30";
    newConfig.endTime = newConfig.endTime || "14:30";
    newConfig.generalBreakTime = newConfig.generalBreakTime || "11:30";
    newConfig.minGamesPerTeam = newConfig.minGamesPerTeam || 3;
    newConfig.playoffThreshold = newConfig.playoffThreshold || 6;
    newConfig.useFillPhase = newConfig.useFillPhase ?? false;
    newConfig.categoryConfig = newConfig.categoryConfig || {};

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
        appCategories,
        isLocked
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ data: updatedData, event_date: eventDate, updated_at: new Date().toISOString() })
        .eq('id', currentTournament.id);

      if (error) throw error;
      
      // Update local cache
      const updatedTournament = { ...currentTournament, event_date: eventDate, data: updatedData };
      setTournaments((prev: Tournament[]) => prev.map((t: Tournament) => t.id === currentTournament.id ? updatedTournament : t));
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
          generalBreakDuration: 15,
          playoffThreshold: 6,
          useFillPhase: false,
          categoryConfig: {}
        },
        teamInput: "",
        teamsByCategory: {},
        appCategories: [...INITIAL_CATEGORIES]
      };

      const { data, error } = await supabase
        .from('tournaments')
        .insert([{ name, event_date: date, data: initialData }])
        .select()
        .single();

      if (error) throw error;
      
      setTournaments((prev: Tournament[]) => [data, ...prev]);
      handleSelectTournament(data);
    } catch (e) {
      console.error("Error creating tournament:", e);
      setError("No se pudo crear el torneo.");
    } finally {
      setIsLoading(false);
    }
  };

  const isTournamentProtected = (t: Tournament) => {
    const hasResults = (t.data.matches || []).some(
      m => m.score1 !== undefined || m.score2 !== undefined
    );
    return Boolean(t.data.isLocked || hasResults);
  };

  const deleteTournament = async (id: string) => {
    const tournament = tournaments.find(t => t.id === id);
    if (tournament && isTournamentProtected(tournament)) {
      setError('No se puede borrar un torneo que ya está jugado o en curso.');
      return;
    }

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('tournaments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      setTournaments((prev: Tournament[]) => prev.filter((t: Tournament) => t.id !== id));
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

  const confirmAndDeleteTournament = async (tournament: Tournament) => {
    if (isTournamentProtected(tournament)) {
      setError('No se puede borrar un torneo que ya está jugado o en curso.');
      return;
    }

    const shouldDelete = window.confirm(
      `¿Eliminar el torneo "${tournament.name}"? Esta acción no se puede deshacer.`
    );

    if (!shouldDelete) return;
    await deleteTournament(tournament.id);
  };

  const teamNames = useMemo(() => {
    let filteredTeams = teams;
    if (filterCats.length > 0) {
      filteredTeams = teams.filter((t: Team) => filterCats.includes(t.category));
    }
    // Convert to objects with name and category to show in dropdown
    const uniqueTeams = Array.from(new Set(filteredTeams.map((t: Team) => t.name))).map((name: string) => {
      return filteredTeams.find((t: Team) => t.name === name);
    }).filter(Boolean);

    // Sort by category first, then by name
    return (uniqueTeams as any[]).sort((a, b) => {
      const catCompare = (a.category || '').localeCompare(b.category || '');
      if (catCompare !== 0) return catCompare;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [teams, filterCats]);

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

  const handleMoveTeamBetweenGroups = (cat: string, teamName: string, targetGroup: string) => {
    setConfig(prev => {
      const currentManual = prev.manualGroups || {};
      const catTeams = teams.filter(t => t.category === cat);
      
      // Get existing groups or create defaults if they don't exist yet
      const n = catTeams.length;
      const defaultA = catTeams.slice(0, Math.ceil(n/2)).map(t => t.name);
      const defaultB = catTeams.slice(Math.ceil(n/2)).map(t => t.name);
      
      const newGroupsState: Record<string, string[]> = currentManual[cat] ? { ...currentManual[cat] } : {
        'A': [...defaultA],
        'B': [...defaultB]
      };
      
      // Remove from all current groups in this category
      Object.keys(newGroupsState).forEach((g) => {
        newGroupsState[g] = newGroupsState[g].filter((name: string) => name !== teamName);
      });

      // Add to target group
      if (!newGroupsState[targetGroup]) newGroupsState[targetGroup] = [];
      newGroupsState[targetGroup].push(teamName);
      
      return {
        ...prev,
        manualGroups: {
          ...currentManual,
          [cat]: newGroupsState
        }
      };
    });
  };

  const handleGenerate = () => {
    try {
      if (teams.length < 2) {
        setError("Se necesitan al menos 2 equipos para generar el calendario.");
        return;
      }

      setCriticalError(null);
      setError(null);
      const generated = generateSchedule(teams, config);
      setMatches(generated);
      setIsLocked(false);
      // Reset filters so we see everything new
      setFilterCats([]);
      setFilterCourt('all');
      setFilterTeams([]);
    } catch (e: any) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Error desconocido";
      
      // Check if it's a critical configuration error (category start time conflict)
      if (msg.includes("está configurada para comenzar")) {
        setCriticalError(msg);
      } else {
        setError("Error de configuración: " + msg + ". Prueba a ampliar el horario, añadir más pistas o reducir la duración de los partidos.");
      }
    }
  };

  const [addingMatchSlot, setAddingMatchSlot] = useState<{courtId: number, time: string} | null>(null);

  const deleteMatch = (matchId: string) => {
    if (isLocked) return;
    setMatches(prev => prev.filter(m => m.id !== matchId));
  };

  const addManualMatch = (courtId: number, timeStr: string, category: string, t1: string, t2: string) => {
    if (isLocked) return;
    const [h, min] = timeStr.split(':').map(Number);
    const baseDate = matches.length > 0 ? new Date(matches[0].startTime) : new Date();
    const startTime = new Date(baseDate);
    startTime.setHours(h, min, 0, 0);
    const endTime = new Date(startTime.getTime() + config.gameDuration * 60000);
    
    const newMatch: Match = {
      id: `manual-${Math.random().toString(36).substr(2, 9)}`,
      category,
      phase: 'Manual',
      team1: t1,
      team2: t2,
      startTime,
      endTime,
      court: courtId
    };
    
    setMatches(prev => [...prev, newMatch]);
    setAddingMatchSlot(null);
  };

  const updateScore = (matchId: string, t1: number | undefined, t2: number | undefined) => {
    setMatches(prev => {
      const nextMatches = prev.map(m => m.id === matchId ? { ...m, score1: t1, score2: t2 } : m);

      // Auto-sync scores to Supabase so live view reflects updates without requiring manual save.
      if (isSupabaseConfigured && currentTournament) {
        if (scoreSyncTimeoutRef.current !== null) {
          window.clearTimeout(scoreSyncTimeoutRef.current);
        }

        scoreSyncTimeoutRef.current = window.setTimeout(async () => {
          try {
            const updatedData = {
              ...currentTournament.data,
              matches: nextMatches,
              config,
              teamInput,
              teamsByCategory,
              appCategories,
              isLocked,
            };

            const { error: syncError } = await supabase
              .from('tournaments')
              .update({ data: updatedData, updated_at: new Date().toISOString() })
              .eq('id', currentTournament.id);

            if (syncError) throw syncError;

            setTournaments((prevTournaments) => prevTournaments.map((t) => (
              t.id === currentTournament.id
                ? { ...t, data: updatedData }
                : t
            )));
            setCurrentTournament((prevTournament) => (
              prevTournament && prevTournament.id === currentTournament.id
                ? { ...prevTournament, data: updatedData }
                : prevTournament
            ));
          } catch (syncErr) {
            console.error('Error auto-syncing scores:', syncErr);
          }
        }, 800);
      }

      return nextMatches;
    });
  };

  const updateTeam = (cat: string, oldName: string, updatedTeam: TeamData) => {
    if (!updatedTeam.name.trim()) return;
    
    const currentTeams = teamsByCategory[cat] || [];
    setTeamsByCategory({
      ...teamsByCategory,
      [cat]: currentTeams.map(t => t.name === oldName ? { name: updatedTeam.name, playerCount: updatedTeam.playerCount } : t)
    });

    setMatches(prev => prev.map(m => {
      if (m.category !== cat) return m;
      return {
        ...m,
        team1: m.team1 === oldName ? updatedTeam.name : m.team1,
        team2: m.team2 === oldName ? updatedTeam.name : m.team2
      };
    }));
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
      
      // EXCLUDE matches that are purely for filling holes (Fase Relleno)
      // BUT INCLUDE 'Min. Partidos' as per user request
      if (m.phase === 'Fase Relleno' || m.id.startsWith('FILL-')) return;
      
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
    
    const resolveCategoryMatchType = (cat: string, count: number): CategoryMatchType => {
      const explicitType = config.categoryConfig?.[cat]?.matchType;
      if (explicitType) return explicitType;
      return count < (config.playoffThreshold || 6) ? 'Liga' : 'Playoffs';
    };

    Object.keys(stats).forEach(cat => {
      const catTeamsBase = teams.filter(t => t.category === cat);
      const allTeamsData = Object.entries(stats[cat]).map(([name, data]) => ({ name, ...data }));
      
      const n = catTeamsBase.length;
      const matchType = resolveCategoryMatchType(cat, n);
      if (matchType === 'Playoffs' && n >= 4) {
        // Handle 2 groups logic (same as scheduler.ts)
        let groupA_Names: string[] = [];
        let groupB_Names: string[] = [];

        const manualGroups = config.manualGroups?.[cat];
        if (manualGroups && manualGroups['A'] && manualGroups['B']) {
          groupA_Names = [...manualGroups['A']];
          groupB_Names = [...manualGroups['B']];
          
          // Ensure all current teams are accounted for (in case teams changed but manual groups didn't update yet)
          const assigned = new Set([...groupA_Names, ...groupB_Names]);
          catTeamsBase.forEach(t => {
            if (!assigned.has(t.name)) {
              if (groupA_Names.length <= groupB_Names.length) groupA_Names.push(t.name);
              else groupB_Names.push(t.name);
            }
          });
        } else {
          groupA_Names = catTeamsBase.slice(0, Math.ceil(n/2)).map(t => t.name);
          groupB_Names = catTeamsBase.slice(Math.ceil(n/2)).map(t => t.name);
        }
        
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
  }, [matches, teams, config]);

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
              (gm.phase.toLowerCase().includes('grupo') || 
               gm.phase.toLowerCase().includes('ida') || 
               gm.phase.toLowerCase().includes('vuelta') ||
               gm.phase.toLowerCase().includes('liga'))
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
        if (name.includes('Ganador Semifinal') || name.includes('Ganador S')) {
          const semiId = (name.includes('Semifinal 1') || name.includes('S1')) ? 'Semifinal 1' : 'Semifinal 2';
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

  const parseClockToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const formatMinutesToClock = (totalMinutes: number) => {
    const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(normalized / 60).toString().padStart(2, '0');
    const m = (normalized % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const generalBreakDuration = Math.max(0, config.generalBreakDuration || 0);
  const generalBreakStartMinutes = parseClockToMinutes(config.generalBreakTime || '11:30');
  const generalBreakEndMinutes = generalBreakStartMinutes + generalBreakDuration;
  const generalBreakEndLabel = formatMinutesToClock(generalBreakEndMinutes);

  const isPauseTime = (time: string) => {
    if (generalBreakDuration <= 0) return false;
    const t = parseClockToMinutes(time);
    return t >= generalBreakStartMinutes && t < generalBreakEndMinutes;
  };

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

  const shouldRenderGeneralBreakBeforeIndex = (idx: number) => {
    if (generalBreakDuration <= 0 || groupedMatchesByTime.length === 0) return false;
    const current = parseClockToMinutes(groupedMatchesByTime[idx][0]);
    const prev = idx > 0 ? parseClockToMinutes(groupedMatchesByTime[idx - 1][0]) : Number.NEGATIVE_INFINITY;
    return prev < generalBreakStartMinutes && current >= generalBreakStartMinutes;
  };

  const categories = Array.from(new Set(teams.map(t => t.category)));
  const phases = Array.from(new Set(resolvedMatches.map(m => m.phase)));
  const courtNumbers = config.courtConfigs.map(c => c.id.toString());

  const handlePrint = () => {
    console.log('Intentando imprimir...');
    try {
      window.print();
      console.log('Comando window.print() enviado.');
    } catch (err) {
      console.error('Error al intentar imprimir:', err);
      setError('La impresión directa está bloqueada por seguridad. Por favor, abre la app en una "Nueva Pestaña" (icono arriba a la derecha) para poder Imprimir / Guardar PDF.');
    }
  };

  const isCurrentTournamentActive = useMemo(() => {
    if (!currentTournament?.event_date) return false;
    const today = new Date();
    const eventDate = new Date(currentTournament.event_date);
    // Ignora la hora, compara solo año-mes-día
    return (
      eventDate.getFullYear() > today.getFullYear() ||
      (eventDate.getFullYear() === today.getFullYear() && eventDate.getMonth() > today.getMonth()) ||
      (eventDate.getFullYear() === today.getFullYear() && eventDate.getMonth() === today.getMonth() && eventDate.getDate() >= today.getDate())
    );
  }, [currentTournament]);

  const appBaseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const rawBase = import.meta.env.BASE_URL || '/';
    const normalizedBase = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
    const withTrailingSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`;
    return `${window.location.origin}${withTrailingSlash}`;
  }, []);

  const currentTournamentLiveUrl = useMemo(() => {
    if (!currentTournament || !appBaseUrl) return '';
    return `${appBaseUrl}#/live/${currentTournament.id}`;
  }, [currentTournament, appBaseUrl]);

  const openQrModal = () => {
    const payload = {
      tournamentId: currentTournament?.id,
      tournamentName: currentTournament?.name,
      liveUrl: currentTournamentLiveUrl,
      active: isCurrentTournamentActive,
    };
    console.info('[QR-TRACE] open', payload);
    setIsQrModalOpen(true);
  };

  const printQrSheet = () => {
    const qrSvg = qrCodePreviewRef.current?.querySelector('svg');
    const qrCanvas = qrCodeCanvasRef.current;
    console.info('[QR-TRACE] print', {
      tournamentId: currentTournament?.id,
      liveUrl: currentTournamentLiveUrl,
      modalOpen: isQrModalOpen,
      hasSvg: Boolean(qrSvg),
      hasCanvas: Boolean(qrCanvas),
    });

    if (!currentTournament || !currentTournamentLiveUrl || !qrCanvas || typeof window === 'undefined') {
      console.warn('[QR-TRACE] print-fallback', { reason: 'missing-data-or-canvas' });
      handlePrint();
      return;
    }

    let qrDataUrl: string;
    try {
      qrDataUrl = qrCanvas.toDataURL('image/png');
    } catch (err) {
      console.error('[QR-TRACE] canvas-to-dataurl-error', err);
      handlePrint();
      return;
    }

    const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QR vivo - ${currentTournament.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    @page { size: portrait; margin: 12mm; }
    html, body { margin: 0; padding: 0; background: #fff; color: #0f172a; font-family: Inter, Arial, sans-serif; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .sheet { width: 96mm; max-width: 96mm; padding: 12mm; border: 2px solid #e2e8f0; border-radius: 18px; display: flex; flex-direction: column; align-items: center; gap: 8mm; box-sizing: border-box; }
    .kicker { margin: 0; font-size: 10pt; font-weight: 900; letter-spacing: .28em; text-transform: uppercase; color: #e94560; }
    h1 { margin: 0; text-align: center; font-size: 22pt; line-height: 1.05; font-weight: 900; font-style: italic; }
    .subtitle { margin: 0; text-align: center; font-size: 11pt; color: #475569; }
    .qr-wrap { padding: 4mm; border: 1px solid #e2e8f0; border-radius: 12px; }
    .qr-img { display: block; width: 72mm; height: 72mm; }
    .url { margin: 0; text-align: center; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9pt; color: #334155; word-break: break-all; }
  </style>
</head>
<body>
  <div class="sheet">
    <p class="kicker">QR vivo</p>
    <h1>${currentTournament.name.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h1>
    <p class="subtitle">Escanea para abrir la vista pública</p>
    <div class="qr-wrap"><img class="qr-img" src="${qrDataUrl}" alt="QR vivo" /></div>
    <p class="url">${currentTournamentLiveUrl}</p>
  </div>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');

    const cleanup = () => {
      window.removeEventListener('afterprint', cleanup);
      iframe.remove();
    };

    iframe.onload = () => {
      const printDoc = iframe.contentWindow?.document;
      const printWin = iframe.contentWindow;
      if (!printDoc || !printWin) {
        console.error('[QR-TRACE] iframe-missing-window');
        cleanup();
        handlePrint();
        return;
      }

      console.info('[QR-TRACE] print-iframe-ready', {
        tournamentId: currentTournament.id,
        readyState: printDoc.readyState,
      });

      const runPrint = () => {
        try {
          printWin.focus();
          printWin.print();
          window.addEventListener('afterprint', cleanup, { once: true });
        } catch (err) {
          console.error('[QR-TRACE] iframe-print-error', err);
          cleanup();
          handlePrint();
        }
      };

      if (printDoc.readyState === 'complete') {
        setTimeout(runPrint, 300);
      } else {
        printWin.addEventListener('load', () => setTimeout(runPrint, 300), { once: true });
      }
    };

    document.body.appendChild(iframe);
    const printDoc = iframe.contentWindow?.document;
    if (!printDoc) {
      console.error('[QR-TRACE] iframe-document-missing');
      iframe.remove();
      handlePrint();
      return;
    }

    printDoc.open();
    printDoc.write(html);
    printDoc.close();
  };

  if (!currentTournament) {
    return (
      <LandingPage 
        tournaments={tournaments} 
        onSelect={handleSelectTournament} 
        onCreate={createTournament} 
        onDelete={confirmAndDeleteTournament}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div className={`flex flex-col h-screen bg-slate-50 font-sans text-slate-900 ${isQrModalOpen ? 'qr-mode' : ''}`}>
      {/* Top Header */}
      <header className="bg-[#1a1a2e] text-white py-1 md:py-3 px-4 md:px-8 border-b-2 md:border-b-4 border-[#e94560] flex items-center justify-between shadow-xl shrink-0 gap-2 md:gap-4 relative z-[100] transition-all short-compact">
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setCurrentTournament(null)}
            className="p-1.5 md:p-2 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
            title="Volver al inicio"
          >
            <ArrowLeft className="w-3.5 h-3.5 md:w-5 md:h-5" />
          </button>
          <div className="hidden lg:block bg-[#e94560] p-1.5 md:p-2 rounded-lg transform -rotate-3">
            <Trophy className="w-5 h-5 md:w-8 md:h-8 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[10px] md:text-xl font-black italic tracking-tighter uppercase leading-none truncate pr-1 max-w-[190px] sm:max-w-[290px] md:max-w-none">
              {currentTournament.name} <span className="text-[#e94560] hidden md:inline">3x3</span>
            </h1>
            <p className="text-[6px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 md:mt-1 truncate leading-none">
              {new Date(currentTournament.event_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </p>
          </div>
        </div>

        <div className="flex gap-1 md:gap-4 items-center flex-1 justify-end">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="lg:hidden p-1.5 bg-[#16213e] rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button 
            onClick={() => setIsSidebarVisible(!isSidebarVisible)}
            className="hidden lg:flex p-2 bg-[#16213e] rounded-lg border border-slate-700 text-slate-400 hover:text-white transition-colors items-center gap-2"
            title={isSidebarVisible ? "Ocultar Ajustes" : "Mostrar Ajustes"}
          >
            {isSidebarVisible ? <Settings className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex gap-1 md:gap-2 bg-[#16213e] rounded-lg md:rounded-xl p-0.5 px-2 border border-slate-700 shadow-inner shrink-0 shadow-lg overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setTournamentView('courts')}
              className={`flex items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'courts' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <MapPin className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden xs:inline">PISTAS</span>
            </button>
            <button 
              onClick={() => setTournamentView('teams')}
              className={`flex items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'teams' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Users className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden xs:inline">EQUIPOS</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); if (viewMode === 'classification') setViewMode('grid'); }}
              className={`flex items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && (viewMode === 'grid' || viewMode === 'calendar') ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <Calendar className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden xs:inline">HORARIOS</span>
            </button>
            <button 
              onClick={() => { setTournamentView('matches'); setViewMode('classification'); }}
              className={`flex items-center justify-center gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-md md:rounded-lg text-[7px] md:text-[10px] font-black transition-all shrink-0 ${tournamentView === 'matches' && viewMode === 'classification' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
            >
              <ListOrdered className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden xs:inline">TABLA</span>
            </button>
          </div>

          {isCurrentTournamentActive && (
            <a 
              href={currentTournamentLiveUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-[7px] md:text-[10px] font-black text-[#22d3ee] bg-[#22d3ee]/10 border border-[#22d3ee]/30 hover:bg-[#22d3ee]/20 transition flex items-center gap-1 shrink-0"
              title="Abrir vista pública en nueva pestaña"
            >
              <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" /> <span className="hidden sm:inline">VIVO</span>
            </a>
          )}
          
          <div className="hidden xl:flex items-center gap-4 border-l border-slate-700 pl-4">
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-[150] w-[min(92vw,22rem)] sm:w-80 bg-white border-r border-slate-200 flex flex-col shadow-2xl shrink-0 transition-all duration-300 transform no-print
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 
          ${isSidebarVisible ? 'lg:flex lg:w-80' : 'lg:hidden lg:w-0'}
        `}>
          <div className="px-5 py-4 border-b border-slate-100 bg-white lg:bg-transparent lg:px-6 lg:pt-6 lg:pb-2">
            <div className="flex items-center gap-2 rounded-xl bg-[#1a1a2e] text-white px-3 py-2.5 lg:bg-transparent lg:text-slate-700 lg:p-0">
              <Trophy className="w-4 h-4 md:w-5 md:h-5 text-[#e94560]" />
              <span className="font-black italic text-xs md:text-sm tracking-tighter">CONFIGURACIÓN</span>
              <button onClick={() => setIsSidebarOpen(false)} className="ml-auto p-1.5 hover:bg-white/10 rounded-lg lg:hidden" aria-label="Cerrar menú lateral">
                <X className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button 
                onClick={() => setIsSidebarVisible(false)}
                className="hidden lg:flex ml-auto p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                title="Ocultar menú"
                aria-label="Ocultar menú lateral"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#e94560]" />
                <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">Ajustes del Torneo</h2>
                {(isLocked || hasScores) && (
                  <div className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg text-[8px] font-black text-amber-600 uppercase border border-amber-100 animate-pulse">
                    <Lock className="w-2.5 h-2.5" />
                    Fijado
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Resumen Pistas</label>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-base text-slate-900 truncate">{config.courtConfigs.length} Pistas</span>
                    <button 
                      onClick={() => setTournamentView('courts')}
                      className="text-[8px] font-black text-[#e94560] uppercase hover:underline shrink-0"
                    >
                      Config
                    </button>
                  </div>
                </div>
                <div className="w-full min-w-0 bg-[#1a1a2e] p-3 rounded-xl border border-white/5">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Partidos Totales</label>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-[#e94560]" />
                    <span className="font-mono font-black text-base text-white">{resolvedMatches.length}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Juego (m)</label>
                  <input 
                    type="number" 
                    value={config.gameDuration ?? ''} 
                    disabled={isLocked || hasScores}
                    onChange={e => {
                      const val = e.target.value;
                      setConfig(c => ({...c, gameDuration: val === '' ? undefined as any : Math.max(1, Number(val))}));
                    }} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none appearance-auto ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Descanso (m)</label>
                  <input 
                    type="number" 
                    value={config.breakDuration ?? ''} 
                    disabled={isLocked || hasScores}
                    onChange={e => {
                      const val = e.target.value;
                      setConfig(c => ({...c, breakDuration: val === '' ? undefined as any : Math.max(0, Number(val))}));
                    }} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none appearance-auto ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Fecha del Torneo</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openEventDatePicker}
                      disabled={isLocked}
                      className={`flex-1 h-10 rounded-lg border border-slate-200 px-3 bg-white text-left font-mono text-sm font-bold outline-none ${isLocked ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900 cursor-pointer'}`}
                      aria-label="Seleccionar fecha del torneo"
                    >
                      {formatEventDateDisplay(eventDate)}
                    </button>
                    <button
                      type="button"
                      onClick={openEventDatePicker}
                      disabled={isLocked}
                      className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                      aria-label="Abrir selector de fecha"
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    ref={eventDatePickerRef}
                    type="date"
                    value={eventDate}
                    disabled={isLocked}
                    onChange={e => setEventDate(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Inicio</label>
                  <input 
                    type="time" 
                    value={config.startTime ?? "09:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, startTime: e.target.value}))} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Pausa Gral</label>
                  <input 
                    type="time" 
                    value={config.generalBreakTime ?? "11:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, generalBreakTime: e.target.value}))} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-1">Hora Fin</label>
                  <input 
                    type="time" 
                    value={config.endTime ?? "14:30"} 
                    disabled={isLocked || hasScores}
                    onChange={e => setConfig(c => ({...c, endTime: e.target.value}))} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <label className="text-[9px] font-black text-[#e94560] uppercase block mb-1">Mín. Partidos</label>
                  <input 
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1"
                    value={config.minGamesPerTeam ?? ''} 
                    disabled={isLocked || hasScores}
                    onChange={e => {
                      const raw = e.target.value;
                      const cleaned = raw.replace(/[^0-9]/g, '');
                      if (cleaned === '') {
                        setConfig(c => ({ ...c, minGamesPerTeam: undefined as any }));
                        return;
                      }
                      setConfig(c => ({ ...c, minGamesPerTeam: Math.max(1, Number(cleaned)) }));
                    }} 
                    className={`w-full h-10 rounded-lg border border-slate-200 px-3 bg-white font-mono font-black text-lg leading-none outline-none ${(isLocked || hasScores) ? 'text-slate-400 cursor-not-allowed' : 'text-slate-900'}`} 
                  />
                </div>

                <div className="w-full min-w-0 bg-slate-100 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex flex-col min-w-0">
                    <label className="text-[10px] font-black text-[#e94560] uppercase block">Fase de Relleno</label>
                    <p className="text-[8px] font-bold text-slate-400 mt-0.5">Completa el calendario sin huecos</p>
                  </div>
                  <button
                    onClick={toggleFillPhase}
                    disabled={isLocked || hasScores}
                    className={`flex items-center justify-center p-3 rounded-xl border-2 transition-all shrink-0 ${config.useFillPhase ? 'bg-[#e94560] border-[#e94560] text-white shadow-lg' : 'bg-white border-slate-300 text-slate-400'}`}
                  >
                    {config.useFillPhase ? (
                      <LayoutGrid className="w-5 h-5" />
                    ) : (
                      <LayoutGrid className="w-5 h-5 opacity-40 shadow-none" />
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
                {(Object.entries(teamsByCategory) as [string, TeamData[]][]).filter(([_, list]) => list.length > 0).length === 0 ? (
                  <p className="text-[9px] font-bold text-slate-400 italic text-center py-2">Sin equipos inscritos</p>
                ) : (
                  (Object.entries(teamsByCategory) as [string, TeamData[]][]).map(([cat, list]) => (
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
            {criticalError && (
              <div className="mb-4 p-4 bg-red-50 border-2 border-red-400 text-red-700 rounded-xl text-[11px] font-bold flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 flex flex-col gap-2">
                  <span className="text-red-900 font-black">Conflicto de horario</span>
                  <span className="text-red-700 font-semibold leading-relaxed">{criticalError}</span>
                  <button 
                    onClick={() => setCriticalError(null)}
                    className="text-red-600 hover:text-red-800 underline text-[10px] font-black mt-2 text-left"
                  >
                    Cerrar mensaje
                  </button>
                </div>
              </div>
            )}
            {error && !criticalError && (
              <div className="mb-4 p-3 bg-yellow-100 text-yellow-700 rounded-xl text-[10px] font-bold flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {isCurrentTournamentActive && (
              <button
                onClick={openQrModal}
                className="w-full mb-3 py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.22em] transition-all bg-[#22d3ee] text-slate-950 hover:bg-[#67e8f9] shadow-lg flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                Generar QR vivo
              </button>
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
        <section id="printable-content" className="flex-1 bg-slate-100 overflow-hidden flex flex-col min-w-0">
          {/* Tournament Actions Bar */}
          <div className="bg-white border-b border-slate-200 px-4 md:px-8 py-1 md:py-2 flex items-center justify-between shrink-0 gap-2 md:gap-4 overflow-x-auto no-scrollbar short-hidden">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <h2 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap print:text-lg print:text-slate-900">
                  {tournamentView === 'teams' ? 'Equipos' : viewMode === 'grid' ? 'Vista Pistas' : viewMode === 'calendar' ? 'Calendario' : 'Clasificación'}
                </h2>
                <div className="flex items-center gap-3 mt-1 text-[8px] font-bold text-slate-500 print-only print:text-xs">
                  <span>{resolvedMatches.length} Partidos</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>{config.courtConfigs.length} Pistas</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300" />
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
              {resolvedMatches.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 md:py-1 bg-slate-100 rounded-full border border-slate-200 shadow-sm shrink-0 no-print">
                  <Trophy className="w-2.5 h-2.5 text-[#e94560]" />
                  <span className="text-[9px] md:text-[10px] font-black text-slate-700">{resolvedMatches.length} <span className="text-slate-400 font-bold">PARTIDOS</span></span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <button
                onClick={() => setIsLocked(!isLocked)}
                className={`flex items-center gap-1 px-2 py-1 md:px-4 md:py-2 rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest transition-all ${isLocked ? 'bg-[#e94560] text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                title={isLocked ? "Desbloquear edición" : "Bloquear edición"}
              >
                {isLocked ? <Lock className="w-3 h-3 md:w-3.5 md:h-3.5" /> : <Unlock className="w-3 h-3 md:w-3.5 md:h-3.5" />}
                <span className="hidden xs:inline ml-1">{isLocked ? 'CERRADO' : 'ABIERTO'}</span>
              </button>

              <div className="h-6 w-px bg-slate-200" />
              
              <button 
                onClick={saveTournament}
                disabled={isSaving}
                className="flex items-center gap-1 px-2 py-1 md:px-4 md:py-2 bg-[#1a1a2e] text-white rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                <Save className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden xs:inline ml-1">{isSaving ? '...' : 'GUARDAR'}</span>
              </button>

              <button 
                onClick={handlePrint}
                disabled={matches.length === 0}
                className="flex items-center gap-1 px-2 py-1 md:px-4 md:py-2 bg-[#e94560] text-white rounded-lg md:rounded-xl text-[8px] md:text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all no-print disabled:opacity-50 shadow-lg hover:shadow-red-200"
              >
                <Printer className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden xs:inline ml-1">IMPRIMIR / PDF</span>
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
              <div className="flex-1 flex flex-col relative min-h-0">
                {/* Unified Header with Toggle and Filters */}
                <div className="bg-white border-b border-slate-200 p-1 md:p-2.5 flex flex-wrap items-center justify-between gap-2 md:gap-3 shrink-0 px-4 md:px-8 shadow-sm z-[100] short-compact">
                    {(viewMode === 'grid' || viewMode === 'calendar') && (
                      <div className="flex bg-slate-100 p-0.5 md:p-1 rounded-lg md:rounded-xl shrink-0">
                        <button 
                          onClick={() => setViewMode('grid')}
                          className={`px-2 md:px-4 py-1 md:py-1.5 rounded-md md:rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${viewMode === 'grid' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          PISTAS
                        </button>
                        <button 
                          onClick={() => setViewMode('calendar')}
                          className={`px-2 md:px-4 py-1 md:py-1.5 rounded-md md:rounded-lg text-[7px] md:text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${viewMode === 'calendar' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          HORAS
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 md:gap-3 shrink-0 relative z-[70]">
                      <div className="relative">
                        <button
                          onClick={() => setShowCatFilter(!showCatFilter)}
                          className={`bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[9px] md:text-[11px] font-bold outline-none max-w-[120px] md:min-w-[140px] text-left flex justify-between gap-1 items-center transition-all ${showCatFilter ? 'border-[#e94560] ring-1 ring-[#e94560]/10' : ''}`}
                        >
                          <span className="truncate">
                            {filterCats.length === 0 ? 'Cat.' : `${filterCats.length === 1 ? filterCats[0] : `${filterCats.length} Cat`}`}
                          </span>
                          <Filter className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-slate-400 shrink-0" />
                        </button>

                        <AnimatePresence>
                          {showCatFilter && (
                            <>
                              <div className="fixed inset-0 z-[65]" onClick={() => setShowCatFilter(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full right-0 mt-2 w-[240px] max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-2xl border border-slate-200 z-[70] py-2 max-h-[300px] overflow-y-auto custom-scrollbar md:left-0 md:right-auto"
                              >
                                <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 mb-1 sticky top-0 z-10">
                                  <span className="text-[9px] font-black uppercase text-slate-400">Filtrar</span>
                                  <button onClick={() => setFilterCats([])} className="text-[9px] font-black uppercase text-[#e94560] hover:underline">Limpiar</button>
                                </div>
                                <div className="px-1">
                                  {categories.map(cat => {
                                    const isSelected = filterCats.includes(cat);
                                    return (
                                      <button
                                        key={cat}
                                        onClick={() => setFilterCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left transition-all ${isSelected ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-slate-600 hover:bg-slate-50'}`}
                                      >
                                        {cat}
                                        {isSelected ? <CheckCircle2 className="w-3.5 h-3.5 text-[#e94560]" /> : <Circle className="w-3.5 h-3.5 text-slate-200" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                      
                      <div className="relative">
                        <button
                          onClick={() => setShowTeamFilter(!showTeamFilter)}
                          className={`bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 md:px-3 md:py-1.5 text-[9px] md:text-[11px] font-bold outline-none max-w-[120px] md:min-w-[180px] text-left flex justify-between gap-1 items-center transition-all ${showTeamFilter ? 'border-[#e94560] ring-1 ring-[#e94560]/10' : ''}`}
                        >
                          <span className="truncate">
                            {filterTeams.length === 0 ? 'Equipos' : `${filterTeams.length === 1 ? filterTeams[0] : `${filterTeams.length} Eq`}`}
                          </span>
                          <Search className="w-2.5 h-2.5 md:w-3.5 md:h-3.5 text-slate-400 shrink-0" />
                        </button>

                        <AnimatePresence>
                          {showTeamFilter && (
                            <>
                              <div className="fixed inset-0 z-[65]" onClick={() => setShowTeamFilter(false)} />
                              <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute top-full right-0 mt-2 w-[240px] bg-white rounded-xl shadow-2xl border border-slate-200 z-[70] py-2 max-h-[300px] overflow-y-auto custom-scrollbar"
                              >
                                <div className="px-3 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 mb-1 sticky top-0 z-10">
                                  <span className="text-[9px] font-black uppercase text-slate-400">Filtrar</span>
                                  <button onClick={() => setFilterTeams([])} className="text-[9px] font-black uppercase text-[#e94560] hover:underline">Limpiar</button>
                                </div>
                                <div className="px-1">
                                  {teamNames.map((team, idx) => {
                                    if (!team) return null;
                                    const isSelected = filterTeams.includes(team.name);
                                    const showCategoryHeader = (filterCats.length !== 1) && (idx === 0 || team.category !== teamNames[idx - 1]?.category);
                                    return (
                                      <div key={`${team.name}-${team.category}`}>
                                        {showCategoryHeader && (
                                          <div className="px-3 py-1 mt-2 mb-1 bg-slate-100 text-[8px] font-black uppercase text-slate-500 rounded-sm border-l-2 border-slate-300">{team.category}</div>
                                        )}
                                        <button
                                          onClick={() => setFilterTeams(prev => prev.includes(team.name) ? prev.filter(n => n !== team.name) : [...prev, team.name])}
                                          className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left transition-all ${isSelected ? 'bg-[#e94560]/10 text-[#e94560]' : 'text-slate-600 hover:bg-slate-50'}`}
                                        >
                                          <span className="text-[10px] md:text-[11px] font-bold truncate">{team.name}</span>
                                          {isSelected ? <CheckCircle2 className="w-3.5 h-3.5 text-[#e94560] shrink-0" /> : <Circle className="w-3.5 h-3.5 text-slate-200 shrink-0" />}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Compact Lock/Save for Short Screens */}
                      <div className="hidden short:flex items-center gap-1 border-l border-slate-200 pl-2">
                        <button
                          onClick={() => setIsLocked(!isLocked)}
                          className={`p-1.5 rounded-lg transition-all ${isLocked ? 'bg-[#e94560] text-white' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
                          title={isLocked ? "Desbloquear" : "Bloquear"}
                        >
                          {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={saveTournament}
                          disabled={isSaving}
                          className="p-1.5 bg-[#1a1a2e] text-white rounded-lg hover:bg-slate-800 transition-all disabled:opacity-50"
                          title="Guardar"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="hidden xs:block text-[8px] md:text-[10px] font-black text-slate-400 shrink-0 whitespace-nowrap">Resultados: {filteredMatches.length}</div>
                  </div>

                  {viewMode === 'classification' ? (
                    <div className="flex-1 overflow-y-auto p-3 md:p-8 space-y-8 md:space-y-12 bg-white scroll-smooth custom-scrollbar">
                        {/* Classification view respects filterCats */}
                        {(categories as string[]).filter(cat => filterCats.length === 0 || filterCats.includes(cat)).map(cat => {
                        const catData = classification[cat];
                        return (
                          <section key={cat} className="space-y-4 md:space-y-6">
                            <h2 className="text-xl md:text-2xl font-black italic uppercase tracking-tighter text-[#1a1a2e]">{cat}</h2>
                            
                            {catData?.groups ? (
                              <>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                                   {Object.entries(catData.groups as Record<string, any[]>).map(([letter, groupTeams]) => (
                                     <div 
                                       key={letter} 
                                     onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = "move";
                                        const el = e.currentTarget as HTMLElement;
                                        el.classList.add('bg-[#e94560]/10', 'ring-2', 'ring-[#e94560]', 'ring-dashed');
                                     }}
                                     onDragEnter={(e) => { 
                                        e.preventDefault();
                                     }}
                                     onDragLeave={(e) => {
                                        const el = e.currentTarget as HTMLElement;
                                        if (!el.contains(e.relatedTarget as Node)) {
                                          el.classList.remove('bg-[#e94560]/10', 'ring-2', 'ring-[#e94560]', 'ring-dashed');
                                        }
                                     }}
                                     onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const el = e.currentTarget as HTMLElement;
                                        el.classList.remove('bg-[#e94560]/10', 'ring-2', 'ring-[#e94560]', 'ring-dashed');
                                        const dataStr = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("text");
                                        if (dataStr && dataStr.includes('|')) {
                                          const parts = dataStr.split('|');
                                          if (parts.length >= 2) {
                                            const teamName = parts[0];
                                            const fromCat = parts[1];
                                            if (teamName && fromCat === cat) {
                                              handleMoveTeamBetweenGroups(cat, teamName, letter);
                                            }
                                          }
                                        }
                                     }}
                                     >
                                       <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] px-2 md:px-4">Grupo {letter}</h3>
                                       <div className="rounded-xl md:rounded-2xl border border-slate-200 overflow-hidden shadow-sm overflow-x-auto no-scrollbar bg-white transition-all ring-inset hover:ring-1 hover:ring-slate-300">
                                         <ClassificationTable teams={groupTeams} filterTeams={filterTeams} canDragTeams={true} cat={cat} />
                                       </div>
                                     </div>
                                   ))}
                                </div>
                                <div className="mt-4 flex items-center gap-2 bg-blue-50 border border-blue-100 p-3 rounded-lg no-print">
                                  <Info className="w-4 h-4 text-blue-500" />
                                  <p className="text-[10px] md:text-xs font-bold text-blue-600 italic">
                                    Puedes arrastrar equipos entre los grupos A y B. Recuerda pulsar <span className="font-black underline text-[#e94560]">"GENERAR TORNEO"</span> para aplicar los cambios al calendario.
                                  </p>
                                </div>
                              </>
                            ) : (
                              <div className="rounded-xl md:rounded-2xl border border-slate-200 overflow-hidden shadow-sm overflow-x-auto no-scrollbar">
                                <ClassificationTable teams={catData?.all || []} filterTeams={filterTeams} />
                              </div>
                            )}

                            <PlayoffSection category={cat} matches={resolvedMatches} onUpdateScore={updateScore} isLocked={isLocked} filterTeams={filterTeams} />
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    (viewMode === 'grid' || viewMode === 'calendar') ? (
                      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                        
                        {viewMode === 'grid' ? (
                          <div className="flex-1 min-h-0 overflow-auto bg-slate-300/50 custom-scrollbar">
                            <div className="min-w-max flex flex-col">
                              {/* Sticky Header now inside the scrollable area */}
                              <div 
                                className="flex sticky top-0 z-30 bg-[#1a1a2e] text-slate-400 text-[8px] md:text-[10px] font-black uppercase tracking-widest border-b border-slate-800 select-none shadow-md short-compact"
                                style={{ minWidth: `calc(60px + ${config.courtConfigs.length * 130}px)` }}
                              >
                                <div className="w-[60px] md:w-[120px] py-1.5 md:py-4 px-2 md:px-6 border-r border-slate-800 shrink-0 bg-[#1a1a2e] sticky left-0 z-40 shadow-[2px_0_5px_rgba(0,0,0,0.2)] short-compact print-time-column">Horario</div>
                                {config.courtConfigs.map((c, i) => (
                                  <div key={i} className={`w-[130px] md:w-[180px] py-1.5 md:py-4 px-1 md:px-6 text-center border-r border-slate-800 shrink-0 bg-[#1a1a2e] short-compact print-court-column`}>
                                    Pista {c.id}
                                    {c.rimType === 'low' && (
                                      <span className="block text-[6px] md:text-[7px] text-[#e94560] mt-0.5 font-black tracking-tighter uppercase short-hidden">Aro Bajo</span>
                                    )}
                                  </div>
                                ))}
                              </div>

                              <div className="flex-1">
                                <AnimatePresence>
                                  {groupedMatchesByTime.map(([time, slotMatches], idx) => (
                                    <div key={time} className={`flex flex-col ${isPauseTime(time) ? 'print-pause-row' : ''}`}>
                                      {shouldRenderGeneralBreakBeforeIndex(idx) && (
                                        <div
                                          className="self-start flex shrink-0 border-y border-amber-300 bg-amber-100/80 text-[9px] md:text-[11px] font-black uppercase tracking-wider text-amber-700 no-print"
                                        >
                                          <div className="w-[60px] md:w-[120px] shrink-0 border-r border-amber-300" />
                                          <div className="relative flex shrink-0">
                                            {config.courtConfigs.map((cc, breakIdx) => (
                                              <div
                                                key={`break-${cc.id}`}
                                                className={`w-[130px] md:w-[180px] shrink-0 py-1.5 md:py-2 ${breakIdx < config.courtConfigs.length - 1 ? 'border-r border-amber-300' : ''}`}
                                              >
                                                
                                              </div>
                                            ))}
                                            <div className="absolute inset-0 flex items-center justify-center text-center px-2">
                                              Descanso General {config.generalBreakTime} - {generalBreakEndLabel}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                      <div 
                                        className={`flex border-b border-white/20 min-h-[40px] md:min-h-[90px] short-compact ${isPauseTime(time) ? 'print-pause-row' : ''}`}
                                        style={{ minWidth: `calc(60px + ${config.courtConfigs.length * 130}px)` }}
                                      >
                                        <div className="w-[60px] md:w-[120px] bg-white sticky left-0 z-20 flex flex-col items-center justify-center border-r border-slate-200 px-1 md:px-4 shrink-0 shadow-[2px_0_5px_rgba(0,0,0,0.05)] short-compact print-time-slot">
                                           <span className="font-mono text-xs md:text-base font-black text-slate-700 leading-none print-time-text">{time}</span>
                                        </div>
                                        {config.courtConfigs.map((cc, courtIdx) => {
                                           const match = slotMatches.find(m => m.court === cc.id);
                                           const isHighlighted = filterTeams.length > 0 ? (filterTeams.includes(match?.team1 || '') || filterTeams.includes(match?.team2 || '')) : false;
                                           const isOtherHighlighted = filterTeams.length > 0 && !isHighlighted;
                                           const isSemi = match?.phase.toLowerCase().includes('semifinal');
                                           const isFinal = !isSemi && (match?.phase.toLowerCase().includes('final'));
                                           const isPlayoff = isSemi || isFinal;
                                           return (
                                             <div 
                                               key={courtIdx} 
                                               className={`w-[130px] md:w-[180px] p-1 md:p-1.5 bg-white relative shrink-0 print-court-slot ${courtIdx < config.courtConfigs.length - 1 ? 'border-r border-slate-100' : ''} ${selectedMatchId && !match ? 'ring-2 ring-indigo-400 ring-inset cursor-pointer' : ''}`}
                                               onClick={() => {
                                                 if (selectedMatchId && !match && !isLocked && !hasScores) {
                                                   handleMatchDrop(selectedMatchId, cc.id, time);
                                                   setSelectedMatchId(null);
                                                 }
                                               }}
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
                                                    onClick={(e) => {
                                                       if (isLocked || hasScores) return;
                                                       e.stopPropagation();
                                                       if (selectedMatchId === match.id) {
                                                         setSelectedMatchId(null);
                                                       } else if (selectedMatchId) {
                                                         handleMatchDrop(selectedMatchId, cc.id, time);
                                                         setSelectedMatchId(null);
                                                       } else {
                                                         setSelectedMatchId(match.id);
                                                       }
                                                     }}
                                                     onDragStart={(e) => {
                                                      if (isLocked || hasScores) {
                                                        e.preventDefault();
                                                        return;
                                                      }
                                                      e.dataTransfer.setData("matchId", match.id);
                                                       e.dataTransfer.effectAllowed = "move";
                                                     }}
                                                     className={`h-full rounded-lg border-l-4 p-1 md:p-3 shadow-sm flex flex-col justify-center cursor-move active:scale-95 transition-all ${getCatStyles(match.category)} ${isOtherHighlighted ? 'opacity-10 grayscale scale-95' : 'opacity-100'} ${filterTeams.length > 0 && isHighlighted ? 'ring-2 ring-[#e94560] scale-105 z-20 bg-white' : ''} ${match.phase === 'Min. Partidos' ? 'border-dashed border-2 opacity-90' : match.phase === 'Relleno Extra' ? 'border-dotted border-2 opacity-50 grayscale hover:grayscale-0 transition-all' : ''} ${selectedMatchId === match.id ? 'ring-4 ring-indigo-500 scale-105 z-30 shadow-indigo-200' : ''} ${isFinal ? 'ring-4 ring-amber-400 border-l-amber-500 bg-amber-50/50 shadow-lg scale-105 z-10' : isSemi ? 'ring-2 ring-indigo-300 border-l-indigo-500 bg-indigo-50/30 shadow-md' : ''}`}
                                                  >
                                                     <div className="flex justify-between items-start mb-0.5 md:mb-1">
                                                       <div className="flex items-center gap-0.5 md:gap-1">
                                                         <p className="text-[5px] md:text-[7px] font-black uppercase opacity-60 truncate max-w-[40px] md:max-w-none">{match.category}</p>
                                                         {match.phase === 'Min. Partidos' && (
                                                           <span className="text-[4px] md:text-[5px] font-black bg-emerald-100 text-emerald-600 px-0.5 md:px-1 rounded-sm leading-tight uppercase" title="Cuentan para la clasificación">MIN.</span>
                                                         )}
                                                         {match.phase === 'Fase Relleno' && (
                                                           <span className="text-[4px] md:text-[5px] font-black bg-slate-100 text-slate-400 px-0.5 md:px-1 rounded-sm leading-tight uppercase" title="No cuentan para la clasificación">EXT.</span>
                                                         )}
                                                       </div>
                                                       <div className="flex items-center gap-1">
                                                         {cc.rimType === 'low' && (
                                                           <span className="hidden xs:inline text-[4px] md:text-[6px] font-black bg-[#e94560] text-white px-0.5 md:px-1 rounded-sm leading-tight">LOW</span>
                                                         )}
                                                         {!isLocked && (
                                                           <button 
                                                             onClick={(e) => { e.stopPropagation(); deleteMatch(match.id); }}
                                                             className="p-0.5 md:p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all shadow-sm border border-transparent hover:border-red-100 bg-white/50"
                                                             title="Borrar partido"
                                                           >
                                                             <Trash2 className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" />
                                                           </button>
                                                         )}
                                                       </div>
                                                     </div>
                                                    <div className={`text-[7.5px] md:text-[10px] font-bold leading-tight flex flex-col gap-0.5 ${isPlayoff ? 'text-slate-900 tracking-tight' : ''}`}>
                                                      <span className="truncate">{match.team1}</span>
                                                      <span className="truncate">{match.team2}</span>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  !isLocked && (
                                                    <button 
                                                      onClick={() => setAddingMatchSlot({ courtId: cc.id, time: time })}
                                                      className="absolute inset-x-0 bottom-0 top-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-slate-50/50 group z-10"
                                                    >
                                                      <div className="w-7 h-7 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-300 group-hover:text-[#e94560] group-hover:border-[#e94560] transition-colors">
                                                        <Plus className="w-4 h-4" />
                                                      </div>
                                                    </button>
                                                  )
                                                )}
                                             </div>
                                           )
                                        })}
                                      </div>
                                      {idx < groupedMatchesByTime.length - 1 && (
                                        <div className="h-1 md:h-2 bg-slate-400/5 flex items-center px-6 relative border-b border-white/5 short-compact no-print" style={{ minWidth: `calc(80px + ${config.courtConfigs.length * 160}px)` }}>
                                          <div className="w-full h-px bg-slate-200/20" />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </AnimatePresence>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white">
                            {groupedMatchesByTime.map(([time, slotMatches], idx) => (
                              <div key={time} className="border-b border-slate-100">
                                {shouldRenderGeneralBreakBeforeIndex(idx) && (
                                  <div className="bg-amber-50 border-y border-amber-200 px-4 md:px-8 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 no-print">
                                    Descanso General {config.generalBreakTime} - {generalBreakEndLabel}
                                  </div>
                                )}
                                 <div className="bg-slate-50 px-4 md:px-8 py-1 md:py-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] md:sticky md:top-0 md:z-10">{time}</div>
                                <div className="divide-y divide-slate-50 md:min-w-min md:overflow-x-auto">
                                  {slotMatches.map(m => {
                                    const lowerCat = m.category.toLowerCase();
                                    const isSemi = lowerCat.includes('semi');
                                    const isFinal = lowerCat.includes('final');
                                    const isSpecial = isSemi || isFinal;
                                    
                                    return (
                                      <div key={m.id} className={`px-3 md:px-8 py-2.5 md:py-3.5 transition-colors ${isSpecial ? 'bg-[#1a1a2e] text-white hover:bg-[#252542]' : ''}`}>
                                        <div className="md:hidden space-y-3 min-h-[136px]">
                                          <div className={`rounded-xl border px-2.5 py-2 ${isSpecial ? 'border-white/15 bg-white/5' : 'border-slate-200 bg-slate-50/70'}`}>
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-1 min-w-0 flex-wrap">
                                              <span className={`text-[10px] font-black tracking-tight ${isSpecial ? 'text-white' : 'text-slate-900'}`}>{m.category}</span>
                                              {m.phase.includes('Ida') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border shrink-0 ${isSpecial ? 'bg-white/10 text-white border-white/20' : 'bg-sky-50 text-sky-500 border-sky-100'}`}>Ida</span>
                                              )}
                                              {m.phase.includes('Vuelta') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border shrink-0 ${isSpecial ? 'bg-white/10 text-white border-white/20' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>Vuelta</span>
                                              )}
                                              {(m.phase === 'Fase Relleno' || m.phase === 'Min. Partidos') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border shrink-0 ${m.phase === 'Min. Partidos' ? 'bg-emerald-50 text-emerald-500 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                  {m.phase === 'Min. Partidos' ? 'Mínimos' : 'Fase Relleno'}
                                                </span>
                                              )}
                                              {isSpecial && (isFinal ? <Trophy className="w-3 h-3 text-[#e94560]" /> : <MapPin className="w-3 h-3 text-[#e94560]" />)}
                                            </div>
                                            {!isLocked && (
                                              <button
                                                onClick={() => deleteMatch(m.id)}
                                                className={`p-2 rounded-lg transition-all shrink-0 ${isSpecial ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                                title="Borrar partido"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            )}
                                          </div>

                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`px-2 py-1 text-[9px] font-black rounded uppercase tracking-tighter whitespace-nowrap ${isSpecial ? 'bg-[#e94560] text-white' : 'bg-slate-900 text-white'}`}>PISTA {m.court}</span>
                                            {config.courtConfigs.find(cc => cc.id === m.court)?.rimType === 'low' && (
                                              <span className={`text-[8px] font-black tracking-tighter uppercase shrink-0 ${isSpecial ? 'text-slate-400' : 'text-[#e94560]'}`}>Aro Bajo</span>
                                            )}
                                          </div>

                                          <div className="grid grid-cols-[1fr_auto] items-center gap-2.5">
                                            <div className={`font-bold text-[13px] leading-tight break-words pr-1 ${isSpecial ? 'text-white italic' : 'text-slate-900'}`}>{m.team1}</div>
                                            <input
                                              type="number"
                                              value={m.score1 ?? ''}
                                              onChange={e => updateScore(m.id, e.target.value === '' ? undefined : parseInt(e.target.value), m.score2)}
                                              inputMode="numeric"
                                              className={`w-12 h-12 rounded-xl border text-center text-base font-black outline-none focus:border-[#e94560] shadow-sm transition-all touch-manipulation ${isSpecial ? 'bg-white/10 border-white/20 text-white focus:bg-white/20' : 'bg-white border-slate-200 text-slate-900 focus:bg-slate-50'}`}
                                            />
                                          </div>

                                          <div className="h-px bg-slate-200/70" />

                                          <div className="grid grid-cols-[1fr_auto] items-center gap-2.5">
                                            <div className={`font-bold text-[13px] leading-tight break-words pr-1 ${isSpecial ? 'text-white italic' : 'text-slate-900'}`}>{m.team2}</div>
                                            <input
                                              type="number"
                                              value={m.score2 ?? ''}
                                              onChange={e => updateScore(m.id, m.score1, e.target.value === '' ? undefined : parseInt(e.target.value))}
                                              inputMode="numeric"
                                              className={`w-12 h-12 rounded-xl border text-center text-base font-black outline-none focus:border-[#e94560] shadow-sm transition-all touch-manipulation ${isSpecial ? 'bg-white/10 border-white/20 text-white focus:bg-white/20' : 'bg-white border-slate-200 text-slate-900 focus:bg-slate-50'}`}
                                            />
                                          </div>
                                          </div>
                                        </div>

                                        <div className={`hidden md:grid grid-cols-[100px_80px_1fr_80px_1fr] md:grid-cols-12 items-center gap-4 min-w-[650px] md:min-w-0 ${isSpecial ? 'text-white' : ''}`}>
                                          <div className={`col-span-12 grid grid-cols-[100px_80px_1fr_80px_1fr] md:grid-cols-12 items-center gap-4 min-w-[650px] md:min-w-0 rounded-xl border px-2.5 py-2 ${isSpecial ? 'border-white/15 bg-white/5' : 'border-slate-200 bg-slate-50/70'}`}>
                                          <div className="col-span-1 md:col-span-2 text-[10px] font-black flex flex-col justify-center">
                                            <div className="inline-flex items-center gap-1.5 w-fit">
                                              <span className={`text-[9px] font-bold ${isSpecial ? 'text-white' : 'text-slate-900'}`}>{m.category}</span>
                                              {m.phase.includes('Ida') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border ${isSpecial ? 'bg-white/10 text-white border-white/20' : 'bg-sky-50 text-sky-500 border-sky-100'}`}>Ida</span>
                                              )}
                                              {m.phase.includes('Vuelta') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border ${isSpecial ? 'bg-white/10 text-white border-white/20' : 'bg-indigo-50 text-indigo-500 border-indigo-100'}`}>Vuelta</span>
                                              )}
                                              {(m.phase === 'Fase Relleno' || m.phase === 'Min. Partidos') && (
                                                <span className={`text-[7px] px-1 rounded-sm leading-tight font-black uppercase border ${m.phase === 'Min. Partidos' ? 'bg-emerald-50 text-emerald-500 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                                  {m.phase === 'Min. Partidos' ? 'Mínimos' : 'Fase Relleno'}
                                                </span>
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
                                              className={`w-12 h-12 md:w-14 md:h-14 rounded-xl border text-center text-sm md:text-lg font-black outline-none focus:border-[#e94560] shadow-sm transition-all ${isSpecial ? 'bg-white/10 border-white/20 text-white focus:bg-white/20' : 'bg-white border-slate-200 text-slate-900 focus:bg-slate-50'}`}
                                            />
                                            <span className={`text-lg font-black ${isSpecial ? 'text-[#e94560]' : 'text-slate-300'}`}>-</span>
                                            <input
                                              type="number"
                                              value={m.score2 ?? ''}
                                              onChange={e => updateScore(m.id, m.score1, e.target.value === '' ? undefined : parseInt(e.target.value))}
                                              className={`w-12 h-12 md:w-14 md:h-14 rounded-xl border text-center text-sm md:text-lg font-black outline-none focus:border-[#e94560] shadow-sm transition-all ${isSpecial ? 'bg-white/10 border-white/20 text-white focus:bg-white/20' : 'bg-white border-slate-200 text-slate-900 focus:bg-slate-50'}`}
                                            />
                                          </div>
                                          <div className={`font-bold text-xs md:col-span-3 ${isSpecial ? 'text-white italic' : ''}`}>{m.team2}</div>
                                          <div className="md:col-span-1 flex justify-end">
                                            {!isLocked && (
                                              <button
                                                onClick={() => deleteMatch(m.id)}
                                                className={`p-2 rounded-xl transition-all ${isSpecial ? 'text-white/40 hover:text-white hover:bg-white/10' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'}`}
                                                title="Borrar partido"
                                              >
                                                <Trash2 className="w-5 h-5" />
                                              </button>
                                            )}
                                          </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null
                  )}
                </div>
              )
          ) : tournamentView === 'teams' ? (
            <TeamsManagementView 
              appCategories={appCategories}
              setAppCategories={setAppCategories}
              teamsByCategory={teamsByCategory}
              setTeamsByCategory={setTeamsByCategory}
              config={config}
              setConfig={setConfig}
              initialCategories={INITIAL_CATEGORIES}
              onUpdateTeam={updateTeam}
              isLocked={isLocked || hasScores}
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

      <footer className="hidden md:flex h-12 bg-[#1a1a2e] text-white items-center justify-between px-8 text-[10px] font-bold uppercase tracking-widest shrink-0 border-t border-[#e94560]/30 shadow-2xl short-hidden">
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

      <AnimatePresence>
        {isQrModalOpen && currentTournament && (
          <div className="fixed inset-0 z-[180] flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
              onClick={() => {
                console.info('[QR-TRACE] close-overlay', { tournamentId: currentTournament.id });
                setIsQrModalOpen(false);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              className="relative z-10 w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            >
              <div className="bg-[#1a1a2e] text-white px-6 py-5 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22d3ee]">QR vivo</p>
                  <h3 className="text-xl font-black italic mt-1">{currentTournament.name}</h3>
                </div>
                <button
                  onClick={() => {
                    console.info('[QR-TRACE] close-button', { tournamentId: currentTournament.id });
                    setIsQrModalOpen(false);
                  }}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  title="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5 text-center">
                <div ref={qrCodePreviewRef} className="inline-flex p-4 bg-white rounded-3xl border border-slate-100 shadow-lg">
                  <QRCodeSVG value={currentTournamentLiveUrl} size={240} level="M" includeMargin />
                </div>
                <div className="sr-only">
                  <QRCodeCanvas ref={qrCodeCanvasRef} value={currentTournamentLiveUrl} size={240} level="M" includeMargin />
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Dirección pública</p>
                  <p className="text-xs font-mono text-slate-600 break-all">{currentTournamentLiveUrl}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={printQrSheet}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#e94560] px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-[#cf3d56] transition"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir QR
                  </button>
                  <button
                    onClick={() => {
                      console.info('[QR-TRACE] close-secondary', { tournamentId: currentTournament.id });
                      setIsQrModalOpen(false);
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isQrModalOpen && currentTournament && (
        <div className="qr-print-sheet">
          <div className="flex flex-col items-center text-center gap-6 p-10 bg-white text-slate-950 rounded-3xl shadow-2xl border border-slate-200">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#e94560]">Torneo en directo</p>
              <h2 className="text-3xl font-black italic tracking-tight">{currentTournament.name}</h2>
              <p className="text-sm text-slate-500">Escanea el QR para abrir la vista pública del torneo</p>
            </div>

            <div className="p-4 bg-white rounded-3xl border-4 border-slate-100 shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
              <QRCodeSVG value={currentTournamentLiveUrl} size={280} level="M" includeMargin />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">URL</p>
              <p className="text-sm font-mono break-all text-slate-700 max-w-[34rem]">{currentTournamentLiveUrl}</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      <AnimatePresence>
        {addingMatchSlot && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddingMatchSlot(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white/20 relative z-10"
            >
              <div className="px-8 py-6 bg-[#1a1a2e] text-white flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black uppercase italic tracking-wider">Añadir Partido</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Pista {addingMatchSlot.courtId} • {addingMatchSlot.time}
                  </p>
                </div>
                <button onClick={() => setAddingMatchSlot(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <AddManualMatchForm 
                courtId={addingMatchSlot.courtId} 
                time={addingMatchSlot.time}
                allowedCategories={config.courtConfigs.find(c => c.id === addingMatchSlot.courtId)?.allowedCategories || []}
                teamsByCategory={teamsByCategory}
                onAdd={addManualMatch}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

