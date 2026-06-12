export interface ExtractedLink {
  url: string;
  text: string;
  occurrences: number;
  jornada?: string;
}

export interface ExtractionResult {
  success: boolean;
  title: string;
  url: string;
  host: string;
  count: number;
  links: ExtractedLink[];
}

export interface ExtractionError {
  success: boolean;
  error: string;
}
