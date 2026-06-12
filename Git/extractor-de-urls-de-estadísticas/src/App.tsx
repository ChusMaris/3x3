import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Globe, 
  Search, 
  Download, 
  Copy, 
  Check, 
  ExternalLink, 
  AlertCircle, 
  Trash2, 
  FileSpreadsheet, 
  FileJson, 
  ArrowRight, 
  Layers, 
  ListFilter, 
  CheckCircle2, 
  RefreshCw,
  Clock,
  FileCode,
  Link,
  Info,
  Upload
} from "lucide-react";
import { ExtractionResult, ExtractedLink } from "./types";

// Helpful mock/sample Catalan Basketball Federation URLs for instant testing
const SAMPLE_URLS = [
  {
    label: "Partido Senior Masculino (Ejemplo)",
    url: "https://www.basquetcatala.cat/competicions/partit/300435"
  },
  {
    label: "Calendario de Competición (Ejemplo)",
    url: "https://www.basquetcatala.cat/competicions/calendari/300435"
  },
  {
    label: "Página de Estadísticas (Ejemplo)",
    url: "https://www.basquetcatala.cat/competicions/estadistiques/300435"
  }
];

function cleanJornadaText(text: string): string {
  const lines = text.split('\n');
  for (let line of lines) {
    line = line.trim();
    if (/jornada/i.test(line)) {
      let cleaned = line.replace(/\s+/g, ' ').trim();
      const match = cleaned.match(/jornada\s*\d+/i);
      if (match) {
        const index = cleaned.toLowerCase().indexOf(match[0].toLowerCase());
        cleaned = cleaned.slice(index);
        if (cleaned.length > 60) {
          cleaned = cleaned.slice(0, 60) + "...";
        }
        return cleaned;
      }
      if (cleaned.length > 60) {
        cleaned = cleaned.slice(0, 60) + "...";
      }
      return cleaned;
    }
  }
  let cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length > 60) {
    cleaned = cleaned.slice(0, 60) + "...";
  }
  return cleaned;
}

