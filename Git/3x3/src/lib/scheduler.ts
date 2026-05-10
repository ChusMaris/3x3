/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Team {
  id: string;
  name: string;
  category: string;
}

export interface Match {
  id: string;
  category: string;
  phase: string;
  team1: string;
  team2: string;
  startTime: Date;
  endTime: Date;
  court: number;
  score1?: number;
  score2?: number;
}

export interface ScheduleConfig {
  courts: number;
  gameDuration: number;
  breakDuration: number;
  startTime: string; // "09:30"
  generalBreakTime: string; // "11:30"
  generalBreakDuration: number; // 15
}

export function parseTeams(input: string): Team[] {
  const lines = input.trim().split('\n');
  return lines.map((line, index) => {
    const parts = line.split(/[\t,;]/).map(p => p.trim());
    if (parts.length >= 2) {
      const category = parts[0];
      const name = parts[1];
      if (category.toLowerCase().includes('categor') || name.toLowerCase().includes('nombre')) return null;
      return {
        id: `team-${index}`,
        category,
        name
      };
    }
    return null;
  }).filter((t): t is Team => t !== null);
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

interface Matchup {
  category: string;
  a: string;
  b: string;
  phase: string;
  priority: number;
}

function generateTournamentMatchups(teams: Team[]): Matchup[] {
  const categories = Array.from(new Set(teams.map(t => t.category)));
  const allMatchups: Matchup[] = [];

  categories.forEach(cat => {
    const catTeams = teams.filter(t => t.category === cat);
    const n = catTeams.length;
    
    if (n < 2) return;

    if (n === 2) {
      // Just a final? Or 3 matches between them to meet "min 3 games"?
      // User says "min 3 games in group phase". If only 2 teams, they play 3 times? 
      // Let's say Ida/Vuelta + Extra match or just keep it simple.
      // Usually n=2 doesn't happen with these numbers.
      for(let i=0; i<3; i++) {
        allMatchups.push({ category: cat, a: catTeams[0].name, b: catTeams[1].name, phase: `Previo ${i+1}`, priority: 1 });
      }
      allMatchups.push({ category: cat, a: catTeams[0].name, b: catTeams[1].name, phase: 'Final', priority: 10 });
    }
    else if (n === 3) {
      // 3 teams: 2 rounds of league = 4 games each
      for(let round=1; round<=2; round++) {
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            allMatchups.push({ category: cat, a: catTeams[i].name, b: catTeams[j].name, phase: `Grupo (R${round})`, priority: round });
          }
        }
      }
      allMatchups.push({ category: cat, a: '1º Clasificado', b: '2º Clasificado', phase: 'Final', priority: 10 });
    }
    else if (n <= 6) {
      // 4-6 teams: Single league. 4 teams = 3 games, 5 teams = 4 games, 6 teams = 5 games.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const [t1, t2] = (i + j) % 2 === 0 ? [catTeams[i].name, catTeams[j].name] : [catTeams[j].name, catTeams[i].name];
          allMatchups.push({ category: cat, a: t1, b: t2, phase: 'Grupo', priority: 1 });
        }
      }
      allMatchups.push({ category: cat, a: '1º Clasificado', b: '2º Clasificado', phase: 'Final', priority: 10 });
    }
    else {
      // 7-8 teams: 2 groups
      const groupA = catTeams.slice(0, Math.ceil(n/2));
      const groupB = catTeams.slice(Math.ceil(n/2));

      [groupA, groupB].forEach((group, gIdx) => {
        const prefix = gIdx === 0 ? 'A' : 'B';
        const gn = group.length;
        if (gn === 3) {
          // Ida/Vuelta to get 4 games
          for(let round=1; round<=2; round++) {
            for (let i = 0; i < gn; i++) {
              for (let j = i + 1; j < gn; j++) {
                allMatchups.push({ category: cat, a: group[i].name, b: group[j].name, phase: `Grupo ${prefix} (R${round})`, priority: round });
              }
            }
          }
        } else {
          for (let i = 0; i < gn; i++) {
            for (let j = i + 1; j < gn; j++) {
              const [t1, t2] = (i + j) % 2 === 0 ? [group[i].name, group[j].name] : [group[j].name, group[i].name];
              allMatchups.push({ category: cat, a: t1, b: t2, phase: `Grupo ${prefix}`, priority: 1 });
            }
          }
        }
      });
      // Semis
      allMatchups.push({ category: cat, a: '1º Gr.A', b: '2º Gr.B', phase: 'Semifinal 1', priority: 5 });
      allMatchups.push({ category: cat, a: '1º Gr.B', b: '2º Gr.A', phase: 'Semifinal 2', priority: 6 });
      allMatchups.push({ category: cat, a: 'Ganador S1', b: 'Ganador S2', phase: 'Final', priority: 10 });
    }
  });

  return allMatchups;
}

