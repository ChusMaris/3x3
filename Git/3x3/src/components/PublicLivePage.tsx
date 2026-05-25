import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Calendar, Clock3, Loader2, Medal, ShieldAlert, Trophy, ExternalLink, Users } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { formatTime, Match } from '../lib/scheduler';
import { ClassificationTable } from './ClassificationTable';
import type { Tournament } from '../types/tournament';

type PublicTab = 'calendar' | 'classification';

interface TeamStats {
  name: string;
  pj: number;
  pg: number;
  pp: number;
  pts: number;
  pf: number;
  pc: number;
  headToHead: Record<string, number>;
}

const isPlaceholderTeam = (name: string) => {
  const normalized = name.toLowerCase();
  return (
    normalized.includes('clasificado') ||
    normalized.includes('ganador semifinal') ||
    normalized.includes('gr.')
  );
};

const toDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeScore = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const getTeamNames = (teams: unknown): string[] => {
  if (!Array.isArray(teams)) return [];
  return teams
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null) {
        const source = item as Record<string, unknown>;
        return typeof source.name === 'string' ? source.name : '';
      }
      return '';
    })
    .filter((name): name is string => Boolean(name));
};

const deserializeMatches = (matches: Match[]) =>
  matches.map((match) => ({
    ...match,
    startTime: new Date(match.startTime),
    endTime: new Date(match.endTime),
    score1: normalizeScore((match as unknown as Record<string, unknown>).score1),
    score2: normalizeScore((match as unknown as Record<string, unknown>).score2),
  }));

