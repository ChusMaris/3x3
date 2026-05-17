import { useState } from 'react';
import { Filter, Lock, Pencil, Plus, Trash2, Users, Eraser } from 'lucide-react';
import { motion } from 'motion/react';

interface TeamsManagementViewProps {
  appCategories: string[];
  setAppCategories: (cats: string[]) => void;
  teamsByCategory: Record<string, string[]>;
  setTeamsByCategory: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  initialCategories: string[];
  onRenameTeam: (cat: string, oldName: string, newName: string) => void;
  isLocked: boolean;
}

export function TeamsManagementView({
  appCategories,
  setAppCategories,
  teamsByCategory,
  setTeamsByCategory,
  initialCategories,
  onRenameTeam,
  isLocked
}: TeamsManagementViewProps) {
  const [newCatName, setNewCatName] = useState('');
  const [newTeamInputs, setNewTeamInputs] = useState<Record<string, string>>({});
  const [editingTeam, setEditingTeam] = useState<{ cat: string, name: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  const addCategory = () => {
    if (newCatName && !appCategories.includes(newCatName)) {
      setAppCategories([...appCategories, newCatName]);
      setNewCatName('');
    }
  };

  const removeCategory = (cat: string) => {
    const teamsInCat = teamsByCategory[cat] || [];
    if (teamsInCat.length > 0) {
      alert(`No se puede borrar la categoría "${cat}" porque tiene equipos asignados. Elimina los equipos primero.`);
      return;
    }
    setAppCategories(appCategories.filter(c => c !== cat));
    setTeamsByCategory(prev => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
  };

  const addTeamToCategory = (cat: string) => {
    const teamName = newTeamInputs[cat];
    if (teamName) {
      setTeamsByCategory(prev => {
        const currentTeams = prev[cat] || [];
        if (!currentTeams.includes(teamName)) {
          return {
            ...prev,
            [cat]: [...currentTeams, teamName]
          };
        }
        return prev;
      });
      setNewTeamInputs({ ...newTeamInputs, [cat]: '' });
    }
  };

  const removeTeamFromCategory = (cat: string, teamName: string) => {
    setTeamsByCategory(prev => {
      const currentTeams = prev[cat] || [];
      return {
        ...prev,
        [cat]: currentTeams.filter(t => t !== teamName)
      };
    });
  };

  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  const clearTeamsInCategory = (cat: string) => {
    setTeamsByCategory((prev: Record<string, string[]>) => {
      const next = { ...prev };
      next[cat] = [];
      return next;
    });
    setConfirmClear(null);
  };

  const totalTeams = Object.values(teamsByCategory).reduce((acc, teams) => acc + teams.length, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-[#1a1a2e] mb-1 md:mb-2">Panel de Inscripciones</h2>
            <p className="text-slate-500 text-[10px] md:text-sm font-medium">Gestiona las categorías y equipos registrados para este torneo.</p>
          </div>
          <div className="flex items-center gap-3 md:gap-4 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
            <div className="text-right">
              <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Inscritos</p>
              <p className="text-lg md:text-2xl font-black text-[#e94560]">{totalTeams} <span className="text-[10px] md:text-sm uppercase">Equipos</span></p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-[#e94560]/10 rounded-lg md:rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-[#e94560]" />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm space-y-4 md:space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[9px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" /> Configurar Categorías
            </h3>
            <div className="flex gap-2">
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {appCategories.map(cat => (
              <div key={cat} className="group relative bg-slate-100 px-3 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl flex items-center gap-2 md:gap-3 border border-slate-200 hover:border-[#e94560]/30 transition-all">
                <span className="text-[10px] md:text-[11px] font-bold text-slate-700">{cat}</span>
                {!isLocked && (
                  <button
                    onClick={() => removeCategory(cat)}
                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-0.5 md:p-1"
                  >
                    <Trash2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {!isLocked && (
              <div className="flex gap-1.5 md:gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  placeholder="Nueva..."
                  className="bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-xs font-bold focus:border-[#e94560] outline-none transition-all w-28 md:w-48"
                  onKeyDown={e => e.key === 'Enter' && addCategory()}
                />
                <button
                  onClick={addCategory}
                  className="bg-[#1a1a2e] text-white p-1.5 md:p-2 rounded-lg md:rounded-xl hover:bg-slate-800 transition-all"
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {appCategories
            .filter(cat => !isLocked || (teamsByCategory[cat] || []).length > 0)
            .map(cat => (
              <div key={cat} className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-lg transition-all hover:border-[#e94560]/20">
                <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 group-hover:bg-white transition-colors">
                  <div>
                    <h4 className="text-base md:text-lg font-black italic uppercase tracking-tighter text-[#1a1a2e]">{cat}</h4>
                    <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {teamsByCategory[cat]?.length || 0} Equipos
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2">
                    {(teamsByCategory[cat] || []).length > 0 && !isLocked && (
                      <div className="relative group/eraser">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirmClear === cat) {
                              clearTeamsInCategory(cat);
                            } else {
                              setConfirmClear(cat);
                              setTimeout(() => setConfirmClear(prev => prev === cat ? null : prev), 5000);
                            }
                          }}
                          className={`group relative flex items-center justify-center p-1.5 md:p-2 rounded-lg md:rounded-xl transition-all duration-300 ${
                            confirmClear === cat
                              ? 'bg-red-500 text-white shadow-xl scale-105'
                              : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                          }`}
                          style={{ minWidth: confirmClear === cat ? (window.innerWidth < 768 ? '80px' : '100px') : '32px' }}
                          title={confirmClear === cat ? 'Click de nuevo para borrar' : 'Borrar todos los equipos'}
                        >
                          <Eraser className={`w-4 h-4 md:w-5 md:h-5 transition-transform duration-300 ${confirmClear === cat ? 'scale-110 mr-1' : 'group-hover:rotate-12'}`} />
                          {confirmClear === cat && (
                            <span className="text-[8px] md:text-[10px] font-black uppercase tracking-wider animate-pulse whitespace-nowrap">¿BORRAR?</span>
                          )}
                        </button>
                      </div>
                    )}
                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center transition-all ${(teamsByCategory[cat] || []).length > 0 ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-300'}`}>
                      <Users className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                  </div>
                </div>

                <div className="p-4 md:p-6 space-y-3 md:space-y-4 flex-1 flex flex-col">
                  {!isLocked && (
                    <div className="flex gap-1.5 md:gap-2">
                      <input
                        type="text"
                        value={newTeamInputs[cat] || ''}
                        onChange={e => setNewTeamInputs({ ...newTeamInputs, [cat]: e.target.value })}
                        placeholder="Equipo..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-[10px] md:text-xs font-bold focus:border-[#e94560] outline-none transition-all"
                        onKeyDown={e => e.key === 'Enter' && addTeamToCategory(cat)}
                      />
                      <button
                        onClick={() => addTeamToCategory(cat)}
                        className="bg-[#e94560] text-white p-2 md:p-2.5 rounded-lg md:rounded-xl hover:bg-[#ff516f] transition-all"
                      >
                        <Plus className="w-4 h-4 md:w-5 md:h-5" />
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
