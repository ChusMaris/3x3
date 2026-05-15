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
  useFillPhase?: boolean; // Toggle for full calendar filling
  playoffThreshold: number; // Number of teams from which to start playoffs
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

function generateTournamentMatchups(teams: Team[], config: ScheduleConfig): Matchup[] {
  const categories = Array.from(new Set(teams.map(t => t.category)));
  const allMatchups: Matchup[] = [];

  categories.forEach(cat => {
    const catTeams = teams.filter(t => t.category === cat);
    const n = catTeams.length;
    
    if (n < 2) return;

    if (n === 2) {
      // 3 matches between them + Final
      for(let i=0; i < 3; i++) {
        const [t1, t2] = i % 2 === 0 ? [catTeams[0].name, catTeams[1].name] : [catTeams[1].name, catTeams[0].name];
        allMatchups.push({ 
          category: cat, 
          a: t1, 
          b: t2, 
          phase: i === 0 ? 'Ida' : i === 1 ? 'Vuelta' : 'Grupo (Extra)', 
          priority: 1 
        });
      }
      allMatchups.push({ category: cat, a: catTeams[0].name, b: catTeams[1].name, phase: 'Final', priority: 10 });
    }
    else if (n === 3) {
      // 3 teams: Ida/Vuelta = 4 games each
      for(let round=1; round<=2; round++) {
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            // Invert teams for vuelta
            const [t1, t2] = round === 1 ? [catTeams[i].name, catTeams[j].name] : [catTeams[j].name, catTeams[i].name];
            allMatchups.push({ 
              category: cat, 
              a: t1, 
              b: t2, 
              phase: round === 1 ? 'Grupo (Ida)' : 'Grupo (Vuelta)', 
              priority: round 
            });
          }
        }
      }
      allMatchups.push({ category: cat, a: '1º Clasificado', b: '2º Clasificado', phase: 'Final', priority: 10 });
    }
    else if (n < (config.playoffThreshold || 6)) {
      // Teams up to threshold: Single league.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const [t1, t2] = (i + j) % 2 === 0 ? [catTeams[i].name, catTeams[j].name] : [catTeams[j].name, catTeams[i].name];
          allMatchups.push({ category: cat, a: t1, b: t2, phase: 'Grupo', priority: 1 });
        }
      }
      allMatchups.push({ category: cat, a: '1º Clasificado', b: '2º Clasificado', phase: 'Final', priority: 10 });
    }
    else {
      // 7-8 teams: 2 groups (or less if threshold is lower)
      const groupA = catTeams.slice(0, Math.ceil(n/2));
      const groupB = catTeams.slice(Math.ceil(n/2));

      [groupA, groupB].forEach((group, gIdx) => {
        const prefix = gIdx === 0 ? 'A' : 'B';
        const gn = group.length;
        if (gn === 3) {
          // Ida/Vuelta
          for(let round=1; round<=2; round++) {
            for (let i = 0; i < gn; i++) {
              for (let j = i + 1; j < gn; j++) {
                const [t1, t2] = round === 1 ? [group[i].name, group[j].name] : [group[j].name, group[i].name];
                allMatchups.push({ 
                  category: cat, 
                  a: t1, 
                  b: t2, 
                  phase: round === 1 ? `Grupo ${prefix} (Ida)` : `Grupo ${prefix} (Vuelta)`, 
                  priority: round 
                });
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
      allMatchups.push({ category: cat, a: '1º Gr.B', b: '2º Gr.A', phase: 'Semifinal 2', priority: 5 });
      
      // Finals
      allMatchups.push({ category: cat, a: 'Ganador Semifinal 1', b: 'Ganador Semifinal 2', phase: 'Final', priority: 10 });
    }
  });

  return allMatchups;
}

export function generateSchedule(teams: Team[], config: ScheduleConfig, initialMatches?: Match[]): Match[] {
  if (!config.courtConfigs || config.courtConfigs.length === 0) {
    throw new Error("No hay pistas configuradas. Configura al menos una pista en la pestaña de Pistas.");
  }
  
  const allMatchups = generateTournamentMatchups(teams, config);
  
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

  const alignTo15 = (timeMs: number, direction: 'up' | 'down' = 'down') => {
    const date = new Date(timeMs);
    const mins = date.getMinutes();
    const alignedMins = direction === 'down' 
      ? Math.floor(mins / 15) * 15 
      : Math.ceil(mins / 15) * 15;
    date.setMinutes(alignedMins, 0, 0);
    return date.getTime();
  };

  let baseTime = new Date();
  baseTime.setHours(startH || 9, startM || 0, 0, 0);
  baseTime = new Date(alignTo15(baseTime.getTime(), 'up')); // Ensure start is aligned

  const finalEndTime = new Date(baseTime);
  finalEndTime.setHours(endH || 14, endM || 0, 0, 0);
  const alignedFinalEnd = alignTo15(finalEndTime.getTime(), 'down');
  finalEndTime.setTime(alignedFinalEnd);

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
  const categoryGroupFinishedAt = new Map<string, number>(); // Track when group stage ends for each category
  // To avoid immediate rematches in fill phase
  const lastOpponent = new Map<string, string>();

  // If initialMatches provided, populate the state from them
  if (initialMatches) {
    initialMatches.forEach(m => {
      const endT = alignTo15(m.endTime.getTime() + config.breakDuration * 60000, 'up');
      teamNextAvailable.set(m.team1, Math.max(teamNextAvailable.get(m.team1) || 0, endT));
      teamNextAvailable.set(m.team2, Math.max(teamNextAvailable.get(m.team2) || 0, endT));
      teamGamesCount.set(m.team1, (teamGamesCount.get(m.team1) || 0) + 1);
      teamGamesCount.set(m.team2, (teamGamesCount.get(m.team2) || 0) + 1);
      lastOpponent.set(m.team1, m.team2);
      lastOpponent.set(m.team2, m.team1);

      // If it's a group match, update the barrier
      const isPlayoff = m.phase.toLowerCase().includes('final') || m.phase.toLowerCase().includes('semi');
      if (!isPlayoff) {
        categoryGroupFinishedAt.set(m.category, Math.max(categoryGroupFinishedAt.get(m.category) || 0, m.endTime.getTime()));
      }
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

    // PASS 1: Playoff Phase (Priority >= 5)
    // We schedule these FIRST backwards from the end of the day to ensure they get the best slots.
    const playoffCategories = Array.from(new Set(teams.map(t => t.category)));
    const courtPlayoffNextEnd = new Map<number, number>();
    courts.forEach(c => courtPlayoffNextEnd.set(c.id, finalEndTime.getTime()));

    const categoryConstraint = new Map<string, number>();
    playoffCategories.forEach(cat => categoryConstraint.set(cat, finalEndTime.getTime()));

    const playoffPrios = priorities.filter(p => p >= 5).sort((a, b) => b - a); // 10 (Finals), then 5 (Semis)
    const tournamentStartTime = baseTime.getTime();

    for (const prio of playoffPrios) {
      let phaseMatchups = seededShuffle(pendingMatchups.filter(m => m.priority === prio), runSeed + prio);
      const tierMinStartForCategory = new Map<string, number>();
      
      let pSafety = 0;
      while (phaseMatchups.length > 0 && pSafety < 500) {
        pSafety++;
        let bestMatchIdx = -1;
        let bestCourtId = -1;
        let latestEndFound = -1;

        for (let i = 0; i < phaseMatchups.length; i++) {
          const m = phaseMatchups[i];
          const candidates = courts.filter(c => {
            const isCatAllowed = c.allowedCategories.length === 0 || c.allowedCategories.includes(m.category);
            if (!isCatAllowed) return false;
            // Rim type check
            if (c.allowedCategories.length === 0) {
              const catNeedsSmall = isSmallBasketCat(m.category);
              if (catNeedsSmall && !c.isSmallBasket) return false;
              if (!catNeedsSmall && c.isSmallBasket) return false;
            }
            return true;
          });

          if (candidates.length === 0) continue;

          for (const court of candidates) {
            const availableCourtEnd = courtPlayoffNextEnd.get(court.id) || 0;
            const catEndLimit = categoryConstraint.get(m.category) || 0;
            const availableEnd = Math.min(availableCourtEnd, catEndLimit);
            
            // The slot size is effectively 15 minutes as per user grid requirement
            const slotMs = 15 * 60000;
            const matchStart = availableEnd - slotMs;
            
            if (matchStart < tournamentStartTime) continue;

            const isTeamBusy = matches.some(em => {
               const emStart = em.startTime.getTime();
               const emEnd = em.endTime.getTime() + config.breakDuration * 60000;
               const thisStart = matchStart;
               const thisEnd = availableEnd + config.breakDuration * 60000;
               const overlap = (thisStart < emEnd && thisEnd > emStart);
               if (!overlap) return false;
               return (em.category === m.category) && (em.team1 === m.a || em.team1 === m.b || em.team2 === m.a || em.team2 === m.b);
            });

            if (isTeamBusy) continue;

            if (bestMatchIdx === -1 || availableEnd > latestEndFound) {
              bestMatchIdx = i;
              bestCourtId = court.id;
              latestEndFound = availableEnd;
            }
          }
        }

        if (bestMatchIdx !== -1) {
          const m = phaseMatchups.splice(bestMatchIdx, 1)[0];
          const slotEnd = latestEndFound;
          const slotStart = slotEnd - 15 * 60000;
          const matchStart = slotStart;
          const matchEnd = matchStart + (config.gameDuration * 60000);
          
          tierMinStartForCategory.set(m.category, Math.min(tierMinStartForCategory.get(m.category) || Infinity, matchStart));

          matches.push({
            id: `${m.category.replace(/[^A-Z0-9]/gi, '')}-${matches.length + 1}`,
            category: m.category, phase: m.phase,
            team1: m.a, team2: m.b,
            startTime: new Date(matchStart), endTime: new Date(matchEnd), court: bestCourtId
          });

          courtPlayoffNextEnd.set(bestCourtId, slotStart);
          
          const nextReadyTime = matchEnd + config.breakDuration * 60000;
          if (m.phase.startsWith('Semifinal')) {
            teamNextAvailable.set(`Ganador ${m.phase}`, nextReadyTime);
            teamNextAvailable.set(`Perdedor ${m.phase}`, nextReadyTime);
          }
        } else {
          break;
        }
      }

      tierMinStartForCategory.forEach((minStart, cat) => {
        const currentConstraint = categoryConstraint.get(cat) || Infinity;
        // Ensure the constraint is aligned to 15m downwards
        const alignedConstraint = alignTo15(minStart - 2 * 60000, 'down'); 
        categoryConstraint.set(cat, Math.min(currentConstraint, alignedConstraint));
      });
    }

    const isSlotOccupied = (courtId: number, start: number, end: number, buffer: number) => {
       return matches.some(m => m.court === courtId && (start < m.endTime.getTime() + buffer && end > m.startTime.getTime() - buffer));
    };

    // PASS 2: Group Phase (Priority < 5)
    // We schedule these forwards into the remaining gaps.
    for (const prio of priorities.filter(p => p < 5)) {
      let phaseMatchups = seededShuffle(pendingMatchups.filter(m => m.priority === prio), runSeed + prio);
      while (phaseMatchups.length > 0 && safetyCounter < MAX_ITERATIONS) {
        safetyCounter++;
        courts.sort((a, b) => a.nextAvailable - b.nextAvailable);
        let matchFound = false;
        
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
            const canStartRaw = Math.max(aFree, bFree, court.nextAvailable);
            const canStart = alignTo15(canStartRaw, 'up');
            const canEnd = canStart + config.gameDuration * 60000;
            
            if (canEnd > finalEndTime.getTime()) return false;
            
            // Intersection with break
            if (canStart < generalBreakStart.getTime() && canEnd > generalBreakStart.getTime()) return false;

            // Collision with already scheduled playoffs (using 15 min buffer)
            if (isSlotOccupied(court.id, canStart, canEnd, 5 * 60000)) return false;

            return true;
          });

          if (matchIndex !== -1) {
            const m = phaseMatchups.splice(matchIndex, 1)[0];
            const aFree = teamNextAvailable.get(m.a) || 0;
            const bFree = teamNextAvailable.get(m.b) || 0;
            const matchStartRaw = Math.max(aFree, bFree, court.nextAvailable);
            const matchStart = new Date(alignTo15(matchStartRaw, 'up'));
            const matchEnd = new Date(matchStart.getTime() + config.gameDuration * 60000);
            
            matches.push({
              id: `${m.category.replace(/[^A-Z0-9]/gi, '')}-${matches.length + 1}`,
              category: m.category, phase: m.phase,
              team1: m.a, team2: m.b,
              startTime: matchStart, endTime: matchEnd, court: court.id
            });

            const teamNextAvailableTime = alignTo15(matchStart.getTime() + 15 * 60000, 'up');
            court.nextAvailable = teamNextAvailableTime;
            teamNextAvailable.set(m.a, teamNextAvailableTime);
            teamNextAvailable.set(m.b, teamNextAvailableTime);
            teamGamesCount.set(m.a, (teamGamesCount.get(m.a) || 0) + 1);
            teamGamesCount.set(m.b, (teamGamesCount.get(m.b) || 0) + 1);
            matchFound = true;
            break;
          }
        }
        if (!matchFound && phaseMatchups.length > 0) {
          // Push court availability to the next possible "free" spot
          let minNext = Infinity;
          courts.forEach(c => { if(c.nextAvailable < minNext) minNext = c.nextAvailable; });
          courts.forEach(c => { if(c.nextAvailable === minNext) c.nextAvailable += 15 * 60000; });
        }
      }
    }

    const getBusyTeams = () => {
      const busy = new Map<string, {start: number, end: number}[]>();
      matches.forEach(m => {
        const slots1 = busy.get(m.team1) || []; slots1.push({start: m.startTime.getTime(), end: m.endTime.getTime()}); busy.set(m.team1, slots1);
        const slots2 = busy.get(m.team2) || []; slots2.push({start: m.startTime.getTime(), end: m.endTime.getTime()}); busy.set(m.team2, slots2);
      });
      return busy;
    };

    const getBusyCourts = () => {
      const busy = new Map<number, {start: number, end: number}[]>();
      matches.forEach(m => {
        const slots = busy.get(m.court) || []; slots.push({start: m.startTime.getTime(), end: m.endTime.getTime()}); busy.set(m.court, slots);
      });
      return busy;
    };

    const runFillerPass = (onlyLowGames: boolean) => {
      const catsInTeams = Array.from(new Set(teams.map(t => t.category)));
      for (const cc of config.courtConfigs) {
        let fSafety = 0;
        while (fSafety < 50) {
          fSafety++;
          const busyC = getBusyCourts().get(cc.id) || [];
          const busyT = getBusyTeams();
          let found = false;
          let checkPos = baseTime.getTime();
          const matchLen = config.gameDuration * 60000;
          
          while (checkPos <= finalEndTime.getTime() - matchLen) {
            if (checkPos >= generalBreakStart.getTime() && checkPos < generalBreakEnd.getTime()) { checkPos = generalBreakEnd.getTime(); continue; }
            const pEnd = checkPos + matchLen;
            if (checkPos < generalBreakStart.getTime() && pEnd > generalBreakStart.getTime()) { checkPos = generalBreakEnd.getTime(); continue; }

            const courtBusy = busyC.some(inv => checkPos < inv.end + 2 * 60000 && pEnd > inv.start - 2 * 60000);
            if (!courtBusy) {
              const categoriesSorted = seededShuffle([...catsInTeams], runSeed + checkPos);
              for (const cat of categoriesSorted) {
                const catNeedsSmall = isSmallBasketCat(cat);
                const courtIsSmall = cc.rimType === 'low';
                
                // Rim type MUST match for the category to play on this court
                if (catNeedsSmall !== courtIsSmall) continue;

                const isCatAssigned = cc.allowedCategories.length === 0 || cc.allowedCategories.includes(cat);
                
                // For "Extra Filler" (Fase Relleno), we respect assignments.
                // For "Min Games", we relax assignments and allow playing on any compatible court.
                if (!onlyLowGames && !isCatAssigned) continue;

                const catTeams = teams.filter(t => t.category === cat);
                let cand1 = catTeams.filter(t => {
                   const tBusy = (busyT.get(t.name) || []).some(inv => checkPos < inv.end + 2 * 60000 && pEnd > inv.start - 2 * 60000);
                   return !tBusy;
                });
                if (onlyLowGames) cand1 = cand1.filter(t => (teamGamesCount.get(t.name) || 0) < config.minGamesPerTeam);
                if (cand1.length < 1) continue;
                
                cand1.sort((a, b) => (teamGamesCount.get(a.name) || 0) - (teamGamesCount.get(b.name) || 0));
                const t1 = cand1[0];
                let cand2 = catTeams.filter(t => t.name !== t1.name && !((busyT.get(t.name) || []).some(inv => checkPos < inv.end + 2 * 60000 && pEnd > inv.start - 2 * 60000)));
                if (cand2.length === 0) continue;
                cand2.sort((a, b) => (teamGamesCount.get(a.name) || 0) - (teamGamesCount.get(b.name) || 0));
                const t2 = cand2[0];

                matches.push({
                  id: `${onlyLowGames ? 'MIN' : 'FILL'}-${cat.replace(/[^A-Z0-9]/gi, '')}-${matches.length + 1}`,
                  category: cat, phase: onlyLowGames ? 'Min. Partidos' : 'Fase Relleno',
                  team1: t1.name, team2: t2.name,
                  startTime: new Date(checkPos), endTime: new Date(pEnd), court: cc.id
                });
                teamGamesCount.set(t1.name, (teamGamesCount.get(t1.name) || 0) + 1);
                teamGamesCount.set(t2.name, (teamGamesCount.get(t2.name) || 0) + 1);
                found = true; break;
              }
            }
            if (found) break;
            checkPos += 15 * 60000;
          }
          if (!found) break;
        }
      }
    };

    runFillerPass(true); // Schedule Min Games

    // PASS 4: Extra Filler (Fase Relleno)
    if (config.useFillPhase) {
      runFillerPass(false);
    }
  }

  return matches.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
