import { useState } from 'react';
import { Calendar, Loader2, Plus, Settings, Trash2, Trophy, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isSupabaseConfigured } from '../lib/supabase';
import type { Tournament } from '../types/tournament';

interface LandingPageProps {
  tournaments: Tournament[];
  onSelect: (t: Tournament) => void;
  onCreate: (name: string, date: string) => void;
  onDelete: (id: string) => void;
  onLogout: () => Promise<void>;
  isLoading: boolean;
}

export function LandingPage({ tournaments, onSelect, onCreate, onDelete, onLogout, isLoading }: LandingPageProps) {
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentDate, setNewTournamentDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white font-sans overflow-x-hidden pb-12">
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
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h2 className="text-xl font-black uppercase tracking-widest text-[#e94560] italic">
            Torneos Guardados
          </h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-2 bg-white text-[#1a1a2e] px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-[#e94560] hover:text-white transition-all shadow-xl active:scale-95"
            >
              {showCreateForm ? 'CANCELAR' : <><Plus className="w-4 h-4" /> NUEVO TORNEO</>}
            </button>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 bg-slate-800 text-white px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition-all shadow-xl active:scale-95"
            >
              <LogOut className="w-4 h-4" /> CERRAR SESIÓN
            </button>
          </div>
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
                       {[1, 2, 3].map((avatar) => <div key={avatar} className="w-6 h-6 rounded-full border-2 border-[#16213e] bg-slate-700" />)}
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
