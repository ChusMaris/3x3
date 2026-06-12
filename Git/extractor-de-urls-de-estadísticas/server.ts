import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

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

function findJornadaCheerio($: cheerio.CheerioAPI, element: any): string {
  let current = $(element);
  while (current.length > 0 && current[0].name !== 'body') {
    let sibling = current.prev();
    while (sibling.length > 0) {
      const headers = sibling.find("h1, h2, h3, h4, h5, h6, .jornada, .titol-jornada, .title, strong, b, td, th");
      if (headers.length > 0) {
        for (let i = headers.length - 1; i >= 0; i--) {
          const text = $(headers[i]).text().trim();
          if (/jornada/i.test(text) && text.length < 100) {
            return cleanJornadaText(text);
          }
        }
      }
      const sibText = sibling.text().trim();
      if (/jornada/i.test(sibText) && sibText.length < 100) {
        return cleanJornadaText(sibText);
      }
      sibling = sibling.prev();
    }
    current = current.parent();
  }
  return "Sin Jornada / Otras";
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON body
  app.use(express.json());

  // API endpoint to extract URLs containing /estadistiques/
  app.post("/api/extract", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: "Se requiere una URL para poder realizar la extracción.",
      });
    }

    // Basic URL validation
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
      if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
        throw new Error("Protocolo no válido. Debe ser http o https.");
      }
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: "La URL proporcionada no es válida. Asegúrate de incluir el protocolo (http:// o https://).",
      });
    }

    try {
      // Fetching the target page using standard fetch with browser-like user agent
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "ca,es;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
      });

      if (!response.ok) {
        return res.status(400).json({
          success: false,
          error: `Error al conectar con la página (Código de respuesta HTTP: ${response.status}). Verifique si el enlace es correcto.`,
        });
      }

      const htmlText = await response.text();

      // Load HTML to parse with cheerio
      const $ = cheerio.load(htmlText);

      // Get page title
      const pageTitle = $("title").text().trim() || "Página de la Federación";

      const extractedMap = new Map<string, { text: string; occurrences: number; jornada: string }>();

      // Search all anchor tags
      $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (!href) return;

        // Check if url contains /estadistiques/ but exclude video URLs
        if (href.includes("/estadistiques/") && !href.includes("/video/")) {
          // Normalize URL to absolute path
          let absoluteUrl = href;
          try {
            absoluteUrl = new URL(href, targetUrl.href).toString();
          } catch (err) {
            // If new URL fails, fall back to simple joining if it looks relative
            if (href.startsWith("/")) {
              absoluteUrl = `${targetUrl.origin}${href}`;
            }
          }

          // Fetch anchor text
          const anchorText = $(element).text().replace(/\s+/g, " ").trim() || "[Enlace sin texto]";

          // Retrieve Nearby Jornada
          const jornada = findJornadaCheerio($, element);

          if (extractedMap.has(absoluteUrl)) {
            const existing = extractedMap.get(absoluteUrl)!;
            // Prefer non-empty or longer and descriptive text for duplicates
            const updatedText = anchorText.length > existing.text.length && anchorText !== "[Enlace sin texto]"
              ? anchorText
              : existing.text;
            extractedMap.set(absoluteUrl, {
              text: updatedText,
              occurrences: existing.occurrences + 1,
              jornada: existing.jornada !== "Sin Jornada / Otras" ? existing.jornada : jornada,
            });
          } else {
            extractedMap.set(absoluteUrl, {
              text: anchorText,
              occurrences: 1,
              jornada: jornada,
            });
          }
        }
      });

      // Convert map to array structure
      const links = Array.from(extractedMap.entries()).map(([urlStr, data]) => ({
        url: urlStr,
        text: data.text,
        occurrences: data.occurrences,
        jornada: data.jornada,
      }));

      return res.json({
        success: true,
        title: pageTitle,
        url: targetUrl.href,
        host: targetUrl.hostname,
        count: links.length,
        links,
      });

    } catch (error: any) {
      console.error("Extraction error:", error);
      return res.status(500).json({
        success: false,
        error: `Ocurrió un error al intentar conectarse al servidor de la federación: ${error.message || error}`,
      });
    }
  });

  // Serve Vite or static assets depending on environment
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

startServer();
