'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Settings, 
  History, 
  Play, 
  Plus, 
  Trash2, 
  Trophy,
  RotateCcw,
  Link as LinkIcon,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
  Type,
  AlertCircle
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number;
  lastPlayedTime: number;
  matchHistory: Record<number, number>;
  pairHistory: Record<number, number>;
  fixedPairMemberId: number | null;
}

interface Court {
  id: number;
  match: {
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    level?: Level;
  } | null;
}

interface MatchRecord {
  id: string;
  timestamp: string;
  courtId: number;
  players: string[];
  playerIds: number[];
  level?: Level;
}

interface AppConfig {
  courtCount: number;
  levelStrict: boolean;
  zoomLevel: number;
  nameFontSizeModifier: number;
  bulkOnlyMode: boolean;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [nextMatches, setNextMatches] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
    zoomLevel: 1.0,
    nameFontSizeModifier: 1.0,
    bulkOnlyMode: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);
  const [showScheduleNotice, setShowScheduleNotice] = useState(false);

  const memberFingerprint = useMemo(() => {
    return `${members.map(m => `${m.id}-${m.isActive}-${m.level}-${m.fixedPairMemberId}`).join('|')}_C${config.courtCount}_B${config.bulkOnlyMode}`;
  }, [members, config.courtCount, config.bulkOnlyMode]);

  const [lastFingerprint, setLastFingerprint] = useState('');

  useEffect(() => {
    const versions = ['v16', 'v15', 'v14', 'v13', 'v12', 'v11', 'v10', 'v9', 'v8'];
    let loadedData = null;

    for (const v of versions) {
      const saved = localStorage.getItem(`doubles-app-data-${v}`);
      if (saved) {
        try {
          loadedData = JSON.parse(saved);
          break;
        } catch (e) {
          console.error(`Failed to parse data from ${v}`);
        }
      }
    }

    if (loadedData) {
      setMembers(loadedData.members || []);
      setCourts(loadedData.courts || []);
      setNextMatches(loadedData.nextMatches || []);
      setConfig(prev => ({ 
        ...prev, 
        ...(loadedData.config || {}),
        bulkOnlyMode: loadedData.config?.bulkOnlyMode ?? prev.bulkOnlyMode 
      }));
      setNextMemberId(loadedData.nextMemberId || 1);
      setMatchHistory(loadedData.matchHistory || []);
    } else {
      initializeCourts(4);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, nextMatches, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v16', JSON.stringify(data));
  }, [members, courts, nextMatches, matchHistory, config, nextMemberId, isInitialized]);

  useEffect(() => {
    if (isInitialized && activeTab === 'dashboard' && config.bulkOnlyMode) {
      if (lastFingerprint !== memberFingerprint) {
        regeneratePlannedMatches();
        setLastFingerprint(memberFingerprint);
        if (lastFingerprint !== '') {
          setShowScheduleNotice(true);
          setTimeout(() => setShowScheduleNotice(false), 3000);
        }
      }
    }
  }, [activeTab, isInitialized, memberFingerprint, config.bulkOnlyMode, lastFingerprint]);

  const initializeCourts = (count: number) => {
    const newCourts = Array.from({ length: count }, (_, i) => ({ id: i + 1, match: null }));
    setCourts(newCourts);
    setNextMatches(newCourts);
  };

  const handleCourtCountChange = (count: number) => {
    setConfig(prev => ({ ...prev, courtCount: count }));
    const adjust = (prev: Court[]) => {
      if (count > prev.length) {
        const added = Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }));
        return [...prev, ...added];
      }
      return prev.slice(0, count);
    };
    setCourts(prev => adjust(prev));
    setNextMatches(prev => adjust(prev));
  };

  const resetPlayCountsOnly = () => {
    if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。現在コートの試合もクリアされます。')) {
      const clearedMembers = members.map(m => ({ 
        ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, 
        matchHistory: {}, pairHistory: {} 
      }));
      setMembers(clearedMembers);
      setMatchHistory([]);
      const clearedCourts = courts.map(c => ({ ...c, match: null }));
      setCourts(clearedCourts);
      if (config.bulkOnlyMode) {
        regeneratePlannedMatches(clearedMembers);
      } else {
        setNextMatches(clearedCourts);
      }
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const newMember: Member = { 
      id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, 
      playCount: avgPlay, imputedPlayCount: avgPlay, lastPlayedTime: 0, 
      matchHistory: {}, pairHistory: {}, fixedPairMemberId: null
    };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    setMembers(prev => {
      let newMembers = [...prev];
      const target = newMembers.find(m => m.id === memberId);
      if (!target) return prev;
      if (target.fixedPairMemberId) {
        const oldPartner = newMembers.find(m => m.id === target.fixedPairMemberId);
        if (oldPartner) oldPartner.fixedPairMemberId = null;
      }
      if (partnerId) {
        const newPartner = newMembers.find(m => m.id === partnerId);
        if (newPartner && newPartner.fixedPairMemberId) {
          const partnersOldPartner = newMembers.find(m => m.id === newPartner.fixedPairMemberId);
          if (partnersOldPartner) partnersOldPartner.fixedPairMemberId = null;
        }
        if (newPartner) newPartner.fixedPairMemberId = memberId;
      }
      target.fixedPairMemberId = partnerId;
      return newMembers;
    });
    setEditingPairMemberId(null);
  };

  const handleLevelChange = (id: number) => {
    setMembers(prev => {
      const target = prev.find(m => m.id === id);
      if (!target) return prev;
      const levels: Level[] = ['A', 'B', 'C'];
      const newLevel = levels[(levels.indexOf(target.level) + 1) % 3];
      return prev.map(m => {
        if (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) {
          return { ...m, level: newLevel };
        }
        return m;
      });
    });
  };

  const calculateNextMemberState = (currentMembers: Member[], p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const playerIds = [p1, p2, p3, p4];
    const updated = currentMembers.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const newMatchH = { ...m.matchHistory };
      const newPairH = { ...m.pairHistory };
      let partnerId = 0, opponents: number[] = [];
      if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
      else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
      else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
      else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }
      newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
      opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newMatchH, pairHistory: newPairH };
    });
    const activeMembers = updated.filter(m => m.isActive);
    if (activeMembers.length === 0) return updated;
    const avgPlays = Math.floor(activeMembers.reduce((sum, m) => sum + m.playCount, 0) / activeMembers.length);
    return updated.map(m => {
      if (!m.isActive && m.playCount < avgPlays) {
        const diff = avgPlays - m.playCount;
        return { ...m, playCount: avgPlays, imputedPlayCount: m.imputedPlayCount + diff };
      }
      return m;
    });
  };

  const applyMatchToMembers = (p1: number, p2: number, p3: number, p4: number) => {
    setMembers(prev => calculateNextMemberState(prev, p1, p2, p3, p4));
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    let candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;
    if (config.levelStrict) {
      const counts: Record<string, number> = { 'A': 0, 'B': 0, 'C': 0 };
      candidates.forEach(m => counts[m.level]++);
      candidates = candidates.filter(m => counts[m.level] >= 4);
    }
    if (candidates.length < 4) return null;
    const minPlayCount = Math.min(...candidates.map(m => m.playCount));
    const minLastTime = Math.min(...candidates.map(m => m.lastPlayedTime));
    const pickMember = (currentSelection: Member[], step: 'W' | 'X' | 'Y' | 'Z'): Member | null => {
      const remaining = candidates.filter(m => !currentSelection.find(s => s.id === m.id));
      if (remaining.length === 0) return null;
      const w = currentSelection[0], x = currentSelection[1], y = currentSelection[2];
      const score = (m: Member): number[] => {
        const criteria: number[] = [];
        if (step === 'W') { criteria.push(m.playCount, m.lastPlayedTime); }
        else if (step === 'X') {
          const wFixed = candidates.find(c => c.id === w.fixedPairMemberId);
          criteria.push(wFixed && m.id === w.fixedPairMemberId ? 0 : 1);
          criteria.push(m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId) ? 1 : 0);
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          criteria.push(w.pairHistory[m.id] || 0, w.matchHistory[m.id] || 0);
        } else if (step === 'Y') {
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          criteria.push((w.pairHistory[m.id] || 0) + (w.matchHistory[m.id] || 0));
          criteria.push((x.pairHistory[m.id] || 0) + (x.matchHistory[m.id] || 0));
        } else if (step === 'Z') {
          const yFixed = candidates.find(c => c.id === y.fixedPairMemberId);
          criteria.push(yFixed && m.id === y.fixedPairMemberId ? 0 : 1);
          criteria.push(m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId) ? 1 : 0);
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          criteria.push(y.pairHistory[m.id] || 0, y.matchHistory[m.id] || 0);
          criteria.push((w.pairHistory[m.id] || 0) + (w.matchHistory[m.id] || 0), (x.pairHistory[m.id] || 0) + (x.matchHistory[m.id] || 0));
        }
        return criteria;
      };
      const sorted = remaining.sort((a, b) => {
        const sA = score(a), sB = score(b);
        for (let i = 0; i < sA.length; i++) { if (sA[i] !== sB[i]) return sA[i] - sB[i]; }
        return 0;
      });
      const topScore = score(sorted[0]);
      const topCandidates = sorted.filter(m => score(m).every((v, i) => v === topScore[i]));
      return topCandidates[Math.floor(Math.random() * topCandidates.length)];
    };
    const patterns: Member[][] = [];
    for (let i = 0; i < 4; i++) {
      const s: Member[] = [];
      const W = pickMember(s, 'W'); if (W) s.push(W); else continue;
      const X = pickMember(s, 'X'); if (X) s.push(X); else continue;
      const Y = pickMember(s, 'Y'); if (Y) s.push(Y); else continue;
      const Z = pickMember(s, 'Z'); if (Z) s.push(Z); else continue;
      if (s.length === 4) patterns.push(s);
    }
    if (patterns.length === 0) return null;
    const getPatternCost = (p: Member[]) => {
      let total = 0;
      [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]].forEach(([i, j]) => {
        if (!(p[i].fixedPairMemberId === p[j].id && candidates.some(c => c.id === p[i].id) && candidates.some(c => c.id === p[j].id))) {
          total += (p[i].pairHistory[p[j].id] || 0) + (p[i].matchHistory[p[j].id] || 0);
        }
      });
      return total;
    };
    const best = patterns.reduce((prev, curr) => getPatternCost(curr) < getPatternCost(prev) ? curr : prev);
    return { p1: best[0].id, p2: best[1].id, p3: best[2].id, p4: best[3].id, level: config.levelStrict ? best[0].level : undefined };
  };

  const regeneratePlannedMatches = (targetMembers?: Member[]) => {
    let tempMembers = JSON.parse(JSON.stringify(targetMembers || members)) as Member[];
    let planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const match = getMatchForCourt(planned, tempMembers);
      if (match) {
        planned.push({ id: i + 1, match });
        const ids = [match.p1, match.p2, match.p3, match.p4];
        tempMembers = tempMembers.map(m => ids.includes(m.id) ? { ...m, playCount: m.playCount + 1, lastPlayedTime: Date.now() } : m);
      } else {
        planned.push({ id: i + 1, match: null });
      }
    }
    setNextMatches(planned);
  };

  const handleBulkAction = () => {
    if (config.bulkOnlyMode) {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const matchesToApply = [...nextMatches];
      setCourts(prev => prev.map(c => ({ ...c, match: null })));
      setNextMatches(prev => prev.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        let currentMembersState = [...members];
        let newHistoryEntries: MatchRecord[] = [];
        matchesToApply.forEach(c => {
          if (c.match) {
            const ids = [c.match.p1, c.match.p2, c.match.p3, c.match.p4];
            const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
            newHistoryEntries.push({ id: Date.now().toString() + c.id, timestamp, courtId: c.id, players: names, playerIds: ids, level: c.match?.level });
            currentMembersState = calculateNextMemberState(currentMembersState, c.match.p1, c.match.p2, c.match.p3, c.match.p4);
          }
        });
        setMatchHistory(prev => [...newHistoryEntries, ...prev]);
        setMembers(currentMembersState);
        setCourts(matchesToApply);
        regeneratePlannedMatches(currentMembersState);
      }, 200);
    } else {
      setCourts(prev => prev.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        setCourts(prev => {
          let current = [...prev], temp = JSON.parse(JSON.stringify(members));
          for (let i = 0; i < current.length; i++) {
            const m = getMatchForCourt(current, temp);
            if (m) {
              const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => temp.find(x => x.id === id)?.name || '?');
              setMatchHistory(prevH => [{ id: Date.now().toString() + current[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.level }, ...prevH]);
              current[i] = { ...current[i], match: m };
              temp = temp.map(x => ids.includes(x.id) ? { ...x, playCount: x.playCount + 1, lastPlayedTime: Date.now() } : x);
              applyMatchToMembers(m.p1, m.p2, m.p3, m.p4);
            }
          }
          return current;
        });
      }, 200);
    }
  };

  const generateNextMatch = (courtId: number) => {
    if (config.bulkOnlyMode) return;
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません');
    const ids = [match.p1, match.p2, match.p3, match.p4], names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{ id: Date.now().toString() + courtId, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId, players: names, playerIds: ids, level: match.level }, ...prev]);
    applyMatchToMembers(match.p1, match.p2, match.p3, match.p4);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: null } : c));
  const changeZoom = (d: number) => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, Math.min(2.0, p.zoomLevel + d)) }));
  const changeNameFontSize = (d: number) => setConfig(p => ({ ...p, nameFontSizeModifier: Math.max(0.5, Math.min(2.0, p.nameFontSizeModifier + d)) }));

  const getDynamicFontSize = (name: string = '', mod: number = 1.0) => {
    const len = name.split('').reduce((acc, char) => acc + (/[\x20-\x7E]/.test(char) ? 0.6 : 1.0), 0);
    let base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const calculatedHeight = (config.bulkOnlyMode ? 140 : 180) * config.zoomLevel;
    const accentColor = isPlanned ? 'border-orange-500' : 'border-blue-700';
    const bgColor = isPlanned ? 'bg-orange-50/50' : 'bg-white';

    return (
      <div 
        className={`relative rounded-xl shadow-md border overflow-hidden flex ${config.bulkOnlyMode ? `border-l-8 ${accentColor}` : 'flex-col border-gray-300'} ${bgColor} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80 border-orange-200' : ''}`}
        style={{ height: `${calculatedHeight}px`, minHeight: `${calculatedHeight}px` }}
      >
        {config.bulkOnlyMode ? (
          /* 一括進行モード：サイドバー形式 */
          <>
            <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-orange-100/50' : 'bg-blue-50/50'}`}>
              <span className={`font-black text-2xl ${isPlanned ? 'text-orange-600' : 'text-blue-800'}`}>{court.id}</span>
              {court.match?.level && (
                <span className={`mt-1 px-1 py-0.5 rounded text-[8px] font-bold text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>
                  {court.match.level}
                </span>
              )}
            </div>
            <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden">
              {court.match ? (
                <div className="flex items-center gap-2 h-full">
                  <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                    {[1, 2].map(pIdx => (
                      <div key={pIdx} className={`rounded-lg flex flex-col justify-center items-stretch border px-3 overflow-hidden ${pIdx === 1 ? 'bg-blue-50/30 border-blue-100' : 'bg-red-50/30 border-red-100'}`}>
                        {[pIdx === 1 ? 'p1' : 'p3', pIdx === 1 ? 'p2' : 'p4'].map((pKey, i) => (
                          <div key={pKey} className="h-1/2 flex items-center">
                            <div className={`w-full leading-tight font-black whitespace-nowrap overflow-hidden text-ellipsis ${pIdx === 1 ? 'text-blue-900' : 'text-red-900'} ${i === 1 ? 'text-right' : 'text-left'}`} style={{ fontSize: getDynamicFontSize(members.find(m => m.id === (court.match as any)[pKey])?.name, config.nameFontSizeModifier * 0.9) }}>
                              {members.find(m => m.id === (court.match as any)[pKey])?.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-gray-300 font-bold text-center italic">No Match</div>
              )}
            </div>
          </>
        ) : (
          /* 通常モード：ヘッダー形式 */
          <>
            <div className={`px-4 py-1.5 border-b flex justify-between items-center shrink-0 ${isPlanned ? 'bg-orange-50 border-orange-100' : 'bg-gray-100 border-gray-300'}`}>
              <span className={`font-black text-sm uppercase tracking-tighter ${isPlanned ? 'text-orange-600' : 'text-gray-600'}`}>
                COURT {court.id} {isPlanned && '(予定)'} {court.match?.level && <span className={`ml-2 px-2 py-0.5 rounded text-[10px] text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}
              </span>
              {!isPlanned && court.match && (
                <button onClick={() => finishMatch(court.id)} className="bg-gray-900 text-white px-4 py-1 rounded-md font-black text-xs">終了</button>
              )}
            </div>
            <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden bg-gray-50/50">
              {court.match ? (
                <div className="flex items-center gap-2 h-full overflow-hidden">
                  <div className="flex-1 grid grid-cols-2 gap-3 h-full">
                    {[1, 2].map(pIdx => (
                      <div key={pIdx} className={`rounded-lg flex flex-col justify-center items-stretch border-2 px-3 overflow-hidden shadow-sm ${pIdx === 1 ? 'bg-blue-50/80 border-blue-200' : 'bg-red-50/80 border-red-200'}`}>
                        {[pIdx === 1 ? 'p1' : 'p3', pIdx === 1 ? 'p2' : 'p4'].map((pKey, i) => (
                          <div key={pKey} className="h-1/2 flex items-center">
                            <div className={`w-full leading-tight font-black whitespace-nowrap overflow-hidden text-ellipsis ${pIdx === 1 ? 'text-blue-900' : 'text-red-900'} ${i === 1 ? 'text-right' : 'text-left'}`} style={{ fontSize: getDynamicFontSize(members.find(m => m.id === (court.match as any)[pKey])?.name, config.nameFontSizeModifier) }}>
                              {members.find(m => m.id === (court.match as any)[pKey])?.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                !isPlanned && (
                  <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-4 border-dashed border-gray-400 text-gray-500 font-black text-2xl rounded-xl flex items-center justify-center gap-3"><Play size={32} fill="currentColor" /> 割当</button>
                )
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900 pb-24 font-sans overflow-x-hidden">
      <header className="bg-blue-900 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> D Maker</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-1">
                <button onClick={() => changeZoom(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button>
                <button onClick={() => changeZoom(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button>
              </div>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2">
                <button onClick={() => changeNameFontSize(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button>
                <div className="px-0.5 text-white/50"><Type size={14} /></div>
                <button onClick={() => changeNameFontSize(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button>
              </div>
              <button onClick={handleBulkAction} className="bg-orange-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-lg border border-orange-400">一括更新</button>
            </>
          )}
        </div>
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {showScheduleNotice && (
              <div className="bg-orange-100 border border-orange-200 text-orange-800 px-4 py-2 rounded-lg flex items-center gap-2 animate-bounce">
                <AlertCircle size={18} /> <span className="text-sm font-bold">状況に合わせて予定を更新しました</span>
              </div>
            )}
            <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4">
              {config.bulkOnlyMode && <h2 className="col-span-full font-black text-xl text-blue-900 border-l-8 border-blue-900 pl-3">現在の対戦</h2>}
              {courts.map(court => <CourtCard key={court.id} court={court} />)}
            </section>
            {config.bulkOnlyMode && (
              <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4 mt-8 pb-8">
                <h2 className="col-span-full font-black text-xl text-orange-700 border-l-8 border-orange-700 pl-3">次回の予定</h2>
                {nextMatches.map(court => <CourtCard key={court.id} court={court} isPlanned={true} />)}
              </section>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2">
              <h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button onClick={() => handleLevelChange(m.id)} className={`text-xs font-bold rounded-md px-3 py-1 text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>レベル{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>
                        {m.fixedPairMemberId ? <><LinkIcon size={12} />{members.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}
                      </button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 px-2"><Trash2 size={24} /></button>
                </div>
              ))}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択</h3><button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button></div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペアを解消</button>
                      {members.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && m.level === members.find(x => x.id === editingPairMemberId)?.level)
                        .map(candidate => (
                          <button key={candidate.id} onClick={() => updateFixedPair(editingPairMemberId, candidate.id)} className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} className="text-gray-400" />{candidate.name}</button>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-400"><tr><th className="p-4 text-xs font-bold uppercase">時刻</th><th className="p-4 text-xs font-bold uppercase">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td><td className="p-4 font-bold text-base">{h.level && <span className={`mr-2 px-2 py-0.5 rounded text-[10px] text-white ${h.level === 'A' ? 'bg-blue-600' : h.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{h.level}</span>}{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-[0.2em]">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label>
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <span className="font-bold text-lg text-gray-700">レベル厳格モード</span>
              <button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex flex-col">
                <span className="font-bold text-lg text-gray-700">一括進行モード</span>
                <span className="text-xs text-gray-400">次回の予定を表示し、一括で入れ替えます</span>
              </div>
              <button onClick={() => setConfig(prev => ({ ...prev, bulkOnlyMode: !prev.bulkOnlyMode }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.bulkOnlyMode ? 'bg-orange-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.bulkOnlyMode ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="space-y-4">
              <button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border active:bg-gray-100 transition-colors"><RotateCcw size={20} /> 試合数と履歴をリセット</button>
              <button onClick={() => {if(confirm('全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100 active:bg-red-100 transition-colors">データを完全消去</button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ]
          .map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === tab.id ? 'text-blue-700 scale-110' : 'text-gray-400'}`}>
              <tab.icon size={26} strokeWidth={activeTab === tab.id ? 3 : 2} /><span className="text-[10px] font-black mt-1.5">{tab.label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}
