import type { ScheduleConfig } from '../lib/scheduler';

export const INITIAL_CATEGORIES = [
  'BEN M', 'BEN F',
  'ALV M', 'ALV F',
  'INF M', 'INF F',
  'CAD M', 'CAD F',
  'JUN M', 'JUN F',
  'SEN M', 'SEN F'
];

export const DEFAULT_TEAMS_INPUT = `BEN M,Elite
BEN M,Makina
BEN M,Tornado
BEN F,Mini Jordan
BEN F,Las profesionales
BEN F,El Barça
BEN F,Girls
BEN F,The banana chips
ALV M,BCN Bulls
ALV M,All Star
ALV M,Wildwolves
ALV M,Los Ambiot
ALV M,Splash Brothers
ALV M,Los sin nombre
ALV M,Las Panteras
ALV M,Tralalelitos
ALV F,Bombastic side eye
ALV F,Patatas fritas
ALV F,Brafa girls
INF F,The panthers
INF F,Queen tigers
INF F,Cookies
INF M,Air NO Jordan
INF M,Haribo shooters
INF M,Macarrones con queso
INF M,La pepa pig
INF M,N.B.A.
INF M,Mastudontes
INF M,Call of duty black ops 2
INF M,The King
CAD M,Lakers in 5
CAD M,BBC
CAD M,Callejón letal
CAD M,Los pinettys
CAD M,Aston Birra
CAD M,Black Panters`;

export function createDefaultScheduleConfig(): ScheduleConfig {
  return {
    courtConfigs: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      rimType: (i + 1) <= 2 ? 'low' : 'normal',
      allowedCategories: []
    })),
    gameDuration: 10,
    breakDuration: 5,
    startTime: '09:30',
    endTime: '14:30',
    minGamesPerTeam: 3,
    generalBreakTime: '11:30',
    generalBreakDuration: 15,
    useFillPhase: false,
    playoffThreshold: 6,
    categoryConfig: {}
  };
}
