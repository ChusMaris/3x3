import type { Match, ScheduleConfig } from '../lib/scheduler';

export interface TeamData {
  name: string;
  playerCount: number;
}

export interface TournamentData {
  matches: Match[];
  config: ScheduleConfig;
  teamInput: string;
  teamsByCategory?: Record<string, TeamData[]>;
  appCategories?: string[];
  isLocked?: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  event_date: string;
  data: TournamentData;
  created_at: string;
  deleted_at?: string | null;
}