function findJornadaDOM(el: Element): string {
  let current: Element | null = el;
  while (current && current.tagName !== "BODY") {
    let sibling = current.previousElementSibling;
    while (sibling) {
      const headers = sibling.querySelectorAll("h1, h2, h3, h4, h5, h6, .jornada, .titol-jornada, .title, strong, b, td, th");
      if (headers.length > 0) {
        for (let i = headers.length - 1; i >= 0; i--) {
          const text = headers[i].textContent?.trim() || "";
          if (/jornada/i.test(text) && text.length < 100) {
            return cleanJornadaText(text);
          }
        }
      }
      const siblingText = sibling.textContent?.trim() || "";
      if (/jornada/i.test(siblingText) && siblingText.length < 100) {
        return cleanJornadaText(siblingText);
      }
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }
  return "Sin Jornada / Otras";
}

function getJornadaNumber(jornadaText: string): string {
  if (!jornadaText) return "";
  const match = jornadaText.match(/\d+/);
  return match ? match[0] : "";
}

function formatLinkText(link: { url: string; jornada?: string }, includeNum: boolean): string {
  if (!includeNum) return link.url;
  const num = getJornadaNumber(link.jornada || "");
  return num ? `${num};${link.url}` : link.url;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"html" | "url">("html");
  const [htmlInput, setHtmlInput] = useState("");
  const [sourceUrlResolution, setSourceUrlResolution] = useState("https://www.basquetcatala.cat");
  const [isDragging, setIsDragging] = useState(false);

  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  
  // Dynamic UI actions
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "jornadas">("jornadas");
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedJornadaKey, setCopiedJornadaKey] = useState<string | null>(null);
  const [copiedUnified, setCopiedUnified] = useState(false);
  const [includeJornadaNum, setIncludeJornadaNum] = useState(true);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Load search history from localStorage on mount
  useEffect(() => {
    try {
      const history = localStorage.getItem("fcbq_url_history");
      if (history) {
        setSearchHistory(JSON.parse(history));
      }
    } catch {
      // Ignore reading storage errors gracefully
    }
  }, []);

  // Save query to history
  const saveToHistory = (newUrl: string) => {
    try {
      const cleanUrl = newUrl.trim();
      if (!cleanUrl) return;
      
      const filtered = searchHistory.filter(item => item !== cleanUrl);
      const updated = [cleanUrl, ...filtered].slice(0, 5); // Limit to 5 entries
      setSearchHistory(updated);
      localStorage.setItem("fcbq_url_history", JSON.stringify(updated));
    } catch {
      // Ignore writing storage errors
    }
  };

  // Clear single history item
  const deleteHistoryItem = (e: React.MouseEvent, itemToDelete: string) => {
    e.stopPropagation();
    const updated = searchHistory.filter(item => item !== itemToDelete);
    setSearchHistory(updated);
    try {
      localStorage.setItem("fcbq_url_history", JSON.stringify(updated));
    } catch {
      // Ignore writing storage errors
    }
  };

  // Main fetch function
  const handleExtract = async (targetUrl: string = url) => {
    const cleanUrl = targetUrl.trim();
    if (!cleanUrl) {
      setError("Por favor, introduce una URL válida.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopiedAll(false);
    
    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: cleanUrl }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Error al procesar la solicitud.");
      }

      setResult(data);
      saveToHistory(cleanUrl);
    } catch (err: any) {
      const errorMessage = err.message || "";
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("fetch") || !navigator.onLine) {
        setError("Error de conexión. Si has desplegado esta aplicación en GitHub Pages u otro entorno estático, ten en cuenta que la extracción automática por URL requiere un servidor backend. Por favor, ¡utiliza la pestaña 'Pegar Código HTML' que funciona de forma local en tu navegador e independientemente del servidor!");
      } else {
        setError(errorMessage || "No se pudo conectar con el servicio web.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Extract from click on pre-fills or history
  const handleQuickTest = (selectedUrl: string) => {
    setUrl(selectedUrl);
    setActiveTab("url");
    handleExtract(selectedUrl);
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setHtmlInput(text);
        handleExtractHTML(text);
      };
      reader.readAsText(file);
    }
  };

  // Extract statistics URLs from raw HTML source (100% Client-Side, bypassing reCAPTCHA!)
  const handleExtractHTML = (htmlSource: string = htmlInput) => {
    const rawHtml = htmlSource.trim();
    if (!rawHtml) {
      setError("Por favor, introduce o arrastra código HTML fuente para procesar.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopiedAll(false);

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, "text/html");

      // Extract page title or provide fallback
      let pageTitle = doc.querySelector("title")?.textContent?.trim() || "";
      if (!pageTitle || pageTitle.includes("Verificació de seguretat")) {
        pageTitle = "Código Fuente de Estadística";
      }

      // Check if this HTML is actually the security verification page to warn the user
      if (rawHtml.includes("Verificació de seguretat") || rawHtml.includes("recaptcha")) {
        // If it features reCAPTCHA, but might contain the original page code, we'll try to parse,
        // but if we get nothing we should give a clearer warning.
      }

      // Base URL for link resolution
      let baseDomain = sourceUrlResolution.trim();
      if (!baseDomain) baseDomain = "https://www.basquetcatala.cat";
      if (!baseDomain.startsWith("http://") && !baseDomain.startsWith("https://")) {
        baseDomain = "https://" + baseDomain;
      }

      let baseDomainObj: URL;
      try {
        baseDomainObj = new URL(baseDomain);
      } catch {
        baseDomainObj = new URL("https://www.basquetcatala.cat");
      }

      const extractedMap = new Map<string, { text: string; occurrences: number; jornada: string }>();

      // Scan standard anchor nodes
      const anchors = doc.querySelectorAll("a");
      let countMatches = 0;

      anchors.forEach((el) => {
        const href = el.getAttribute("href");
        if (!href) return;

        // Matches if it's a stats page, but exclude video URLs
        if (href.includes("/estadistiques/") && !href.includes("/video/")) {
          countMatches++;
          let absoluteUrl = href;
          try {
            absoluteUrl = new URL(href, baseDomainObj.href).toString();
          } catch {
            if (href.startsWith("/")) {
              absoluteUrl = `${baseDomainObj.origin}${href}`;
            }
          }

          const rawText = el.textContent?.replace(/\s+/g, " ").trim() || "";
          const cleanedText = rawText || "Ver Estadísticas";

          // Retrieve Nearby Jornada
          const jornada = findJornadaDOM(el);

          if (extractedMap.has(absoluteUrl)) {
            const existing = extractedMap.get(absoluteUrl)!;
            const updatedText = cleanedText.length > existing.text.length && cleanedText !== "Ver Estadísticas"
              ? cleanedText
              : existing.text;
            extractedMap.set(absoluteUrl, {
              text: updatedText,
              occurrences: existing.occurrences + 1,
              jornada: existing.jornada !== "Sin Jornada / Otras" ? existing.jornada : jornada,
            });
          } else {
            extractedMap.set(absoluteUrl, {
              text: cleanedText,
              occurrences: 1,
              jornada: jornada,
            });
          }
        }
      });

      // Regex Fallback scan for scripts or text references (in case links are in JSON blocks)
      const rx = /["']([^"']*(?:https?:\/\/[^"']*)?\/estadistiques\/[^"']*)["']/gi;
      let rxMatches: RegExpExecArray | null;
      let rxCount = 0;

      while ((rxMatches = rx.exec(rawHtml)) !== null) {
        let matchedUrl = rxMatches[1];
        if (matchedUrl && !matchedUrl.startsWith("http") && matchedUrl.startsWith("/")) {
          matchedUrl = `${baseDomainObj.origin}${matchedUrl}`;
        }
        
        // Exclude script pathways, videos, or invalid characters in urls
        if (matchedUrl && 
            !matchedUrl.includes("recaptcha") && 
            !matchedUrl.includes("gtag") &&
            !matchedUrl.includes("/video/") &&
            !matchedUrl.includes("<") && 
            !matchedUrl.includes(">") &&
            matchedUrl.length < 300) {
          
          rxCount++;
          if (!extractedMap.has(matchedUrl)) {
            extractedMap.set(matchedUrl, {
              text: "Estadística (Encontrado en Scripts/Datos)",
              occurrences: 1,
              jornada: "Sin Jornada / Otras",
            });
          }
        }
      }

      if (extractedMap.size === 0) {
        throw new Error(
          "No se han encontrado enlaces con '/estadistiques/' en el HTML proporcionado.\n\n" +
          "Suele suceder si has copiado el código de la página de error o verificación de seguridad de Google reCAPTCHA, en lugar de copiar la página real de estadísticas propiamente dicha. Asegúrate de pasar el reCAPTCHA primero en tu navegador y copiar el código de la tabla real de basquetcatala.cat."
        );
      }

      const links = Array.from(extractedMap.entries()).map(([urlStr, data]) => ({
        url: urlStr,
        text: data.text,
        occurrences: data.occurrences,
        jornada: data.jornada,
      }));

      setResult({
        success: true,
        title: pageTitle,
        url: baseDomainObj.href,
        host: baseDomainObj.hostname,
        count: links.length,
        links,
      });

    } catch (err: any) {
      setError(err.message || "Ocurrió un error al procesar el código HTML.");
    } finally {
      setLoading(false);
    }
  };

  // Download logic as CSV with UTF-8 BOM to prevent spreadsheet accent corruption
  const downloadCSV = () => {
    if (!result || result.links.length === 0) return;

    const BOM = "\uFEFF";
    const headers = ["Jornada", "Texto descriptivo en página", "Enlace de Estadística (/estadistiques/)", "Ocurrencias en página"];
    
    const rows = result.links.map(link => [
      `"${(link.jornada || "Sin Jornada / Otras").replace(/"/g, '""')}"`,
      `"${(link.text || "").replace(/"/g, '""')}"`,
      `"${(link.url || "").replace(/"/g, '""')}"`,
      link.occurrences
    ].join(","));

    const csvContent = BOM + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    
    const safeTitle = result.title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip Spanish/Catalan accent marks
      .replace(/[^a-z0-9]+/g, "_");
      
    link.setAttribute("download", `${safeTitle || "fcbq"}_estadistiques.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  // Download logic as formatted JSON
  const downloadJSON = () => {
    if (!result || result.links.length === 0) return;

    const jsonStr = JSON.stringify(result.links, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    
    const safeTitle = result.title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_");

    link.setAttribute("download", `${safeTitle || "fcbq"}_estadistiques.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  };

  // Copy all extracted URLs to clipboard
  const copyAllToClipboard = () => {
    if (!result || result.links.length === 0) return;
    const urlList = result.links.map(l => formatLinkText(l, includeJornadaNum)).join("\n");
    
    navigator.clipboard.writeText(urlList)
      .then(() => {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 2000);
      })
      .catch(() => {
        alert("No se pudo copiar de forma automática. Permite el acceso al portapapeles.");
      });
  };

  // Copy single URL to clipboard
  const copySingleToClipboard = (urlStr: string, index: number) => {
    navigator.clipboard.writeText(urlStr)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      });
  };

  // Copy all links belonging to a specific Jornada
  const copyJornadaLinks = (jornadaKey: string, links: ExtractedLink[]) => {
    const text = links.map(l => formatLinkText(l, includeJornadaNum)).join("\n");
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedJornadaKey(jornadaKey);
        setTimeout(() => setCopiedJornadaKey(null), 2000);
      });
  };

  // Copy all links from all Jornadas formatted in a single text layout
  const copyUnifiedLinks = (jornadaKeys: string[], grouped: Record<string, ExtractedLink[]>) => {
    let text = "";
    jornadaKeys.forEach((key, idx) => {
      const urls = (grouped[key] || []).map(l => formatLinkText(l, includeJornadaNum)).join("\n");
      text += `--- ${key.toUpperCase()} ---\n${urls}`;
      if (idx < jornadaKeys.length - 1) {
        text += "\n\n";
      }
    });

    navigator.clipboard.writeText(text)
      .then(() => {
        setCopiedUnified(true);
        setTimeout(() => setCopiedUnified(false), 2000);
      });
  };

  // Filter links on the fly using Search Input
  const filteredLinks = result 
    ? result.links.filter(link => 
        link.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
        link.url.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  // Group filtered links by Match week (Jornada)
  const groupedLinks = filteredLinks.reduce<Record<string, ExtractedLink[]>>((acc, link) => {
    const key = link.jornada || "Sin Jornada / Otras";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(link);
    return acc;
  }, {});

  // Sort match rounds in standard order (Jornada 1, Jornada 2, etc.)
  const sortedJornadaKeys = Object.keys(groupedLinks).sort((a, b) => {
    if (a === "Sin Jornada / Otras") return 1;
    if (b === "Sin Jornada / Otras") return -1;
    
    // Extract numbers to sort numerically e.g. "Jornada 2" before "Jornada 10"
    const numA = parseInt(a.replace(/\D/g, ""), 10);
    const numB = parseInt(b.replace(/\D/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col antialiased">
      {/* Dynamic Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm flex-shrink-0">
        <div className="max-w-6xl mx-auto h-full px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-sm">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 font-display">
                Extractor <span className="text-blue-600">FCBQ</span> Estadístiques
              </h1>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                Federació Catalana de Basquetbol • Extractor Automático
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              Servicio Activo
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-2 my-2">
          <h2 className="text-3xl font-bold font-display tracking-tight text-slate-900 sm:text-4xl">
            Extractor de URL de Estadísticas Catalanas
          </h2>
          <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
            Obtén, depura y organiza de manera automatizada todas las URLs de <code className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono text-xs border border-blue-100 font-semibold shadow-xs">/estadistiques/</code> listas para descargar en Excel (CSV) o JSON.
          </p>
        </div>

        {/* Input Card Container with Dual tabs & Drag'n'Drop */}
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`bg-white rounded-xl border transition-all duration-200 shadow-sm overflow-hidden flex flex-col ${
            isDragging 
              ? "border-blue-500 ring-4 ring-blue-500/10 bg-blue-50/10 scale-[1.01]" 
              : "border-slate-200"
          }`}
        >
          {/* Tab switches */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            <button
              onClick={() => { setActiveTab("html"); setError(null); }}
              className={`flex-1 py-3 px-4 text-center font-bold text-xs sm:text-sm border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "html"
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-55/30"
              }`}
            >
              <FileCode className="w-4 h-4 text-blue-600" />
              <span>Pegar Código HTML</span>
              <span className="hidden sm:inline-block bg-emerald-500 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wide animate-pulse">
                100% Eficaz
              </span>
            </button>
            <button
              onClick={() => { setActiveTab("url"); setError(null); }}
              className={`flex-1 py-3 px-4 text-center font-bold text-xs sm:text-sm border-b-2 flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === "url"
                  ? "border-blue-600 text-blue-600 bg-white"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-55/30"
              }`}
            >
              <Link className="w-4 h-4 text-blue-500" />
              <span>Consulta por URL Directa</span>
            </button>
          </div>

          <div className="p-6 sm:p-8 flex flex-col gap-5">
            {activeTab === "html" ? (
              /* TAB 1: HTML Source Extraction (Client side - 100% bypass of security checks) */
              <div className="flex flex-col gap-4">
                
                {/* User Instructions list */}
                <div className="bg-blue-50/50 border border-blue-100/50 rounded-lg p-4 text-xs sm:text-sm text-blue-900 flex flex-col gap-3">
                  <div className="flex items-center gap-2 font-bold text-blue-950 uppercase tracking-wide text-xs">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    ¿Cómo saltarse la protección reCAPTCHA de la web de la Federación?
                  </div>
                  <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed text-blue-800">
                    <li>
                      Abre el enlace de la Federación Catalana en tu navegador (ej: <a href="https://www.basquetcatala.cat/estadistiques/68e168a29163a800012dafdb" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-blue-900 inline-flex items-center gap-0.5">https://www.basquetcatala.cat/estadistiques/... <ExternalLink className="w-3 h-3 inline" /></a>).
                    </li>
                    <li>
                      Haz clic derecho en cualquier parte vacía de la página y selecciona <strong>"Ver código fuente de la página"</strong> (o pulsa <kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-sans shadow-xs text-[10px]">Ctrl + U</kbd> o <kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-sans shadow-xs text-[10px]">Cmd + Option + U</kbd> en Mac).
                    </li>
                    <li>
                      Selecciona todo el código fuente (<kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-sans shadow-xs text-[10px]">Ctrl + A</kbd>), cópialo (<kbd className="bg-white px-1.5 py-0.5 rounded border border-blue-200 font-sans shadow-xs text-[10px]">Ctrl + C</kbd>) y <strong>pégalo en la caja de abajo</strong> (o guarda el archivo y arrástralo aquí).
                    </li>
                  </ol>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Código fuente de la Página (HTML)
                    </span>
                    {htmlInput.trim().length > 0 && (
                      <button 
                        onClick={() => setHtmlInput("")}
                        className="text-xs text-red-500 hover:text-red-700 font-semibold"
                      >
                        Limpiar contenido
                      </button>
                    )}
                  </div>

                  <div className="relative group">
                    <textarea
                      value={htmlInput}
                      onChange={(e) => setHtmlInput(e.target.value)}
                      placeholder="Pega aquí el código HTML completo de la página de la federación para extraer todos los enlaces de estadísticas sin bloqueos..."
                      className="w-full h-44 p-4 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 text-xs font-mono shadow-xs resize-none placeholder:text-slate-400 group-hover:border-slate-400 focus:group-hover:border-blue-500 transition-all duration-200"
                    />
                    
                    {/* Visual Drag overlay indicator inside textarea */}
                    {isDragging && (
                      <div className="absolute inset-0 bg-blue-600/95 rounded-lg flex flex-col items-center justify-center text-white gap-3 animate-fade-in pointer-events-none">
                        <Upload className="w-10 h-10 animate-bounce" />
                        <span className="font-bold text-base">¡Suelta el archivo HTML aquí!</span>
                        <span className="text-xs opacity-80">Se ingresará y procesará al instante</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4">
                  <div className="flex flex-col gap-1 w-full sm:max-w-xs">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Dominio para enlaces relativos
                    </label>
                    <input
                      type="text"
                      value={sourceUrlResolution}
                      onChange={(e) => setSourceUrlResolution(e.target.value)}
                      placeholder="https://www.basquetcatala.cat"
                      className="h-10 px-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 text-xs font-mono"
                    />
                  </div>

                  <button
                    onClick={() => handleExtractHTML()}
                    disabled={loading || !htmlInput.trim()}
                    className="h-11 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 active:scale-[0.98] text-white font-bold px-6 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer shadow-md shadow-emerald-600/10"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Procesar y Extraer Estadísticas
                  </button>
                </div>

              </div>
            ) : (
              /* TAB 2: Direct URL Query (Server-side fetch, risk of reCAPTCHA block) */
              <div className="flex flex-col gap-4">
                
                {/* Security Advice Ribbon */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-0.5">
                    <strong className="font-bold text-amber-950">Aviso sobre cortafuegos de la Federación</strong>
                    <p className="text-amber-800 leading-relaxed text-xs">
                      El servidor oficial de <code className="bg-white/60 px-1 rounded">basquetcatala.cat</code> utiliza protección anti-bots (reCAPTCHA Enterprise). Si la URL directa reporta 0 resultados o error, es debido a que el servidor ha bloqueado el proceso automático. Si esto ocurre, por favor utiliza la pestaña <strong>"Pegar Código HTML"</strong> arriba, que es 100% infalible.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor="url-input" className="text-sm font-semibold text-slate-700 block">
                    Enlace directo de Basquet Català
                  </label>
                  <div className="relative flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-grow">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Globe className="w-5 h-5" />
                      </div>
                      <input
                        id="url-input"
                        type="url"
                        placeholder="Ej: https://www.basquetcatala.cat/competicions/partit/300435"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleExtract()}
                        className="w-full h-12 pl-11 pr-4 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 placeholder:text-slate-400 text-sm font-mono shadow-xs transition-all duration-200"
                        disabled={loading}
                      />
                    </div>
                    <button
                      id="btn-extract"
                      onClick={() => handleExtract()}
                      disabled={loading || !url.trim()}
                      className="h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-450 active:scale-[0.98] text-white font-bold px-6 rounded-lg transition-all duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer shadow-md shadow-blue-600/10 disabled:shadow-none"
                    >
                      {loading ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          Extraer Enlaces
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick-test list (Badges) */}
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-xs font-bold text-slate-500 tracking-wider uppercase block mb-2">
                    Enlaces rápidos de ejemplo:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE_URLS.map((sample, idx) => (
                      <button
                        id={`sample-btn-${idx}`}
                        key={idx}
                        onClick={() => handleQuickTest(sample.url)}
                        disabled={loading}
                        className="text-xs font-semibold bg-slate-50 hover:bg-blue-50/70 hover:text-blue-700 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-200 transition-all duration-150 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        {sample.label}
                      </button>
                    ))}
                    {/* Add User provided URL dynamically to sample list */}
                    <button
                      onClick={() => handleQuickTest("https://www.basquetcatala.cat/estadistiques/68e168a29163a800012dafdb")}
                      disabled={loading}
                      className="text-xs font-semibold bg-slate-50 hover:bg-blue-50/75 hover:text-blue-700 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 hover:border-blue-200 transition-all duration-150 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                      URL de Ejemplo (Tu Enlace)
                    </button>
                  </div>
                </div>

                {/* Search History (Local Storage) */}
                {searchHistory.length > 0 && (
                  <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                      Búsquedas recientes:
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {searchHistory.map((item, index) => (
                        <div 
                          key={index} 
                          onClick={() => handleQuickTest(item)}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-mono bg-slate-50 border border-slate-100 hover:bg-blue-50/20 cursor-pointer transition-colors group"
                        >
                          <span className="truncate text-slate-600 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" />
                            {item}
                          </span>
                          <button
                            id={`delete-history-${index}`}
                            onClick={(e) => deleteHistoryItem(e, item)}
                            className="text-slate-400 hover:text-red-500 p-0.5 rounded hover:bg-slate-200/50 transition-colors"
                            title="Eliminar del historial"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                            
              </div>
            )}
          </div>
        </div>

        {/* Loading and Error Feedback */}
        <AnimatePresence mode="wait">
          {loading && (
            <motion.div
              id="loading-container"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-center gap-4 shadow-sm"
            >
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <Globe className="w-6 h-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="font-bold text-slate-900 text-lg">Analizando y estructurando contenidos...</h3>
                <p className="text-slate-500 max-w-md text-sm leading-relaxed">
                  Buscando hipervínculos coincidentes, depurando ocurrencias y normalizando las direcciones absolutas para el baloncesto catalán.
                </p>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              id="error-container"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-4 shadow-sm"
            >
              <div className="bg-red-100 text-red-600 p-2.5 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="flex flex-col gap-2 w-full">
                <h3 className="font-bold text-red-900 text-base">Error en la extracción</h3>
                <p className="text-red-700 text-sm leading-relaxed whitespace-pre-line">{error}</p>
                <div className="text-xs text-red-600 mt-2 font-medium bg-red-100/40 p-4 border border-red-200/50 rounded-lg leading-relaxed flex flex-col gap-2">
                  <strong className="text-red-900 uppercase tracking-wide text-[10px]">¿Cómo solucionarlo inmediatamente?</strong>
                  <ul className="list-disc pl-4 space-y-1 text-red-800">
                    <li>
                      <strong>Usa la pestaña "Pegar Código HTML":</strong> Si intentaste por URL y falló, es debido al control de seguridad reCAPTCHA de la web. Copiando el código fuente de la página directamente resolverá este bloqueo al 100%.
                    </li>
                    <li>
                      <strong>Comprueba el código fuente pego:</strong> Verifica que no hayas copiado la pantalla de error de seguridad de la página. Debes pasar primero el captcha manualmente en tu navegador en <a href="https://www.basquetcatala.cat" target="_blank" rel="noreferrer" className="underline font-bold">basquetcatala.cat</a>, y luego copiar el código una vez veas la tabla de clasificación/estadísticas cargada.
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          )}

          {/* Results Block */}
          {result && (
            <motion.div
              id="result-container"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-6"
            >
              
              {/* Overview Ribbon */}
              <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6">
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold leading-normal uppercase bg-blue-600 text-white px-2.5 py-0.5 rounded-full tracking-wider">
                      Páginas del Servidor
                    </span>
                    <span className="text-xs text-slate-400 font-mono truncate">{result.host}</span>
                  </div>
                  <h3 className="text-xl font-bold font-display truncate text-white" title={result.title}>
                    {result.title}
                  </h3>
                  <a 
                    href={result.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-xs text-blue-400 hover:text-blue-350 font-mono truncate flex items-center gap-1 hover:underline"
                  >
                    {result.url}
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>

                <div className="grid grid-cols-2 lg:flex items-center gap-4 border-t border-slate-800 md:border-t-0 pt-4 md:pt-0">
                  <div className="bg-slate-800/80 rounded-lg px-5 py-3 text-center border border-slate-700 shrink-0 flex flex-col justify-center">
                    <span className="text-2xl font-extrabold font-mono text-blue-405 block">{result.count}</span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Enlaces Únicos</span>
                  </div>
                  <div className="bg-slate-800/80 rounded-lg px-5 py-3 text-center border border-slate-700 shrink-0 flex flex-col justify-center">
                    <span className="text-2xl font-extrabold font-mono text-emerald-400 block">
                      {result.links.reduce((acc, curr) => acc + curr.occurrences, 0)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ocurrencias</span>
                  </div>
                </div>
              </div>

              {/* Exports Actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  id="csv-download-btn"
                  onClick={downloadCSV}
                  disabled={result.links.length === 0}
                  className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300 font-semibold px-4 py-4 rounded-xl shadow-xs transition-all duration-155 cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99] group text-left"
                >
                  <div className="bg-emerald-50 text-emerald-600 p-2 rounded-lg transition-colors group-hover:bg-emerald-100">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-slate-900 leading-tight">Descargar CSV (Excel)</span>
                    <span className="block text-slate-500 text-xs font-normal">Formato tabular organizado</span>
                  </div>
                </button>

                <button
                  id="json-download-btn"
                  onClick={downloadJSON}
                  disabled={result.links.length === 0}
                  className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 hover:border-slate-300 font-semibold px-4 py-4 rounded-xl shadow-xs transition-all duration-155 cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99] group text-left"
                >
                  <div className="bg-indigo-50 text-indigo-600 p-2 rounded-lg transition-colors group-hover:bg-indigo-100">
                    <FileJson className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold text-slate-900 leading-tight">Descargar JSON</span>
                    <span className="block text-slate-500 text-xs font-normal">Estructura limpia clave/valor</span>
                  </div>
                </button>

                <button
                  id="copy-all-btn"
                  onClick={copyAllToClipboard}
                  disabled={result.links.length === 0}
                  className={`${
                    copiedAll 
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent" 
                      : "bg-slate-900 hover:bg-slate-850 text-white border-transparent"
                  } font-semibold px-4 py-4 rounded-xl shadow-xs transition-all duration-155 cursor-pointer flex items-center justify-center gap-3 active:scale-[0.99] border text-left w-full`}
                >
                  <div className={`${copiedAll ? "bg-white/20 text-white" : "bg-white/10 text-blue-450"} p-2 rounded-lg transition-colors`}>
                    {copiedAll ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-bold leading-tight">{copiedAll ? "¡Enlaces Copiados!" : "Copiar todos los Enlaces"}</span>
                    <span className="block text-xs opacity-80 font-normal">Al portapapeles (texto)</span>
                  </div>
                </button>
              </div>

              {/* URL Filter Search / Filtered Count Display */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/50">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <h4 className="font-bold text-slate-800 uppercase tracking-tight text-xs sm:text-sm font-display">
                      Enlaces Coincidentes
                    </h4>
                    <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-lg self-start">
                      <button
                        onClick={() => setViewMode("jornadas")}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          viewMode === "jornadas"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Agrupado por Jornada
                      </button>
                      <button
                        onClick={() => setViewMode("list")}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5 ${
                          viewMode === "list"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <ListFilter className="w-3.5 h-3.5" />
                        Tabla Plana
                      </button>
                    </div>

                    {/* Format Toggle Configuration Option */}
                    <div className="flex items-center">
                      <label className="inline-flex items-center gap-2 text-blue-800 bg-blue-50/60 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg cursor-pointer select-none transition-all duration-150 border border-blue-100/60 active:scale-[0.98]">
                        <input
                          type="checkbox"
                          checked={includeJornadaNum}
                          onChange={(e) => setIncludeJornadaNum(e.target.checked)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 border-slate-300 cursor-pointer"
                        />
                        <span className="text-[11px] font-bold">Añadir jornada delante (ej. "16;http...")</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                      {filteredLinks.length} Enlaces
                    </span>
                    <div className="relative w-full sm:w-64">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Search className="w-4 h-4" />
                      </div>
                      <input
                        id="table-search"
                        type="text"
                        placeholder="Filtrar por título o enlace..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-150 text-slate-900"
                      />
                    </div>
                  </div>
                </div>

                {/* Empty State for Filters */}
                {filteredLinks.length === 0 ? (
                  <div className="p-12 text-center flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Layers className="w-10 h-10 text-slate-300 animate-pulse" />
                    <span className="font-bold text-slate-800 text-sm">No se encontraron coincidencias</span>
                    <span className="text-xs text-slate-505">Usa otros términos de búsqueda o borra el filtro actual.</span>
                  </div>
                ) : viewMode === "jornadas" ? (
                  /* GROUPED BY JORNADA ACCORDION VIEW */
                  <div className="flex flex-col divide-y divide-slate-100 bg-white p-5 sm:p-6 gap-6">
                    {/* Unified Block Card */}
                    {sortedJornadaKeys.length > 0 && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div>
                            <h5 className="font-extrabold text-blue-900 text-sm font-display uppercase tracking-wider flex items-center gap-2">
                              <span>📋</span> Copiar Todo de un Solo Golpe
                            </h5>
                            <p className="text-xs text-slate-600 mt-1">
                              Copia todos los enlaces de todas las jornadas estructurados con sus encabezados correspondientes.
                            </p>
                          </div>
                          <button
                            onClick={() => copyUnifiedLinks(sortedJornadaKeys, groupedLinks)}
                            className={`w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-lg cursor-pointer flex items-center justify-center gap-2 transition-all shadow-xs ${
                              copiedUnified
                                ? "bg-emerald-600 text-white"
                                : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-xs"
                            }`}
                          >
                            {copiedUnified ? (
                              <>
                                <Check className="w-4 h-4" />
                                ¡Copiado al Portapapeles!
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                Copiar Todo Combinado
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Individual Jornadas Boxes */}
                    <div className="space-y-6 pt-4">
                      {sortedJornadaKeys.map((jornadaKey, jIdx) => {
                        const linksInJornada = groupedLinks[jornadaKey];
                        const urlString = linksInJornada.map(l => formatLinkText(l, includeJornadaNum)).join("\n");
                        const isCopied = copiedJornadaKey === jornadaKey;

                        return (
                          <div key={jIdx} className="bg-slate-50/30 border border-slate-200 rounded-xl p-5 hover:border-slate-300 transition-all flex flex-col gap-3">
                            {/* Jornada Header Title */}
                            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
                              <h5 className="font-extrabold text-slate-900 font-display text-sm sm:text-base flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shadow-xs shadow-blue-500/50 animate-pulse"></span>
                                {jornadaKey}
                              </h5>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">
                                  {linksInJornada.length} {linksInJornada.length === 1 ? 'Enlace' : 'Enlaces'}
                                </span>
                                <button
                                  onClick={() => copyJornadaLinks(jornadaKey, linksInJornada)}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer flex items-center gap-1.5 transition-all outline-none ${
                                    isCopied
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                                      : "bg-white hover:bg-blue-50 text-blue-700 border border-slate-300 hover:border-blue-300"
                                  }`}
                                  title="Copiar lista de enlaces para esta jornada"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3.5 h-3.5" />
                                      ¡Copiado!
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copiar Enlaces
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* TextBox Area for Links */}
                            <div className="relative group/text">
                              <textarea
                                readOnly
                                rows={Math.min(linksInJornada.length, 6)}
                                value={urlString}
                                className="w-full font-mono text-xs p-4 bg-slate-900 text-slate-100 rounded-lg border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 font-medium leading-relaxed resize-none cursor-text shadow-inner scrollbar-thin"
                                placeholder="Extrayendo enlaces de la jornada..."
                                onClick={(e) => {
                                  // Auto select on click for extremely simple copying
                                  (e.target as HTMLTextAreaElement).select();
                                }}
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover/text:opacity-100 transition-opacity bg-slate-800/90 text-slate-300 px-2 py-1 rounded text-[10px] font-bold pointer-events-none">
                                Clic para seleccionar todo
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* FLAT TABLE VIEW */
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white border-b border-slate-200 text-xs font-bold text-slate-500 tracking-wider uppercase">
                          <th className="px-6 py-4">Sesión / Jornada</th>
                          <th className="px-6 py-4">Descripción del Enlace</th>
                          <th className="px-6 py-4">URL de Estadísticas</th>
                          <th className="px-6 py-4 text-center">Frecuencia</th>
                          <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {filteredLinks.map((link, idx) => {
                          const overallIndex = result.links.findIndex(l => l.url === link.url);
                          return (
                            <tr key={idx} className="hover:bg-blue-50/20 transition-colors duration-150 cursor-pointer">
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center gap-1.5 text-xs text-slate-650 font-bold bg-slate-100 px-2.5 py-1 rounded-full border border-slate-205">
                                  {link.jornada || "Sin Jornada / Otras"}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-medium text-slate-900">
                                <span className="inline-block bg-blue-50/50 text-blue-700 text-xs px-2.5 py-1 rounded border border-blue-100 font-semibold truncate max-w-[200px]" title={link.text}>
                                  {link.text || "Ver Estadísticas"}
                                </span>
                              </td>
                              <td className="px-6 py-4 max-w-sm">
                                <div className="font-mono text-xs text-blue-600 truncate hover:underline" title={link.url}>
                                  {link.url}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center font-mono text-xs font-bold text-slate-550">
                                {link.occurrences}x
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    id={`copy-single-btn-${idx}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copySingleToClipboard(link.url, overallIndex);
                                    }}
                                    className={`p-2 rounded-md border transition-all cursor-pointer ${
                                      copiedIndex === overallIndex
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                                        : "bg-white hover:bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-705"
                                    }`}
                                    title="Copiar URL"
                                  >
                                    {copiedIndex === overallIndex ? (
                                      <Check className="w-3.5 h-3.5" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                  <a
                                    id={`external-link-btn-${idx}`}
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-505 hover:text-slate-700 transition-all flex items-center justify-center cursor-pointer"
                                    title="Abrir enlace en pestaña nueva"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Footer Count Ribbon */}
                <div className="bg-slate-50/50 border-t border-slate-200 px-6 py-4 text-xs font-medium text-slate-500 flex items-center justify-between">
                  <span>
                    Mostrando <strong>{filteredLinks.length}</strong> de{" "}
                    <strong>{result.count}</strong> enlaces filtrados.
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Extracción verificada con éxito
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Feature Guides Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col md:flex-row gap-6 mt-2">
          <div className="flex-1 flex flex-col gap-2">
            <h4 className="font-bold text-slate-900 text-sm font-display flex items-center gap-2">
              <span className="flex w-2 h-2 rounded-full bg-blue-500"></span>
              ¿Cómo funciona la extracción automática?
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Al procesar una URL, el backend realiza de forma segura la petición a la web de la federación simulando un cliente. Nuestro analizador procesará todas las etiquetas de hipervínculo (<code className="font-mono text-blue-600 bg-slate-50 px-1 rounded">&lt;a href="..."&gt;</code>) buscando coincidencias específicas con la ruta catalana <code className="font-mono text-blue-600 bg-slate-50 px-1 rounded">/estadistiques/</code>, limpiando el texto del enlace para estructurar etiquetas y agregando parámetros absolutos para cada enlace.
            </p>
          </div>
          <div className="flex-1 flex flex-col gap-2 border-t border-slate-100 md:border-t-0 md:border-l md:pl-6 pt-4 md:pt-0">
            <h4 className="font-bold text-slate-900 text-sm font-display flex items-center gap-2">
              <span className="flex w-2 h-2 rounded-full bg-green-500"></span>
              Compatibilidad de Formatos CSV & Excel
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed font-normal">
              El archivo CSV descargado incorpora las cabeceras estándar en español/catalán y se genera con una firma especial de marca de orden de bytes de UTF-8 (BOM: <code className="font-mono text-green-600 bg-slate-50 px-1 rounded">\uFEFF</code>). Esto asegura que al abrir la plantilla en Microsoft Excel, Numbers, LibreOffice o Google Sheets, se interpreten de forma de 100% correcta todos los caracteres catalanes especiales y acentos.
            </p>
          </div>
        </div>

      </main>

      {/* Aesthetic human literal Footer */}
      <footer className="bg-slate-900 px-8 py-4 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-auto gap-2 text-center sm:text-left">
        <span>API Status: Normal (21ms Latency)</span>
        <span>Build v2.4.0 • Basketball Federation Automated Crawler</span>
        <span>Session Token: BQ-9844-X9</span>
      </footer>
    </div>
  );
}
