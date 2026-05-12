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

export type CourtRimType = 'normal' | 'low';

export interface CourtConfig {
  id: number;
  rimType: CourtRimType;
  allowedCategories: string[];
}

export interface ScheduleConfig {
  courtConfigs: CourtConfig[];
  gameDuration: number;
  breakDuration: number;
  startTime: string; // "09:30"
  endTime: string;   // "14:30"
  minGamesPerTeam: number;
  generalBreakTime: string; // "11:30"
  generalBreakDuration: number; // 15
  useFillPhase?: boolean; // New: Toggle for full calendar filling
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

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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

export function generateSchedule(teams: Team[], config: ScheduleConfig, initialMatches?: Match[]): Match[] {
  if (!config.courtConfigs || config.courtConfigs.length === 0) {
    throw new Error("No hay pistas configuradas. Configura al menos una pista en la pestaña de Pistas.");
  }
  
  const allMatchups = generateTournamentMatchups(teams);
  
  // Validation: Ensure every category has at least one court that can host it
  const catsInTeams = Array.from(new Set(teams.map(t => t.category)));
  for (const cat of catsInTeams) {
    const hasCourt = config.courtConfigs.some(cc => {
      const isAllowed = cc.allowedCategories.length === 0 || cc.allowedCategories.includes(cat);
      if (!isAllowed) return false;
      
      // Also check rim type compatibility if no explicit categories defined
      if (cc.allowedCategories.length === 0) {
        const catNeedsSmall = cat.toUpperCase().includes('BEN') || cat.toUpperCase().includes('ALV');
        const courtIsSmall = cc.rimType === 'low';
        if (catNeedsSmall && !courtIsSmall) return false;
        if (!catNeedsSmall && courtIsSmall) return false;
      }
      return true;
    });
    
    if (!hasCourt) {
      throw new Error(`La categoría ${cat} no tiene ninguna pista compatible asignada. Revisa la configuración de pistas.`);
    }
  }

  const seededShuffle = <T>(array: T[], seed: string): T[] => {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s + seed.charCodeAt(i)) | 0;
    
    // Simple deterministic LCG
    const next = () => {
      s = (1103515245 * s + 12345) % 2147483647;
      return Math.abs(s) / 2147483647;
    };

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  // Seed based on input parameters to ensure stability across toggles
  const runSeed = teams.map(t => t.name).sort().join('') + config.courtConfigs.length;

  const matches: Match[] = initialMatches ? [...initialMatches] : [];
  const [startH, startM] = (config.startTime || "09:00").split(':').map(Number);
  const [endH, endM] = (config.endTime || "14:00").split(':').map(Number);
  const [breakH, breakM] = (config.generalBreakTime || "12:00").split(':').map(Number);

  let baseTime = new Date();
  baseTime.setHours(startH || 9, startM || 0, 0, 0);

  const finalEndTime = new Date(baseTime);
  finalEndTime.setHours(endH || 14, endM || 0, 0, 0);

  // Safety: if end time is before start time, assume it's the next day
  if (finalEndTime.getTime() <= baseTime.getTime()) {
    finalEndTime.setDate(finalEndTime.getDate() + 1);
  }

  const generalBreakStart = new Date(baseTime);
  generalBreakStart.setHours(breakH || 12, breakM || 0, 0, 0);
  const breakDuration = Math.max(0, config.generalBreakDuration || 0);
  const generalBreakEnd = new Date(generalBreakStart.getTime() + breakDuration * 60000);

  const teamNextAvailable = new Map<string, number>();
  const teamGamesCount = new Map<string, number>();
  // To avoid immediate rematches in fill phase
  const lastOpponent = new Map<string, string>();

  // If initialMatches provided, populate the state from them
  if (initialMatches) {
    initialMatches.forEach(m => {
      const endT = m.endTime.getTime() + config.breakDuration * 60000;
      teamNextAvailable.set(m.team1, Math.max(teamNextAvailable.get(m.team1) || 0, endT));
      teamNextAvailable.set(m.team2, Math.max(teamNextAvailable.get(m.team2) || 0, endT));
      teamGamesCount.set(m.team1, (teamGamesCount.get(m.team1) || 0) + 1);
      teamGamesCount.set(m.team2, (teamGamesCount.get(m.team2) || 0) + 1);
      lastOpponent.set(m.team1, m.team2);
      lastOpponent.set(m.team2, m.team1);
    });
  }
  
  let courts = config.courtConfigs.map(cc => ({
    id: cc.id,
    nextAvailable: baseTime.getTime(),
    isSmallBasket: cc.rimType === 'low',
    allowedCategories: cc.allowedCategories
  }));

  const isSmallBasketCat = (cat: string) => {
    const uc = cat.toUpperCase();
    return uc.includes('BEN') || uc.includes('ALV');
  };

  if (!initialMatches) {
    let pendingMatchups = [...allMatchups];
    const priorities = Array.from(new Set(pendingMatchups.map(m => m.priority))).sort((a, b) => a - b);

    // Main Tournament Loop
    let safetyCounter = 0;
    const MAX_ITERATIONS = 5000;

    for (const prio of priorities) {
      let phaseMatchups = seededShuffle(pendingMatchups.filter(m => m.priority === prio), runSeed + prio);
      
      while (phaseMatchups.length > 0 && safetyCounter < MAX_ITERATIONS) {
        safetyCounter++;
        courts.sort((a, b) => a.nextAvailable - b.nextAvailable);
        let matchFound = false;

        // Sort phaseMatchups dynamically to prioritize teams with fewer games played
        phaseMatchups.sort((m1, m2) => {
          const gamesM1 = (teamGamesCount.get(m1.a) || 0) + (teamGamesCount.get(m1.b) || 0);
          const gamesM2 = (teamGamesCount.get(m2.a) || 0) + (teamGamesCount.get(m2.b) || 0);
          if (gamesM1 !== gamesM2) return gamesM1 - gamesM2;
          
          const m1Free = Math.max(teamNextAvailable.get(m1.a) || 0, teamNextAvailable.get(m1.b) || 0);
          const m2Free = Math.max(teamNextAvailable.get(m2.a) || 0, teamNextAvailable.get(m2.b) || 0);
          return m1Free - m2Free;
        });

        for (const court of courts) {
          if (court.nextAvailable >= finalEndTime.getTime()) continue;

          // Handle general break
          if (court.nextAvailable >= generalBreakStart.getTime() && court.nextAvailable < generalBreakEnd.getTime()) {
            court.nextAvailable = generalBreakEnd.getTime();
            continue;
          }

          const matchIndex = phaseMatchups.findIndex(m => {
            const isCatAllowed = court.allowedCategories.length === 0 || court.allowedCategories.includes(m.category);
            if (!isCatAllowed) return false;

            const catNeedsSmall = isSmallBasketCat(m.category);
            if (court.allowedCategories.length === 0) {
              if (catNeedsSmall && !court.isSmallBasket) return false;
              if (!catNeedsSmall && court.isSmallBasket) return false;
            }
            
            const aFree = teamNextAvailable.get(m.a) || 0;
            const bFree = teamNextAvailable.get(m.b) || 0;
            
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
            if (matchEnd.getTime() > finalEndTime.getTime()) continue;
            
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
            const teamNextAvailableTime = matchEnd.getTime() + config.breakDuration * 60000;
            
            court.nextAvailable = nextFreeForCourt;
            teamNextAvailable.set(m.a, teamNextAvailableTime);
            teamNextAvailable.set(m.b, teamNextAvailableTime);
            teamGamesCount.set(m.a, (teamGamesCount.get(m.a) || 0) + 1);
            teamGamesCount.set(m.b, (teamGamesCount.get(m.b) || 0) + 1);
            lastOpponent.set(m.a, m.b);
            lastOpponent.set(m.b, m.a);
            
            matchFound = true;
            break;
          }
        }

        if (!matchFound && phaseMatchups.length > 0) {
          let nextReady = Infinity;
          phaseMatchups.forEach(m => {
            const ready = Math.max(teamNextAvailable.get(m.a) || 0, teamNextAvailable.get(m.b) || 0);
            if (ready < nextReady) nextReady = ready;
          });

          const minCourt = Math.min(...courts.map(c => c.nextAvailable));
          const finalTarget = Math.max(minCourt, nextReady);
          courts.forEach(c => { if (c.nextAvailable < finalTarget) c.nextAvailable = finalTarget; });
          if (nextReady === Infinity) break;
        }
      }
    }
  }

  // PHASE 2 & 3: FILLER (Gap-aware)
  const busyCourts = new Map<number, {start: number, end: number}[]>();
  const busyTeams = new Map<string, {start: number, end: number}[]>();

  const addBusy = (courtId: number, t1: string, t2: string, start: number, end: number) => {
    const cSlots = busyCourts.get(courtId) || [];
    cSlots.push({ start, end });
    busyCourts.set(courtId, cSlots);

    const t1Slots = busyTeams.get(t1) || [];
    t1Slots.push({ start, end });
    busyTeams.set(t1, t1Slots);

    const t2Slots = busyTeams.get(t2) || [];
    t2Slots.push({ start, end });
    busyTeams.set(t2, t2Slots);
  };

  // Populate busy maps from original matches
  matches.forEach(m => {
    addBusy(m.court, m.team1, m.team2, m.startTime.getTime(), m.endTime.getTime());
  });

  const isOccupied = (intervals: {start: number, end: number}[], start: number, end: number, buffer: number) => {
    return intervals.some(inv => {
      // The new match [start, end] must not overlap with [inv.start - buffer, inv.end + buffer]
      return (start < inv.end + buffer && end > inv.start - buffer);
    });
  };

  const getPossibleExtraMatch = (startTime: number, endTime: number, courtId: number, onlyLowGames: boolean) => {
    const courtConfig = config.courtConfigs.find(c => c.id === courtId);
    if (!courtConfig) return null;

    const categoriesSorted = seededShuffle([...catsInTeams], runSeed + startTime);
    for (const cat of categoriesSorted) {
      // Court compatibility
      const isCatAllowed = courtConfig.allowedCategories.length === 0 || courtConfig.allowedCategories.includes(cat);
      if (!isCatAllowed) continue;
      if (courtConfig.allowedCategories.length === 0) {
        const catNeedsSmall = isSmallBasketCat(cat);
        const courtIsSmall = courtConfig.rimType === 'low';
        if (catNeedsSmall && !courtIsSmall) continue;
        if (!catNeedsSmall && courtIsSmall) continue;
      }

      const catTeams = teams.filter(t => t.category === cat);
      let candidates = catTeams.filter(t => !isOccupied(busyTeams.get(t.name) || [], startTime, endTime, config.breakDuration));

      if (onlyLowGames) {
        candidates = candidates.filter(t => (teamGamesCount.get(t.name) || 0) < config.minGamesPerTeam);
      }

      if (candidates.length < 2) continue;

      // Select T1
      candidates.sort((a, b) => (teamGamesCount.get(a.name) || 0) - (teamGamesCount.get(b.name) || 0));
      const t1 = candidates[0];

      // Select T2: same category, also free
      let candT2 = catTeams.filter(t => t.name !== t1.name && !isOccupied(busyTeams.get(t.name) || [], startTime, endTime, config.breakDuration));
      if (candT2.length === 0) continue;

      candT2.sort((a, b) => {
        const cA = teamGamesCount.get(a.name) || 0;
        const cB = teamGamesCount.get(b.name) || 0;
        if (onlyLowGames) {
          const needA = cA < config.minGamesPerTeam;
          const needB = cB < config.minGamesPerTeam;
          if (needA && !needB) return -1;
          if (!needA && needB) return 1;
        }
        if (cA !== cB) return cA - cB;
        // Avoid immediate rematch
        const lastA = lastOpponent.get(t1.name) === a.name;
        const lastB = lastOpponent.get(t1.name) === b.name;
        if (lastA && !lastB) return 1;
        if (!lastA && lastB) return -1;
        return 0;
      });

      return { t1, t2: candT2[0], cat };
    }
    return null;
  };

  // Fine-grained filling: Iterate court by court and search for any available hole
  const courtsToFill = config.courtConfigs;
  for (const cc of courtsToFill) {
    let safety = 0;
    while (safety < 300) {
      safety++;
      const sortedBusy = (busyCourts.get(cc.id) || []).sort((a, b) => a.start - b.start);
      let foundMatchInGap = false;

      // Search every 5 minutes for a starting point
      let checkPos = baseTime.getTime();
      const matchLengthMs = config.gameDuration * 60000;
      const endLimit = finalEndTime.getTime() - matchLengthMs;

      while (checkPos <= endLimit) {
        // Skip general break
        if (checkPos >= generalBreakStart.getTime() && checkPos < generalBreakEnd.getTime()) {
          checkPos = generalBreakEnd.getTime();
          continue;
        }

        const potentialEnd = checkPos + matchLengthMs;
        
        // Double check general break overlap
        if (checkPos < generalBreakStart.getTime() && potentialEnd > generalBreakStart.getTime()) {
          checkPos = generalBreakEnd.getTime();
          continue;
        }

        // Is court available?
        if (!isOccupied(sortedBusy, checkPos, potentialEnd, config.breakDuration)) {
          // If available, check for teams
          // Pass 1: Min Games
          let result = getPossibleExtraMatch(checkPos, potentialEnd, cc.id, true);
          let isFillPhase = false;
          
          // Pass 2: Fill Phase (if enabled)
          if (!result && config.useFillPhase) {
            result = getPossibleExtraMatch(checkPos, potentialEnd, cc.id, false);
            isFillPhase = true;
          }

          if (result) {
            matches.push({
              id: `${isFillPhase ? 'FILL' : 'MIN'}-${result.cat.replace(/[^A-Z0-9]/gi, '')}-${matches.length + 1}`,
              category: result.cat,
              phase: isFillPhase ? 'Fase Relleno' : 'Min. Partidos',
              team1: result.t1.name,
              team2: result.t2.name,
              startTime: new Date(checkPos),
              endTime: new Date(potentialEnd),
              court: cc.id
            });

            addBusy(cc.id, result.t1.name, result.t2.name, checkPos, potentialEnd);
            teamGamesCount.set(result.t1.name, (teamGamesCount.get(result.t1.name) || 0) + 1);
            teamGamesCount.set(result.t2.name, (teamGamesCount.get(result.t2.name) || 0) + 1);
            lastOpponent.set(result.t1.name, result.t2.name);
            lastOpponent.set(result.t2.name, result.t1.name);
            
            foundMatchInGap = true;
            // Break from the checkPos loop to re-sort busy slots and find next gap for this court
            break;
          }
        }

        // Advance checkPos by 5 minutes to sweep the timeline
        checkPos += 5 * 60000;
      }

      if (!foundMatchInGap) break; // Move to next court
    }
  }

  return matches.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
