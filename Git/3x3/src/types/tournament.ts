import type { Match, ScheduleConfig } from '../lib/scheduler';

export interface TournamentData {
  matches: Match[];
  config: ScheduleConfig;
  teamInput: string;
  teamsByCategory?: Record<string, string[]>;
  isLocked?: boolean;
}

export interface Tournament {
  id: string;
  name: string;
  event_date: string;
  data: TournamentData;
  created_at: string;
}
