const CATEGORY_COLORS: Record<string, string> = {
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
  'SEN F': 'border-zinc-500 bg-zinc-50 text-zinc-600'
};

export function getCatStyles(category: string) {
  const uc = category.toUpperCase();
  return CATEGORY_COLORS[uc] || 'border-slate-500 bg-slate-50 text-slate-600';
}