export function generateSchedule(teams: Team[], config: ScheduleConfig): Match[] {
  const allMatchups = generateTournamentMatchups(teams);
  
  const shuffle = <T>(array: T[]): T[] => {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  const matches: Match[] = [];
  const [startH, startM] = config.startTime.split(':').map(Number);
  const [breakH, breakM] = config.generalBreakTime.split(':').map(Number);

  let baseTime = new Date();
  baseTime.setHours(startH, startM, 0, 0);

  const generalBreakStart = new Date(baseTime);
  generalBreakStart.setHours(breakH, breakM, 0, 0);
  const generalBreakEnd = new Date(generalBreakStart.getTime() + config.generalBreakDuration * 60000);

  const teamNextAvailable = new Map<string, number>();
  const teamGamesPlayed = new Map<string, number>();
  
  let courts = Array.from({ length: config.courts }, (_, i) => ({
    id: i + 1,
    nextAvailable: baseTime.getTime(),
    isSmallBasket: (i + 1) <= 2
  }));

  const isSmallBasketCat = (cat: string) => {
    const uc = cat.toUpperCase();
    return uc.includes('BEN') || uc.includes('ALV');
  };

  let pendingMatchups = [...allMatchups];
  const priorities = Array.from(new Set(pendingMatchups.map(m => m.priority))).sort((a, b) => a - b);

  for (const prio of priorities) {
    let phaseMatchups = shuffle(pendingMatchups.filter(m => m.priority === prio));
    
    while (phaseMatchups.length > 0) {
      courts.sort((a, b) => a.nextAvailable - b.nextAvailable);
      let matchFound = false;

      // Sort phaseMatchups dynamically to prioritize teams with fewer games played
      // and those who have been waiting longer to play.
      phaseMatchups.sort((m1, m2) => {
        const gamesM1 = (teamGamesPlayed.get(m1.a) || 0) + (teamGamesPlayed.get(m1.b) || 0);
        const gamesM2 = (teamGamesPlayed.get(m2.a) || 0) + (teamGamesPlayed.get(m2.b) || 0);
        if (gamesM1 !== gamesM2) return gamesM1 - gamesM2;
        
        const m1Free = Math.max(teamNextAvailable.get(m1.a) || 0, teamNextAvailable.get(m1.b) || 0);
        const m2Free = Math.max(teamNextAvailable.get(m2.a) || 0, teamNextAvailable.get(m2.b) || 0);
        return m1Free - m2Free;
      });

      for (const court of courts) {
        // Handle general break
        if (court.nextAvailable >= generalBreakStart.getTime() && court.nextAvailable < generalBreakEnd.getTime()) {
          court.nextAvailable = generalBreakEnd.getTime();
          continue;
        }

        const matchIndex = phaseMatchups.findIndex(m => {
          const catNeedsSmall = isSmallBasketCat(m.category);
          if (catNeedsSmall && !court.isSmallBasket) return false;
          if (!catNeedsSmall && court.isSmallBasket) return false;
          
          const aFree = teamNextAvailable.get(m.a) || 0;
          const bFree = teamNextAvailable.get(m.b) || 0;
          
          // BACK-TO-BACK GUARD: Teams must have at least 'breakDuration' after their last game
          // PLUS we add a soft requirement: if they just played, they should wait at least one game duration if possible.
          // But here we strictly respect the 'aFree' which will now include a mandatory rest.
          return aFree <= court.nextAvailable && bFree <= court.nextAvailable;
        });

        if (matchIndex !== -1) {
          const m = phaseMatchups.splice(matchIndex, 1)[0];
          const matchStart = new Date(court.nextAvailable);
          
          if (matchStart.getTime() < generalBreakStart.getTime() && 
              (matchStart.getTime() + config.gameDuration * 60000) > generalBreakStart.getTime()) {
            court.nextAvailable = generalBreakEnd.getTime();
            phaseMatchups.unshift(m);
            matchFound = true;
            break;
          }

          const matchEnd = new Date(matchStart.getTime() + config.gameDuration * 60000);
          
          matches.push({
            id: `${m.category.replace(/[^A-Z0-9]/gi, '')}-${matches.length + 1}`,
            category: m.category,
            phase: m.phase,
            team1: m.a,
            team2: m.b,
            startTime: matchStart,
            endTime: matchEnd,
            court: court.id
          });

          const nextFreeForCourt = matchEnd.getTime() + config.breakDuration * 60000;
          
          // TEAMS: Available after the minimum break duration.
          // This ensures courts stay busy. We rely on the dynamic sorting below 
          // to prefer teams that haven't played recently if they are also ready.
          const teamNextAvailableTime = matchEnd.getTime() + config.breakDuration * 60000;
          
          court.nextAvailable = nextFreeForCourt;
          teamNextAvailable.set(m.a, teamNextAvailableTime);
          teamNextAvailable.set(m.b, teamNextAvailableTime);
          teamGamesPlayed.set(m.a, (teamGamesPlayed.get(m.a) || 0) + 1);
          teamGamesPlayed.set(m.b, (teamGamesPlayed.get(m.b) || 0) + 1);
          
          matchFound = true;
          break;
        }
      }

      if (!matchFound && phaseMatchups.length > 0) {
        // Jump all courts that are stuck to the earliest possible team ready time
        let nextReady = Infinity;
        phaseMatchups.forEach(m => {
          const ready = Math.max(teamNextAvailable.get(m.a) || 0, teamNextAvailable.get(m.b) || 0);
          if (ready < nextReady) nextReady = ready;
        });

        const minCourt = Math.min(...courts.map(c => c.nextAvailable));
        const finalTarget = Math.max(minCourt, nextReady);

        courts.forEach(c => {
          if (c.nextAvailable < finalTarget) c.nextAvailable = finalTarget;
        });

        if (nextReady === Infinity) break; // Should not happen
      }
    }
  }

  return matches;
}
