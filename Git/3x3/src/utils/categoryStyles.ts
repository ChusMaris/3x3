// Colores distribuidos por el círculo cromático (~30° de separación entre cada uno)
// Ningún par comparte familia de tono
const CATEGORY_COLORS: Record<string, string> = {
  'BEN M': 'border-blue-500 bg-blue-50 text-blue-600',       // azul     ~240°
  'BEN F': 'border-red-500 bg-red-50 text-red-600',          // rojo       ~0°
  'ALV M': 'border-green-600 bg-green-50 text-green-700',    // verde    ~120°
  'ALV F': 'border-orange-500 bg-orange-50 text-orange-600', // naranja   ~30°
  'INF M': 'border-purple-600 bg-purple-50 text-purple-700', // púrpura  ~270°
  'INF F': 'border-yellow-500 bg-yellow-50 text-yellow-600', // amarillo  ~60°
  'CAD M': 'border-teal-500 bg-teal-50 text-teal-600',       // teal     ~175°
  'CAD F': 'border-pink-600 bg-pink-50 text-pink-700',       // rosa     ~330°
  'JUN M': 'border-sky-500 bg-sky-50 text-sky-600',          // celeste  ~205°
  'JUN F': 'border-lime-600 bg-lime-50 text-lime-700',       // lima      ~85°
  'SEN M': 'border-indigo-600 bg-indigo-50 text-indigo-700', // índigo   ~255°
  'SEN F': 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-600', // fucsia ~300°
};

// Pool para categorías custom: tonos que NO aparecen en las 12 fijas
// (cyan, amber, rose, violet, emerald, slate + variantes claramente distintas)
const CUSTOM_COLOR_POOL = [
  'border-cyan-500 bg-cyan-50 text-cyan-600',         // cian     ~185°
  'border-amber-500 bg-amber-50 text-amber-600',       // ámbar     ~45°
  'border-rose-500 bg-rose-50 text-rose-600',          // rosa cálido ~350°
  'border-violet-500 bg-violet-50 text-violet-600',    // violeta  ~265°
  'border-emerald-500 bg-emerald-50 text-emerald-600', // esmeralda ~145°
  'border-slate-600 bg-slate-100 text-slate-700',      // gris neutro
  'border-cyan-700 bg-cyan-100 text-cyan-800',         // cian oscuro
  'border-amber-700 bg-amber-100 text-amber-800',      // ámbar oscuro
  'border-rose-700 bg-rose-100 text-rose-800',         // rosa oscuro
  'border-violet-700 bg-violet-100 text-violet-800',   // violeta oscuro
  'border-emerald-700 bg-emerald-100 text-emerald-800',// esmeralda oscura
  'border-stone-600 bg-stone-100 text-stone-700',      // piedra (gris cálido)
];

// Cache: categoría custom → color asignado (persiste durante la sesión)
const customColorCache: Record<string, string> = {};

export function getCatStyles(category: string) {
  const uc = category.toUpperCase();
  if (CATEGORY_COLORS[uc]) return CATEGORY_COLORS[uc];

  // Si ya se asignó un color a esta categoría custom, reutilizarlo
  if (customColorCache[uc]) return customColorCache[uc];

  // Calcular colores ya en uso (predefinidos + customs ya asignados)
  const usedColors = new Set([
    ...Object.values(CATEGORY_COLORS),
    ...Object.values(customColorCache),
  ]);

  // Asignar el primer color del pool que no esté en uso
  const available = CUSTOM_COLOR_POOL.find(c => !usedColors.has(c));
  const assigned = available ?? CUSTOM_COLOR_POOL[Object.keys(customColorCache).length % CUSTOM_COLOR_POOL.length];

  customColorCache[uc] = assigned;
  return assigned;
}