export function PublicLivePage() {
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<PublicTab>('calendar');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768;
  });
  const [isCompactLandscape, setIsCompactLandscape] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight <= 520 && window.innerWidth > window.innerHeight;
  });

  useEffect(() => {
    const onResize = () => {
      setIsMobileView(window.innerWidth < 768);
      setIsCompactLandscape(window.innerHeight <= 520 && window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchLiveTournaments = async (background = false) => {
      try {
        if (background) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
          setError(null);
        }

        const today = toDateInput(new Date());
        const { data, error: fetchError } = await supabase
          .from('tournaments')
          .select('id,name,event_date,data')
          .gte('event_date', today)
          .order('event_date', { ascending: true });

        if (fetchError) throw fetchError;
        if (cancelled) return;

        setTournaments((data as unknown as Tournament[]) || []);
        setLastRefreshedAt(new Date());
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          if (!background) {
            setError('No se pudieron cargar los torneos activos.');
          }
        }
      } finally {
        if (!cancelled) {
          if (background) {
            setIsRefreshing(false);
          } else {
            setIsLoading(false);
          }
        }
      }
    };

    fetchLiveTournaments();

    const realtimeChannel = supabase
      .channel('public-live-tournaments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tournaments' },
        () => {
          void fetchLiveTournaments(true);
        },
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      void fetchLiveTournaments(true);
    }, 20000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchLiveTournaments(true);
      }
    };

    window.addEventListener('focus', handleVisibilityChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabase.removeChannel(realtimeChannel);
    };
  }, []);

  const selectedTournament = useMemo(
    () => tournaments.find((t) => t.id === tournamentId) || null,
    [tournaments, tournamentId],
  );

  const matches = useMemo(() => {
    if (!selectedTournament) return [];
    const rawMatches = selectedTournament.data.matches || [];
    return deserializeMatches(rawMatches);
  }, [selectedTournament]);

  const categories = useMemo(() => {
    if (!selectedTournament) return [];
    const teamsByCategory = selectedTournament.data.teamsByCategory || {};
    // Solo categorías con equipos
    const fromTeams = Object.entries(teamsByCategory)
      .filter(([_, teams]) => Array.isArray(teams) && teams.length > 0)
      .map(([cat]) => cat);
    // También incluir categorías de partidos si tienen equipos
    const fromMatches = Array.from(new Set(matches.map((m) => m.category)))
      .filter((cat) => fromTeams.includes(cat));
    return Array.from(new Set([...fromTeams, ...fromMatches])).sort((a, b) => a.localeCompare(b));
  }, [selectedTournament, matches]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !categories.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [categories, selectedCategory]);

  const filteredMatches = useMemo(() => {
    return matches
      .filter((m) => selectedCategory === 'all' || m.category === selectedCategory)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [matches, selectedCategory]);

  const groupedBySlot = useMemo(() => {
    const grouped = new Map<string, Match[]>();
    filteredMatches.forEach((match) => {
      const slot = `${formatTime(match.startTime)}-${match.court}`;
      if (!grouped.has(slot)) grouped.set(slot, []);
      grouped.get(slot)!.push(match);
    });
    return Array.from(grouped.values())
      .map((slotMatches) => slotMatches[0])
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [filteredMatches]);

  const classificationByCategory = useMemo(() => {
    if (!selectedTournament) return {} as Record<string, TeamStats[]>;
    const teamsByCategory = selectedTournament.data.teamsByCategory || {};
    const stats: Record<string, Record<string, TeamStats>> = {};

    Object.entries(teamsByCategory).forEach(([category, teamItems]) => {
      stats[category] = {};
      getTeamNames(teamItems).forEach((name) => {
        stats[category][name] = {
          name,
          pj: 0,
          pg: 0,
          pp: 0,
          pts: 0,
          pf: 0,
          pc: 0,
          headToHead: {},
        };
      });
    });

    filteredMatches.forEach((match) => {
      if (typeof match.score1 !== 'number' || typeof match.score2 !== 'number') return;
      if (match.phase === 'Fase Relleno' || match.id.startsWith('FILL-')) return;
      if (isPlaceholderTeam(match.team1) || isPlaceholderTeam(match.team2)) return;

      const category = match.category;
      if (!stats[category]) stats[category] = {};
      if (!stats[category][match.team1]) {
        stats[category][match.team1] = {
          name: match.team1,
          pj: 0,
          pg: 0,
          pp: 0,
          pts: 0,
          pf: 0,
          pc: 0,
          headToHead: {},
        };
      }
      if (!stats[category][match.team2]) {
        stats[category][match.team2] = {
          name: match.team2,
          pj: 0,
          pg: 0,
          pp: 0,
          pts: 0,
          pf: 0,
          pc: 0,
          headToHead: {},
        };
      }

      const t1 = stats[category][match.team1];
      const t2 = stats[category][match.team2];

      t1.pj += 1;
      t2.pj += 1;
      t1.pf += match.score1;
      t1.pc += match.score2;
      t2.pf += match.score2;
      t2.pc += match.score1;

      if (match.score1 > match.score2) {
        t1.pg += 1;
        t1.pts += 1;
        t2.pp += 1;
        t1.headToHead[t2.name] = (t1.headToHead[t2.name] || 0) + 1;
      } else if (match.score2 > match.score1) {
        t2.pg += 1;
        t2.pts += 1;
        t1.pp += 1;
        t2.headToHead[t1.name] = (t2.headToHead[t1.name] || 0) + 1;
      }
    });

    const ranked: Record<string, TeamStats[]> = {};
    Object.entries(stats).forEach(([category, teams]) => {
      ranked[category] = Object.values(teams).sort((a, b) => {
        if (b.pts !== a.pts) return b.pts - a.pts;
        const aVsB = a.headToHead[b.name] || 0;
        const bVsA = b.headToHead[a.name] || 0;
        if (aVsB !== bVsA) return bVsA - aVsB;
        return (b.pf - b.pc) - (a.pf - a.pc);
      });
    });
    return ranked;
  }, [filteredMatches, selectedTournament]);

  const hasMultipleActiveTournaments = tournaments.length > 1;

  // Vista de landing: lista de torneos activos
  if (!tournamentId) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_28%,#f8fafc_100%)] text-slate-900 pb-12">
        <header className="bg-white/90 border-b border-slate-200 px-4 md:px-8 py-6 md:py-8 sticky top-0 z-20 backdrop-blur">
          <div className="max-w-6xl mx-auto">
            <div className="relative">
              <div className="absolute -top-3 left-0 h-1.5 w-24 rounded-full bg-gradient-to-r from-[#22d3ee] via-sky-400 to-emerald-400" />
              <p className="text-[10px] uppercase tracking-[0.25em] font-black text-[#22d3ee]">Portal Público</p>
              <h1 className="text-3xl md:text-4xl font-black italic tracking-tight mt-2 text-slate-900">Torneos 3x3 en directo</h1>
              <p className="text-sm text-slate-600 mt-2">Selecciona un torneo para ver calendario y clasificación</p>
              <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mt-2">
                {isRefreshing ? 'Actualizando...' : lastRefreshedAt ? `Actualizado ${lastRefreshedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : 'Cargando datos en vivo'}
              </p>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 md:px-8 pt-8">
          {!isSupabaseConfigured && (
            <div className="bg-amber-500/10 border border-amber-400/20 rounded-2xl p-5 flex gap-3 items-start">
              <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-100">
                El portal público necesita configuración de Supabase para cargar los torneos.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="py-24 flex flex-col items-center gap-4 text-slate-300">
              <Loader2 className="w-8 h-8 animate-spin text-[#22d3ee]" />
              <p className="text-xs uppercase tracking-[0.25em] font-black">Cargando torneos activos</p>
            </div>
          )}

          {!isLoading && error && (
            <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-5 text-red-100 text-sm">{error}</div>
          )}

          {!isLoading && !error && tournaments.length === 0 && (
            <div className="py-24 text-center text-slate-500 space-y-3">
              <Trophy className="w-12 h-12 mx-auto opacity-30" />
              <p className="font-black uppercase tracking-[0.2em] text-xs">No hay torneos activos</p>
              <p className="text-sm text-slate-500">Cuando haya torneos con fecha de hoy o futura aparecerán aquí.</p>
            </div>
          )}

          {!isLoading && !error && tournaments.length > 0 && (
            <div className={`grid grid-cols-1 ${isCompactLandscape ? 'sm:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-4 md:gap-6`}>
              {tournaments.map((tournament, index) => (
                <div
                  key={tournament.id}
                  onClick={() => navigate(`/live/${tournament.id}`)}
                  className="relative overflow-hidden bg-white border border-slate-200 rounded-2xl p-5 md:p-6 cursor-pointer hover:border-sky-300 hover:shadow-xl hover:shadow-sky-100/80 transition-all transform hover:-translate-y-0.5 group"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#22d3ee] via-sky-400 to-emerald-400 opacity-90" />
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    En vivo
                  </span>

                  <div className="flex flex-col h-full">
                    <div className="mb-4 mt-3">
                      <h2 className="text-lg md:text-xl font-black text-slate-900 group-hover:text-[#0284c7] transition pr-24">{tournament.name}</h2>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mt-1">
                        {new Date(tournament.event_date).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 text-xs text-slate-700 mt-auto">
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <Trophy className="w-3.5 h-3.5 text-[#e94560]" />
                          Partidos
                        </span>
                        <span className="font-black text-slate-900">{tournament.data.matches?.length || 0}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className="inline-flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-[#0ea5e9]" />
                          Equipos
                        </span>
                        <span className="font-black text-slate-900">{Object.values(tournament.data.teamsByCategory || {}).flat().length}</span>
                      </div>
                    </div>

                    <button className="mt-4 w-full bg-gradient-to-r from-[#22d3ee] to-sky-400 text-slate-900 font-black text-xs uppercase tracking-[0.18em] py-2.5 rounded-lg hover:from-[#06b6d4] hover:to-[#38bdf8] transition flex items-center justify-center gap-2 group-hover:gap-3 shadow-sm">
                      Ver detalles
                      <ExternalLink className="w-3 h-3 transition-all" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Vista de detalle: torneo específico
  return (
    <div className="h-screen bg-white text-slate-900 flex flex-col overflow-hidden">
      <header className={`bg-white border-b border-slate-200 px-2 md:px-8 ${isCompactLandscape ? 'py-1' : 'py-2 md:py-4'} sticky top-0 z-20 backdrop-blur`}>
        <div className={`max-w-6xl mx-auto flex flex-col ${isCompactLandscape ? 'gap-1' : 'gap-2 md:gap-4'} md:flex-row md:items-center md:justify-between`}>
          <div className="min-w-0">
            <div className={`flex items-center gap-2 ${isCompactLandscape ? 'mb-0' : 'mb-1'}`}>
              <p className="text-[9px] md:text-[10px] uppercase tracking-[0.25em] font-black text-[#22d3ee]">Portal Público</p>
              {hasMultipleActiveTournaments && (
                <button
                  onClick={() => navigate('/live')}
                  className="ml-1 px-2 py-1 bg-slate-100 border border-slate-300 rounded text-[9px] font-black uppercase tracking-[0.18em] hover:bg-slate-200 transition"
                >
                  ← Otros torneos
                </button>
              )}
            </div>
            <h1 className={`${isCompactLandscape ? 'text-base md:text-2xl' : 'text-lg md:text-3xl'} font-black italic tracking-tight truncate`}>
              {selectedTournament?.name || 'Torneo'}
            </h1>
            <div className={`${isCompactLandscape ? 'mt-0.5' : 'mt-1'} flex flex-wrap items-center gap-1 text-[9px] md:text-[10px] font-black uppercase tracking-[0.18em]`}>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">
                {new Date(selectedTournament?.event_date || '').toLocaleDateString('es-ES')}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500">
                {filteredMatches.length} partidos
              </span>
              <span className={`px-1.5 py-0.5 rounded border ${isRefreshing ? 'bg-[#22d3ee]/10 border-[#22d3ee]/30 text-[#22d3ee]' : 'bg-emerald-100 border-emerald-300 text-emerald-700'}`}>
                {isRefreshing ? 'Refrescando' : 'En vivo'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className={`max-w-6xl mx-auto px-4 md:px-8 ${isCompactLandscape ? 'pt-3' : 'pt-6'} flex-1 min-h-0 overflow-hidden flex flex-col bg-white`}>
        {!isSupabaseConfigured && (
          <div className="bg-amber-500/10 border border-amber-400/20 rounded-2xl p-5 flex gap-3 items-start">
            <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-100">
              El portal público necesita configuración de Supabase para cargar los torneos.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="py-24 flex flex-col items-center gap-4 text-slate-300">
            <Loader2 className="w-8 h-8 animate-spin text-[#22d3ee]" />
            <p className="text-xs uppercase tracking-[0.25em] font-black">Cargando torneo</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="bg-red-500/10 border border-red-400/30 rounded-2xl p-5 text-red-100 text-sm">{error}</div>
        )}

        {!isLoading && !error && selectedTournament && (
          <>
            {categories.length > 0 && (
              <label className={`flex ${isCompactLandscape ? 'flex-row items-center gap-2 mb-3' : 'flex-col gap-2 mb-5'}`}>
                <span className={`${isCompactLandscape ? 'text-[10px] min-w-max' : 'text-xs'} uppercase tracking-[0.2em] font-black text-slate-400`}>Filtrar por categoría</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className={`bg-white border border-slate-200 rounded-lg px-3 ${isCompactLandscape ? 'py-1.5 text-xs' : 'py-2 text-sm'} font-bold text-slate-700 ${isCompactLandscape ? 'max-w-[220px]' : ''}`}
                >
                  <option value="all">Todas</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className={`flex gap-1 ${isCompactLandscape ? 'mb-2' : 'mb-4'} overflow-x-auto no-scrollbar shrink-0`}>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-2.5 ${isCompactLandscape ? 'py-1' : 'py-1.5'} rounded-lg text-[10px] uppercase tracking-[0.18em] font-black transition min-w-[80px] ${
                  activeTab === 'calendar' ? 'bg-[#22d3ee] text-slate-900 shadow-md' : 'bg-slate-100 border border-slate-200 text-slate-500'
                }`}
              >
                {isMobileView ? 'Partidos' : 'Calendario'}
              </button>
              <button
                onClick={() => setActiveTab('classification')}
                className={`px-2.5 ${isCompactLandscape ? 'py-1' : 'py-1.5'} rounded-lg text-[10px] uppercase tracking-[0.18em] font-black transition min-w-[80px] ${
                  activeTab === 'classification' ? 'bg-[#22d3ee] text-slate-900 shadow-md' : 'bg-slate-100 border border-slate-200 text-slate-500'
                }`}
              >
                Clasificación
              </button>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              {activeTab === 'calendar' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-y-auto flex-1 min-h-0">
                  {groupedBySlot.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No hay partidos para esta categoría.</p>
                  ) : (
                    <ul className="divide-y divide-slate-200">
                      {groupedBySlot.map((match) => (
                        <li key={match.id} className="p-3 md:p-4 bg-white">
                          <article className="rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow p-3 md:p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                  {match.category}
                                </span>
                                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                  {match.phase}
                                </span>
                              </div>

                              {typeof match.score1 === 'number' && typeof match.score2 === 'number' ? (
                                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                  Final
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                                  Programado
                                </span>
                              )}
                            </div>

                            <div className="mt-3 space-y-2">
                              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                <p className="truncate text-sm md:text-base font-bold text-slate-900">{match.team1}</p>
                                <span className="min-w-8 text-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-black text-slate-700">
                                  {typeof match.score1 === 'number' ? match.score1 : '-'}
                                </span>
                              </div>
                              <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                                <p className="truncate text-sm md:text-base font-bold text-slate-900">{match.team2}</p>
                                <span className="min-w-8 text-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-black text-slate-700">
                                  {typeof match.score2 === 'number' ? match.score2 : '-'}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                <Clock3 className="w-3.5 h-3.5" />
                                {formatTime(match.startTime)}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600">
                                <Calendar className="w-3.5 h-3.5" />
                                Pista {match.court}
                              </span>
                            </div>
                          </article>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === 'classification' && (
                <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pb-4">
                  {Object.entries(classificationByCategory)
                    .filter(([category, teams]) => (selectedCategory === 'all' || category === selectedCategory) && teams.length > 0)
                    .map(([category, teams]) => (
                      <section key={category} className="bg-slate-50 rounded-2xl shadow-sm border border-slate-200 mx-0 md:mx-0">
                        <header className="bg-slate-100 text-slate-900 px-3 py-2 flex items-center justify-between rounded-t-2xl border-b border-slate-200">
                          <h2 className="text-xs md:text-sm font-black uppercase tracking-[0.18em]">{category}</h2>
                          <span className="inline-flex items-center gap-1 text-[9px] md:text-xs uppercase tracking-[0.18em] text-slate-500 font-black">
                            <Medal className="w-3 h-3" /> Tabla
                          </span>
                        </header>
                        <div className="w-full px-0 md:px-2 py-2 md:py-3">
                          <ClassificationTable teams={teams} />
                        </div>
                        <div className="px-0 md:px-2 pb-2 md:pb-4">
                          <PublicPlayoffBracket
                            category={category}
                            matches={filteredMatches}
                          />
                        </div>
                      </section>
                    ))}
                  {Object.values(classificationByCategory).filter((teams) => teams.length > 0).length === 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">
                      No hay datos suficientes para mostrar clasificación.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function PublicPlayoffBracket({ category, matches }: { category: string; matches: Match[] }) {
  const playoffMatches = matches.filter((match) => {
    if (match.category !== category) return false;
    const phase = match.phase.toLowerCase();
    return phase.includes('semifinal') || phase === 'final' || phase.includes('gran final');
  });

  if (playoffMatches.length === 0) return null;

  const semifinal1 = playoffMatches.find((match) => match.phase.toLowerCase().includes('semifinal 1'));
  const semifinal2 = playoffMatches.find((match) => match.phase.toLowerCase().includes('semifinal 2'));
  const finalMatch = playoffMatches.find((match) => match.phase.toLowerCase() === 'final' || match.phase.toLowerCase().includes('gran final'));

  return (
    <div className="bg-white border-t border-slate-200 p-4 md:p-5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.2em] font-black text-[#0ea5e9]">Cuadro final</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[semifinal1, semifinal2, finalMatch].filter(Boolean).map((match) => (
          <div key={match!.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-[9px] uppercase tracking-[0.18em] font-black text-slate-500 mb-2">{match!.phase}</p>
            <p className="text-sm font-bold text-slate-900">
              {match!.team1}{' '}
              {typeof match!.score1 === 'number' && typeof match!.score2 === 'number' ? (
                <>
                  <span className="text-[#0ea5e9]">{match!.score1}</span>
                  <span className="text-slate-500 mx-2">-</span>
                  <span className="text-[#0ea5e9]">{match!.score2}</span>
                </>
              ) : (
                <span className="text-slate-500 mx-2">vs</span>
              )}
              {' '}{match!.team2}
            </p>
            <p className="text-[10px] mt-2 text-slate-500 font-bold">
              {formatTime(match!.startTime)} · Pista {match!.court}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
