'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  AlertCircle,
  Download,
  Upload,
  GripVertical,
  SortAsc,
  Save,
  StickyNote,
  ChevronDown
} from 'lucide-react';

// --- 型定義 ---
type Level = 'A/B/C' | 'A' | 'A/B' | 'B' | 'B/C' | 'C';

const LEVEL_MAP: Record<Level, string[]> = {
  'A/B/C': ['A', 'B', 'C'],
  'A': ['A'],
  'A/B': ['A', 'B'],
  'B': ['B'],
  'B/C': ['B', 'C'],
  'C': ['C']
};

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
  sortOrder: number;
  memo: string; 
}

// 型エラー解消のため courtLevel を必須または optional で明示
interface Match {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  courtLevel?: string; 
}

interface Court {
  id: number;
  match: Match | null;
}

interface MatchRecord {
  id: string;
  timestamp: string;
  courtId: number;
  players: string[];
  playerIds: number[];
  level?: string;
}

interface AppConfig {
  courtCount: number;
  levelStrict: boolean;
  zoomLevel: number;
  nameFontSizeModifier: number;
  bulkOnlyMode: boolean;
  orderFirstMatchByList: boolean;
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [displayMembers, setDisplayMembers] = useState<Member[]>([]);
  
  const [courts, setCourts] = useState<Court[]>([]);
  const [nextMatches, setNextMatches] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
    zoomLevel: 1.0,
    nameFontSizeModifier: 1.0,
    bulkOnlyMode: false,
    orderFirstMatchByList: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);
  const [showScheduleNotice, setShowScheduleNotice] = useState(false);
  const [hasUserConfirmedRegen, setHasUserConfirmedRegen] = useState(false);

  const prevMembersRef = useRef<Member[]>([]);
  const [lastFingerprint, setLastFingerprint] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // --- データの読み込みと保存 ---
  useEffect(() => {
    const versions = ['v19', 'v18', 'v17', 'v16', 'v15', 'v14', 'v13', 'v12', 'v11', 'v10', 'v9', 'v8'];
    let loadedData: any = null;
    for (const v of versions) {
      const saved = localStorage.getItem(`doubles-app-data-${v}`);
      if (saved) {
        try { 
          loadedData = JSON.parse(saved); 
          if (loadedData) break;
        } catch (e) {
          console.error("Parse error", e);
        }
      }
    }

    if (loadedData) {
      const safeMembers = (loadedData.members || []).map((m: any, idx: number) => ({
        ...m,
        fixedPairMemberId: m.fixedPairMemberId !== undefined ? m.fixedPairMemberId : null,
        level: (m.level as Level) || 'A/B/C',
        matchHistory: m.matchHistory || {},
        pairHistory: m.pairHistory || {},
        sortOrder: m.sortOrder !== undefined ? m.sortOrder : idx,
        memo: m.memo !== undefined ? m.memo : ''
      }));
      
      const sorted = [...safeMembers].sort((a, b) => a.sortOrder - b.sortOrder);
      setMembers(sorted);
      setDisplayMembers(sorted);
      setCourts(loadedData.courts || Array.from({ length: loadedData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
      setNextMatches(loadedData.nextMatches || Array.from({ length: loadedData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
      setConfig(prev => ({ 
        ...prev, 
        ...(loadedData.config || {}),
        orderFirstMatchByList: loadedData.config?.orderFirstMatchByList ?? false 
      }));
      setNextMemberId(loadedData.nextMemberId || (safeMembers.length > 0 ? Math.max(...safeMembers.map((m: any) => m.id)) + 1 : 1));
      setMatchHistory(loadedData.matchHistory || []);
      prevMembersRef.current = JSON.parse(JSON.stringify(sorted));
    } else {
      const initialCount = 4;
      const initialCourts = Array.from({ length: initialCount }, (_, i) => ({ id: i + 1, match: null }));
      setCourts(initialCourts);
      setNextMatches(initialCourts);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      const data = { members, courts, nextMatches, matchHistory, config, nextMemberId };
      localStorage.setItem('doubles-app-data-v19', JSON.stringify(data));
    } catch (e) {
      console.error("Save error", e);
    }
  }, [members, courts, nextMatches, matchHistory, config, nextMemberId, isInitialized]);

  useEffect(() => {
    if (activeTab !== 'members') {
      const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
      setDisplayMembers(sorted);
    }
  }, [members, activeTab]);

  // --- 共通ロジック ---
  const checkChangeConfirmation = (updatedMembers?: Member[], updatedConfig?: AppConfig) => {
    if (!config.bulkOnlyMode) return true;
    if (hasUserConfirmedRegen) return true;
    if (isRegenRequired(updatedMembers || members, updatedConfig || config)) {
      const ok = confirm('次回の予定が組み直しになりますが、よろしいですか？');
      if (ok) { setHasUserConfirmedRegen(true); return true; }
      return false;
    }
    return true;
  };

  const isRegenRequired = (currentMembers: Member[], currentConfig: AppConfig) => {
    const plannedIds = new Set<number>();
    nextMatches.forEach(c => {
      if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id));
    });
    const configPart = `_C${currentConfig.courtCount}_S${currentConfig.levelStrict}_B${currentConfig.bulkOnlyMode}_F${currentConfig.orderFirstMatchByList}`;
    if (lastFingerprint !== '' && !lastFingerprint.endsWith(configPart)) return true;
    const currentMemberIds = new Set(currentMembers.map(m => m.id));
    if (Array.from(plannedIds).some(id => !currentMemberIds.has(id))) return true;
    
    return currentMembers.some(m => {
      const prev = prevMembersRef.current.find(p => p.id === m.id);
      if (!prev) return true;
      if (prev.fixedPairMemberId !== m.fixedPairMemberId) return true;
      if (plannedIds.has(m.id) && prev.isActive !== m.isActive && !m.isActive) return true;
      if (!plannedIds.has(m.id) && prev.isActive !== m.isActive && m.isActive) return true;
      if (currentConfig.levelStrict && plannedIds.has(m.id) && prev.level !== m.level) return true;
      return false;
    });
  };

  const syncMemberUpdate = (updatedList: Member[]) => {
    setDisplayMembers(updatedList);
    setMembers(prev => prev.map(m => {
      const updated = updatedList.find(u => u.id === m.id);
      return updated ? { ...updated, sortOrder: m.sortOrder } : m;
    }));
  };

  const handleLevelUpdate = (id: number, newLevel: Level) => {
    const nextDisplay = displayMembers.map(m => m.id === id ? { ...m, level: newLevel } : m);
    if (!checkChangeConfirmation(nextDisplay)) return;
    syncMemberUpdate(nextDisplay);
  };

  const sortByName = () => setDisplayMembers([...displayMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
  const sortByMemo = () => setDisplayMembers([...displayMembers].sort((a, b) => a.memo.localeCompare(b.memo)));
  const resetToSavedOrder = () => setDisplayMembers([...members].sort((a, b) => a.sortOrder - b.sortOrder));
  const saveCurrentOrder = () => { setMembers(displayMembers.map((m, idx) => ({ ...m, sortOrder: idx }))); alert('並び順を保存しました'); };

  const onDragStart = (idx: number) => setDraggedIndex(idx);
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === idx) return;
    const newList = [...displayMembers];
    const [movedItem] = newList.splice(draggedIndex, 1);
    newList.splice(idx, 0, movedItem);
    setDraggedIndex(idx);
    setDisplayMembers(newList);
  };
  const onDragEnd = () => setDraggedIndex(null);

  // --- マッチングアルゴリズム ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]): Match | null => {
    const playingIds = new Set<number>();
    (currentCourts || []).forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    let candidates = (currentMembers || []).filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    if (config.orderFirstMatchByList) {
      const firstTimers = candidates.filter(m => m.playCount === 0).sort((a, b) => a.sortOrder - b.sortOrder);
      if (firstTimers.length >= 4) {
        const p = firstTimers.slice(0, 4);
        return { p1: p[0].id, p2: p[1].id, p3: p[2].id, p4: p[3].id };
      }
    }

    const minPlayCount = Math.min(...candidates.map(m => m.playCount));
    const minLastTime = Math.min(...candidates.map(m => m.lastPlayedTime));

    const pickMember = (currentSelection: Member[], step: 'W' | 'X' | 'Y' | 'Z', targetLevel?: string): Member | null => {
      let remaining = candidates.filter(m => !currentSelection.find(s => s.id === m.id));
      if (config.levelStrict && targetLevel) {
        remaining = remaining.filter(m => LEVEL_MAP[m.level].includes(targetLevel));
      }
      if (remaining.length === 0) return null;
      
      const w = currentSelection[0], x = currentSelection[1], y = currentSelection[2];
      const score = (m: Member): number[] => {
        const s: number[] = [];
        if (step === 'W') { s.push(m.playCount, m.lastPlayedTime); }
        else if (step === 'X') {
          const wFixed = candidates.find(c => c.id === w.fixedPairMemberId);
          s.push(wFixed && m.id === w.fixedPairMemberId ? 0 : 1);
          s.push(m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId) ? 1 : 0);
          s.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          s.push((w.pairHistory?.[m.id] || 0), (w.matchHistory?.[m.id] || 0));
        } else if (step === 'Y') {
          s.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          s.push((w.pairHistory?.[m.id] || 0) + (w.matchHistory?.[m.id] || 0));
          s.push((x.pairHistory?.[m.id] || 0) + (x.matchHistory?.[m.id] || 0));
        } else if (step === 'Z') {
          const yFixed = candidates.find(c => c.id === y.fixedPairMemberId);
          s.push(yFixed && m.id === y.fixedPairMemberId ? 0 : 1);
          s.push(m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId) ? 1 : 0);
          s.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          s.push((y.pairHistory?.[m.id] || 0), (y.matchHistory?.[m.id] || 0));
          s.push((w.pairHistory?.[m.id] || 0) + (w.matchHistory?.[m.id] || 0), (x.pairHistory?.[m.id] || 0) + (x.matchHistory?.[m.id] || 0));
        }
        return s;
      };

      const sorted = remaining.sort((a, b) => {
        const sA = score(a), sB = score(b);
        for (let i = 0; i < sA.length; i++) if (sA[i] !== sB[i]) return sA[i] - sB[i];
        return 0;
      });
      
      const topScore = score(sorted[0]);
      const topCandidates = sorted.filter(m => score(m).every((v, i) => v === topScore[i]));
      return topCandidates[Math.floor(Math.random() * topCandidates.length)];
    };

    const attemptMatch = (targetL?: string): Match | null => {
      const s: Member[] = [];
      const W = pickMember(s, 'W', targetL); if (!W) return null; s.push(W);
      const X = pickMember(s, 'X', targetL); if (!X) return null; s.push(X);
      const Y = pickMember(s, 'Y', targetL); if (!Y) return null; s.push(Y);
      const Z = pickMember(s, 'Z', targetL); if (!Z) return null; s.push(Z);
      return { p1: s[0].id, p2: s[1].id, p3: s[2].id, p4: s[3].id, courtLevel: targetL };
    };

    if (config.levelStrict) {
      const results = (['A', 'B', 'C'] as const)
        .map(l => attemptMatch(l))
        .filter((r): r is Match => r !== null);
      return results.length > 0 ? results[Math.floor(Math.random() * results.length)] : null;
    }

    return attemptMatch();
  };

  // --- 状態更新ロジック ---
  const memberFingerprint = useMemo(() => {
    try {
      const plannedIds = new Set<number>();
      nextMatches.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id)); });
      const status = (members || []).map(m => {
        let s = `${m.id}-${m.fixedPairMemberId || 'none'}`;
        if (plannedIds.has(m.id)) { s += `-${m.isActive}`; if (config.levelStrict) s += `-${m.level}`; }
        else { s += `-${m.isActive === true ? 'active' : 'inactive'}`; }
        return s;
      }).sort().join('|');
      return `${status}_C${config.courtCount}_S${config.levelStrict}_B${config.bulkOnlyMode}_F${config.orderFirstMatchByList}`;
    } catch (e) { return ''; }
  }, [members, config.courtCount, config.levelStrict, config.bulkOnlyMode, config.orderFirstMatchByList, nextMatches]);

  useEffect(() => {
    if (isInitialized && activeTab === 'dashboard' && config.bulkOnlyMode) {
      if (lastFingerprint !== memberFingerprint && memberFingerprint !== '') {
        if (isRegenRequired(members, config)) {
          regeneratePlannedMatches();
          setHasUserConfirmedRegen(false);
          if (lastFingerprint !== '') { setShowScheduleNotice(true); setTimeout(() => setShowScheduleNotice(false), 3000); }
        }
        setLastFingerprint(memberFingerprint);
        prevMembersRef.current = JSON.parse(JSON.stringify(members));
      }
    }
  }, [activeTab, isInitialized, memberFingerprint, config.bulkOnlyMode, config.levelStrict, config.courtCount, config.orderFirstMatchByList]);

  const regeneratePlannedMatches = (targetMembers?: Member[]) => {
    let tempMembers = JSON.parse(JSON.stringify(targetMembers || members)) as Member[];
    let planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const match = getMatchForCourt(planned, tempMembers);
      if (match) {
        planned.push({ id: i + 1, match });
        const ids = [match.p1, match.p2, match.p3, match.p4];
        tempMembers = tempMembers.map(m => ids.includes(m.id) ? { ...m, playCount: m.playCount + 1, lastPlayedTime: Date.now() } : m);
      } else { planned.push({ id: i + 1, match: null }); }
    }
    setNextMatches(planned);
  };

  const calculateNextMemberState = (currentMembers: Member[], p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const playerIds = [p1, p2, p3, p4];
    const updated = currentMembers.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const newMatchH = { ...(m.matchHistory || {}) };
      const newPairH = { ...(m.pairHistory || {}) };
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
    const avgPlays = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((sum, m) => sum + m.playCount, 0) / activeMembers.length) : 0;
    return updated.map(m => {
      if (!m.isActive && m.playCount < avgPlays) {
        const diff = avgPlays - m.playCount;
        return { ...m, playCount: avgPlays, imputedPlayCount: (m.imputedPlayCount || 0) + diff };
      }
      return m;
    });
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
          if (c?.match) {
            const ids = [c.match.p1, c.match.p2, c.match.p3, c.match.p4];
            const names = ids.map(id => currentMembersState.find(m => m.id === id)?.name || '?');
            newHistoryEntries.push({ id: Date.now().toString() + c.id, timestamp, courtId: c.id, players: names, playerIds: ids, level: c.match.courtLevel });
            currentMembersState = calculateNextMemberState(currentMembersState, c.match.p1, c.match.p2, c.match.p3, c.match.p4);
          }
        });
        setMatchHistory(prev => [...newHistoryEntries, ...prev]);
        setMembers(currentMembersState);
        setCourts(matchesToApply);
        setHasUserConfirmedRegen(false);
        regeneratePlannedMatches(currentMembersState);
        prevMembersRef.current = JSON.parse(JSON.stringify(currentMembersState));
      }, 200);
    } else {
      setCourts(prev => prev.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        setCourts(prev => {
          let current = [...prev], temp = JSON.parse(JSON.stringify(members));
          for (let i = 0; i < current.length; i++) {
            const m = getMatchForCourt(current, temp);
            if (m) {
              const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => temp.find((x: any) => x.id === id)?.name || '?');
              setMatchHistory(prevH => [{ id: Date.now().toString() + current[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.courtLevel }, ...prevH]);
              current[i] = { ...current[i], match: m };
              temp = temp.map((x: any) => ids.includes(x.id) ? { ...x, playCount: x.playCount + 1, lastPlayedTime: Date.now() } : x);
              setMembers(prevM => calculateNextMemberState(prevM, m.p1, m.p2, m.p3, m.p4));
            }
          }
          return current;
        });
      }, 200);
    }
  };

  // --- UI Components ---
  const getDynamicFontSize = (name: string = '', mod: number = 1.0) => {
    if (!name) return '1rem';
    const len = name.split('').reduce((acc, char) => acc + (/[\x20-\x7E]/.test(char) ? 0.6 : 1.0), 0);
    let base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const h = 140 * config.zoomLevel;
    const border = isPlanned ? 'border-gray-500' : 'border-slate-900';
    const bg = isPlanned ? 'bg-gray-100' : 'bg-white';
    
    return (
      <div className={`relative rounded-xl shadow-md border overflow-hidden flex border-l-8 ${border} ${bg} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80 border-orange-200 bg-orange-50/50' : ''}`} style={{ height: `${h}px`, minHeight: `${h}px` }}>
        <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-gray-200/50' : 'bg-slate-50'}`}>
          {!config.bulkOnlyMode && !isPlanned && court.match && (
            <button onClick={() => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match: null } : c))} className="absolute top-1 left-1 p-1 text-red-500 hover:bg-red-50 rounded-full transition-colors z-10"><X size={16} strokeWidth={3} /></button>
          )}
          <span className={`font-black text-2xl ${isPlanned ? 'text-gray-500' : 'text-slate-900'}`}>{court.id}</span>
          {court.match?.courtLevel && <span className={`mt-1 px-1 py-0.5 rounded text-[8px] font-bold text-white ${court.match.courtLevel === 'A' ? 'bg-blue-600' : court.match.courtLevel === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.courtLevel}</span>}
        </div>
        <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden">
          {court.match ? (
            <div className="flex items-center gap-2 h-full">
              <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                {[1, 2].map(pIdx => (
                  <div key={pIdx} className={`rounded-lg flex flex-col justify-center items-stretch border px-3 overflow-hidden ${pIdx === 1 ? 'bg-blue-50/30 border-blue-100' : 'bg-red-50/30 border-red-100'}`}>
                    {[pIdx === 1 ? 'p1' : 'p3', pIdx === 1 ? 'p2' : 'p4'].map((pKey, i) => (
                      <div key={pKey} className="h-1/2 flex items-center">
                        <div className={`w-full leading-tight font-black whitespace-nowrap overflow-hidden text-ellipsis ${isPlanned ? 'text-gray-600' : 'text-black'} ${i === 1 ? 'text-right' : 'text-left'}`} style={{ fontSize: getDynamicFontSize(members.find(m => m.id === (court.match as any)?.[pKey])?.name, config.nameFontSizeModifier * 0.9) }}>{members.find(m => m.id === (court.match as any)?.[pKey])?.name}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !isPlanned && !config.bulkOnlyMode ? (
              <button onClick={() => {
                const match = getMatchForCourt(courts, members);
                if (!match) return alert('待機メンバーが足りません');
                const ids = [match.p1, match.p2, match.p3, match.p4], names = ids.map(id => members.find(m => m.id === id)?.name || '?');
                setMatchHistory(prev => [{ id: Date.now().toString() + court.id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: court.id, players: names, playerIds: ids, level: match.courtLevel }, ...prev]);
                setMembers(prev => calculateNextMemberState(prev, match.p1, match.p2, match.p3, match.p4));
                setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match } : c));
              }} className="w-full h-full border-2 border-dashed border-gray-300 text-gray-400 font-black text-xl rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors italic"><Play size={20} fill="currentColor" /> 割当</button>
            ) : <div className="text-gray-300 font-bold text-center italic">No Match</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900 pb-24 font-sans overflow-x-hidden">
      <header className="bg-blue-900 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> D.M.</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-1"><button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, p.zoomLevel - 0.1) }))} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.min(2.0, p.zoomLevel + 0.1) }))} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2"><button onClick={() => setConfig(p => ({ ...p, nameFontSizeModifier: Math.max(0.5, p.nameFontSizeModifier - 0.1) }))} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><div className="px-0.5 text-white/50"><Type size={14} /></div><button onClick={() => setConfig(p => ({ ...p, nameFontSizeModifier: Math.min(2.0, p.nameFontSizeModifier + 0.1) }))} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
              <button onClick={handleBulkAction} className="bg-orange-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-lg border border-orange-400">一括更新</button>
            </>
          )}
        </div>
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {showScheduleNotice && <div className="bg-orange-100 border border-orange-200 text-orange-800 px-4 py-2 rounded-lg flex items-center gap-2 animate-bounce"><AlertCircle size={18} /> <span className="text-sm font-bold">状況に合わせて予定を更新しました</span></div>}
            <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4">
              {config.bulkOnlyMode && <h2 className="col-span-full font-black text-xl text-slate-900 border-l-8 border-slate-900 pl-3">現在の対戦</h2>}
              {courts.map(court => <CourtCard key={court.id} court={court} />)}
            </section>
            {config.bulkOnlyMode && (
              <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4 mt-8 pb-8">
                <h2 className="col-span-full font-black text-xl text-gray-600 border-l-8 border-gray-500 pl-3">次回の予定</h2>
                {nextMatches.map(court => <CourtCard key={court.id} court={court} isPlanned={true} />)}
              </section>
            )}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2">
              <h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2>
              <button onClick={() => {
                const avgPlay = members.length > 0 ? Math.floor(members.reduce((s, m) => s + m.playCount, 0) / members.length) : 0;
                const newMember: Member = { id: nextMemberId, name: `${nextMemberId}`, level: 'A/B/C', isActive: true, playCount: avgPlay, imputedPlayCount: avgPlay, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: null, sortOrder: members.length, memo: `${String(new Date().getFullYear()).slice(-2)}${String(new Date().getMonth() + 1).padStart(2, '0')}` };
                if (!checkChangeConfirmation([...members, newMember])) return;
                setMembers([...members, newMember]);
                setDisplayMembers([...displayMembers, newMember]);
                setNextMemberId(prev => prev + 1);
              }} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
            </div>

            <div className="flex justify-between items-center px-2 pb-2">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <button onClick={resetToSavedOrder} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm active:bg-gray-50"><RotateCcw size={14}/> 保存した順</button>
                <button onClick={sortByName} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm active:bg-gray-50"><SortAsc size={14}/> 名前順</button>
                <button onClick={sortByMemo} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm active:bg-gray-50"><StickyNote size={14}/> メモ順</button>
              </div>
              <button onClick={saveCurrentOrder} className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 border border-blue-500 rounded-full text-xs font-bold text-white shadow-md active:bg-blue-700 transition-colors ml-4"><Save size={14}/> 順序を保存</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {displayMembers.map((m, idx) => (
                <div key={m.id} draggable={true} onDragStart={() => onDragStart(idx)} onDragOver={(e) => onDragOver(e, idx)} onDragEnd={onDragEnd} className={`p-4 flex items-center gap-2 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''} ${draggedIndex === idx ? 'opacity-20 bg-blue-100' : ''}`}>
                  <div className="p-2 cursor-grab active:cursor-grabbing text-gray-300"><GripVertical size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input value={m.name} onChange={e => syncMemberUpdate(displayMembers.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="flex-1 font-bold text-xl bg-transparent outline-none focus:text-blue-600 min-w-0" />
                      <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-200 shrink-0">
                        <StickyNote size={12} className="text-gray-400" />
                        <input value={m.memo} maxLength={12} onChange={e => syncMemberUpdate(displayMembers.map(x => x.id === m.id ? { ...x, memo: e.target.value } : x))} className="w-16 text-xs font-bold bg-transparent outline-none text-gray-600" placeholder="メモ" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <div className="relative">
                        <select 
                          value={m.level} 
                          onChange={(e) => handleLevelUpdate(m.id, e.target.value as Level)}
                          className={`appearance-none text-xs font-bold rounded-md px-3 py-1 pr-7 text-white cursor-pointer outline-none ${m.level.includes('A') && !m.level.includes('B') ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : m.level.includes('C') && !m.level.includes('B') ? 'bg-red-500' : 'bg-slate-500'}`}
                        >
                          <option value="A/B/C">レベルA/B/C</option>
                          <option value="A">レベルA</option>
                          <option value="A/B">レベルA/B</option>
                          <option value="B">レベルB</option>
                          <option value="B/C">レベルB/C</option>
                          <option value="C">レベルC</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1.5 text-white pointer-events-none" />
                      </div>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{displayMembers.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => { const next = displayMembers.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x); if (checkChangeConfirmation(next)) syncMemberUpdate(next); }} className={`px-4 py-2 rounded-xl font-bold border-2 shrink-0 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => { if(confirm(`${m.name}を削除してよろしいですか？`)) { const next = displayMembers.filter(x => x.id !== m.id); if (checkChangeConfirmation(next)) { setDisplayMembers(next); setMembers(prev => prev.filter(x => x.id !== m.id)); } } }} className="text-gray-200 hover:text-red-500 px-2 shrink-0"><Trash2 size={24} /></button>
                </div>
              ))}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-[calc(100%-2rem)] max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択</h3><button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button></div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button onClick={() => {
                        const mid = editingPairMemberId;
                        const next = displayMembers.map(m => {
                          if (m.id === mid) return { ...m, fixedPairMemberId: null };
                          if (m.fixedPairMemberId === mid) return { ...m, fixedPairMemberId: null };
                          return m;
                        });
                        if (checkChangeConfirmation(next)) syncMemberUpdate(next);
                        setEditingPairMemberId(null);
                      }} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペアを解消</button>
                      {displayMembers.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && m.level === displayMembers.find(x => x.id === editingPairMemberId)?.level)
                        .map(candidate => <button key={candidate.id} onClick={() => {
                          const mid = editingPairMemberId, pid = candidate.id;
                          const next = displayMembers.map(m => {
                            if (m.id === mid) return { ...m, fixedPairMemberId: pid };
                            if (m.id === pid) return { ...m, fixedPairMemberId: mid };
                            if (m.fixedPairMemberId === mid && m.id !== pid) return { ...m, fixedPairMemberId: null };
                            if (m.fixedPairMemberId === pid && m.id !== mid) return { ...m, fixedPairMemberId: null };
                            return m;
                          });
                          if (checkChangeConfirmation(next)) syncMemberUpdate(next);
                          setEditingPairMemberId(null);
                        }} className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b flex items-center gap-2 ${displayMembers.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} className="text-gray-400" />{candidate.name}</button>)}
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
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => {
                const count = parseInt(e.target.value);
                if (!checkChangeConfirmation(undefined, { ...config, courtCount: count })) return;
                setConfig(p => ({ ...p, courtCount: count }));
                const adjust = (prev: Court[]) => count > prev.length ? [...prev, ...Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }))] : prev.slice(0, count);
                setCourts(prev => adjust(prev)); setNextMatches(prev => adjust(prev));
              }} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" style={{ WebkitAppearance: 'none' }} />
            </div>
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <span className="block text-sm font-bold text-gray-400 uppercase tracking-widest">名簿データの管理</span>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => {
                  const backup = members.map(m => ({ id: m.id, name: m.name, level: m.level, fixedPairMemberId: m.fixedPairMemberId, sortOrder: m.sortOrder, memo: m.memo }));
                  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `DMaker_Members_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
                }} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:bg-indigo-700 transition-colors"><Download size={18} /> 退避(保存)</button>
                <button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-indigo-50 transition-colors"><Upload size={18} /> 復元(読込)</button>
                <input type="file" ref={fileInputRef} onChange={(e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const data = JSON.parse(event.target?.result as string);
                      if (!Array.isArray(data) || !confirm('名簿を復元します。現在の試合データと履歴はリセットされますが、よろしいですか？')) return;
                      const newMembers: Member[] = data.map((m, idx) => ({ ...m, isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, sortOrder: m.sortOrder !== undefined ? m.sortOrder : idx }));
                      setMembers(newMembers); setMatchHistory([]); setCourts(prev => prev.map(c => ({ ...c, match: null }))); setNextMatches(prev => prev.map(c => ({ ...c, match: null }))); setNextMemberId(newMembers.length > 0 ? Math.max(...newMembers.map(m => m.id)) + 1 : 1); setHasUserConfirmedRegen(false);
                      alert('名簿を復元しました。');
                    } catch (err) { alert('復元に失敗しました。'); }
                  };
                  reader.readAsText(file);
                }} accept=".json" className="hidden" />
              </div>
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">1巡目の試合は名簿順</span><span className="text-xs text-gray-400 leading-tight">未出場の人が4人以上いる場合、名簿の上位から（制約無視で）割り当てます</span></div>
              <button onClick={() => { const next = { ...config, orderFirstMatchByList: !config.orderFirstMatchByList }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.orderFirstMatchByList ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.orderFirstMatchByList ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><span className="text-xs text-gray-400 leading-tight">共通のレベル(A/B/C)を持つ人しか同じコートに入りません</span></div>
              <button onClick={() => { const next = { ...config, levelStrict: !config.levelStrict }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">一括進行モード</span><span className="text-xs text-gray-400 leading-tight">一括更新のみ可能となり、次回の予定が表示されます</span></div>
              <button onClick={() => setConfig(prev => ({ ...prev, bulkOnlyMode: !prev.bulkOnlyMode }))} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.bulkOnlyMode ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.bulkOnlyMode ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="space-y-4">
              <button onClick={() => {
                if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。現在コートの試合もクリアされます。')) {
                  const cleared = members.map(m => ({ ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {} }));
                  setMembers(cleared); setMatchHistory([]); setCourts(prev => prev.map(c => ({ ...c, match: null }))); setHasUserConfirmedRegen(false);
                  if (config.bulkOnlyMode) regeneratePlannedMatches(cleared); else setNextMatches(prev => prev.map(c => ({ ...c, match: null })));
                }
              }} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border active:bg-gray-100 transition-colors"><RotateCcw size={20} /> 試合数と履歴をリセット</button>
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
      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }` }} />
    </div>
  );
}
