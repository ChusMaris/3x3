import { CheckCircle2, Circle, Info, MapPin, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import type { CourtConfig, ScheduleConfig } from '../lib/scheduler';

interface CourtsManagementViewProps {
  config: ScheduleConfig;
  setConfig: (config: ScheduleConfig) => void;
  categories: string[];
  isLocked: boolean;
}

export function CourtsManagementView({
  config,
  setConfig,
  categories,
  isLocked
}: CourtsManagementViewProps) {
  const addCourt = () => {
    const nextId = config.courtConfigs.length > 0
      ? Math.max(...config.courtConfigs.map(c => c.id)) + 1
      : 1;

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
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 bg-white p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm">
          <div>
            <h2 className="text-xl md:text-3xl font-black italic uppercase tracking-tighter text-[#1a1a2e] mb-1 md:mb-2">Configuración de Pistas</h2>
            <p className="text-slate-500 text-[10px] md:text-sm font-medium">Define el tipo de aro y las categorías permitidas por pista.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4">
            {!isLocked && (
              <button
                onClick={addCourt}
                className="flex items-center justify-center gap-2 bg-[#e94560] text-white px-4 md:px-6 py-2.5 md:py-3 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest hover:bg-[#ff516f] transition-all shadow-xl active:scale-95"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" /> AÑADIR PISTA
              </button>
            )}
            <div className="flex items-center gap-3 md:gap-4 bg-slate-50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-100">
              <div className="text-right">
                <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Pistas</p>
                <p className="text-lg md:text-2xl font-black text-[#1a1a2e]">{config.courtConfigs.length}</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 rounded-lg md:rounded-xl flex items-center justify-center">
                <MapPin className="w-5 h-5 md:w-6 md:h-6 text-indigo-600" />
              </div>
            </div>
          </div>
        </div>

        {config.courtConfigs.length === 0 ? (
          <div className="bg-white rounded-2xl md:rounded-3xl border-2 border-dashed border-slate-200 p-10 md:p-20 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-6 h-6 md:w-8 md:h-8 text-slate-300" />
            </div>
            <h3 className="text-base md:text-xl font-black text-slate-400 uppercase tracking-widest mb-2">No hay pistas configuradas</h3>
            <p className="text-[11px] md:text-slate-400 max-w-sm mb-6 md:mb-8">Añade pistas para poder generar el calendario del torneo.</p>
            <button
              onClick={addCourt}
              className="bg-[#1a1a2e] text-white px-6 md:px-8 py-3 md:py-4 rounded-xl md:rounded-2xl font-black text-xs md:text-sm uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg"
            >
              AÑADIR MI PRIMERA PISTA
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {config.courtConfigs.map((court, idx) => (
              <motion.div
                key={court.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white rounded-2xl md:rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col group hover:shadow-lg transition-all"
              >
                <div className="p-4 md:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 group-hover:bg-white transition-colors">
                  <div className="flex items-center gap-2.5 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-[#1a1a2e] text-white rounded-lg md:rounded-xl flex items-center justify-center font-black italic text-base md:text-xl shadow-lg">
                      {court.id}
                    </div>
                    <div>
                      <h4 className="text-base md:text-lg font-black italic uppercase tracking-tighter text-[#1a1a2e]">Pista {court.id}</h4>
                      <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {court.allowedCategories.length} categorías permitidas
                      </p>
                    </div>
                  </div>
                  {!isLocked && (
                    <button
                      onClick={() => removeCourt(court.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1.5 md:p-2"
                    >
                      <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </button>
                  )}
                </div>

                <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                  <div className="space-y-2 md:space-y-3">
                    <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      TIPO DE ARO
                    </label>
                    <div className="flex gap-1.5 md:gap-2 p-1 bg-slate-100 rounded-lg md:rounded-xl">
                      <button
                        disabled={isLocked}
                        onClick={() => updateCourt(court.id, { rimType: 'normal' })}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 md:py-2 rounded-md md:rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${court.rimType === 'normal' ? 'bg-white text-[#1a1a2e] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Normal
                      </button>
                      <button
                        disabled={isLocked}
                        onClick={() => updateCourt(court.id, { rimType: 'low' })}
                        className={`flex-1 flex items-center justify-center gap-2 py-1.5 md:py-2 rounded-md md:rounded-lg text-[10px] md:text-xs font-black uppercase transition-all ${court.rimType === 'low' ? 'bg-[#e94560] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        Aro Bajo
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 md:space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Categorías Permitidas
                      </label>
                      {!isLocked && (
                        <button
                          onClick={() => {
                            const allAllowed = court.allowedCategories.length === categories.length;
                            updateCourt(court.id, { allowedCategories: allAllowed ? [] : [...categories] });
                          }}
                          className="text-[8px] md:text-[9px] font-black text-[#e94560] uppercase tracking-tighter hover:underline"
                        >
                          {court.allowedCategories.length === categories.length ? 'QUITAR TODAS' : 'SELECCIONAR TODAS'}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 md:gap-2 max-h-[180px] md:max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
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
                            className={`flex items-center justify-between p-2.5 md:p-3 rounded-lg md:rounded-xl border transition-all text-left ${isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-slate-300'}`}
                          >
                            <span className="text-[10px] md:text-[11px] font-bold uppercase truncate">{cat}</span>
                            {isSelected ? (
                              <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-indigo-600 shrink-0" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-200 shrink-0" />
                            )}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="px-5 md:px-6 py-3 md:py-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                  <Info className="w-3 md:w-3.5 h-3 md:h-3.5 text-slate-300" />
                  <p className="text-[8px] md:text-[9px] font-bold text-slate-400 leading-tight">
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
