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
  Save
} from 'lucide-react';

// --- 型定義 ---
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
  sortOrder: number;
}

interface Match {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  level?: Level;
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

  // --- データの読み込み ---
  useEffect(() => {
    const saved = localStorage.getItem(`doubles-app-data-v17`);
    if (saved) {
      try { 
        const loadedData = JSON.parse(saved);
        const safeMembers = (loadedData.members || []).map((m: any, idx: number) => ({
          ...m,
          fixedPairMemberId: m.fixedPairMemberId !== undefined ? m.fixedPairMemberId : null,
          level: m.level || 'A',
          matchHistory: m.matchHistory || {},
          pairHistory: m.pairHistory || {},
          sortOrder: m.sortOrder !== undefined ? m.sortOrder : idx 
        }));
        
        const sorted = [...safeMembers].sort((a, b) => a.sortOrder - b.sortOrder);
        setMembers(sorted);
        setDisplayMembers(sorted);
        setCourts(loadedData.courts || Array.from({ length: loadedData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
        setNextMatches(loadedData.nextMatches || Array.from({ length: loadedData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
        setConfig(prev => ({ ...prev, ...(loadedData.config || {}) }));
        setNextMemberId(loadedData.nextMemberId || (safeMembers.length > 0 ? Math.max(...safeMembers.map((m: any) => m.id)) + 1 : 1));
        setMatchHistory(loadedData.matchHistory || []);
        prevMembersRef.current = JSON.parse(JSON.stringify(sorted));
      } catch (e) {
        console.error("Load error", e);
      }
    } else {
      setCourts(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
      setNextMatches(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
    }
    setIsInitialized(true);
  }, []);

  // --- データの保存 ---
  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, nextMatches, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v17', JSON.stringify(data));
  }, [members, courts, nextMatches, matchHistory, config, nextMemberId, isInitialized]);

  // --- メンバー更新の統合管理（ここが整理のポイント） ---
  const syncUpdates = (newDisplayList: Member[], skipRegenCheck = false) => {
    setDisplayMembers(newDisplayList);
    // マスターデータ(members)は常に displayMembers の現在の中身で更新。
    // sortOrder は members 側が持っている値を ID 基準で紐付けて維持。
    setMembers(prev => prev.map(m => {
      const updated = newDisplayList.find(u => u.id === m.id);
      return updated ? { ...updated, sortOrder: m.sortOrder } : m;
    }));
  };

  // --- 並べ替え関連 ---
  const sortByName = () => {
    const sorted = [...displayMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    setDisplayMembers(sorted);
  };

  const resetToSavedOrder = () => {
    const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
    setDisplayMembers(sorted);
  };

  const saveCurrentOrder = () => {
    const updatedWithOrder = displayMembers.map((m, idx) => ({ ...m, sortOrder: idx }));
    setMembers(updatedWithOrder); // これでマスターの sortOrder が書き換わる
    alert('並び順を保存しました');
  };

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

  // --- フィンガープリント（再計算検知用） ---
  const memberFingerprint = useMemo(() => {
    try {
      const plannedIds = new Set<number>();
      nextMatches.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id)); });
      // 並び順(sortOrder)は含めず、属性の変化のみを監視
      const status = members.map(m => {
        let s = `${m.id}-${m.fixedPairMemberId || 'n'}`;
        if (plannedIds.has(m.id)) {
          s += `-${m.isActive}-${m.level}`;
        } else {
          s += `-${m.isActive ? 'a' : 'i'}`;
        }
        return s;
      }).sort().join('|');
      return `${status}_C${config.courtCount}_S${config.levelStrict}_B${config.bulkOnlyMode}`;
    } catch (e) { return ''; }
  }, [members, config.courtCount, config.levelStrict, config.bulkOnlyMode, nextMatches]);

  const isRegenRequired = (currentMembers: Member[], currentConfig: AppConfig) => {
    const plannedIds = new Set<number>();
    nextMatches.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id)); });
    
    if (lastFingerprint !== '' && !lastFingerprint.endsWith(`_C${currentConfig.courtCount}_S${currentConfig.levelStrict}_B${currentConfig.bulkOnlyMode}`)) return true;
    
    const currentIds = new Set(currentMembers.map(m => m.id));
    if (Array.from(plannedIds).some(id => !currentIds.has(id))) return true;

    return currentMembers.some(m => {
      const prev = prevMembersRef.current.find(p => p.id === m.id);
      if (!prev) return true;
      if (prev.fixedPairMemberId !== m.fixedPairMemberId) return true;
      if (plannedIds.has(m.id)) {
        if (prev.isActive !== m.isActive && !m.isActive) return true; // 予定者が休みになった
        if (currentConfig.levelStrict && prev.level !== m.level) return true;
      } else if (prev.isActive !== m.isActive && m.isActive) {
        return true; // 休みだった人が参加になった（組み直したほうが公平）
      }
      return false;
    });
  };

  const checkChangeConfirmation = (updatedMembers?: Member[], updatedConfig?: AppConfig) => {
    if (!config.bulkOnlyMode || hasUserConfirmedRegen) return true;
    if (isRegenRequired(updatedMembers || members, updatedConfig || config)) {
      if (confirm('次回の予定が組み直しになりますが、よろしいですか？')) {
        setHasUserConfirmedRegen(true);
        return true;
      }
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (isInitialized && activeTab === 'dashboard' && config.bulkOnlyMode) {
      if (lastFingerprint !== memberFingerprint && memberFingerprint !== '') {
        if (isRegenRequired(members, config)) {
          regeneratePlannedMatches();
          setHasUserConfirmedRegen(false);
          if (lastFingerprint !== '') {
            setShowScheduleNotice(true);
            setTimeout(() => setShowScheduleNotice(false), 3000);
          }
        }
        setLastFingerprint(memberFingerprint);
        prevMembersRef.current = JSON.parse(JSON.stringify(members));
      }
    }
  }, [activeTab, isInitialized, memberFingerprint]);

  // --- 操作ロジック ---
  const addMember = () => {
    const activeOnes = members.filter(m => m.isActive);
    const avg = activeOnes.length > 0 ? Math.floor(activeOnes.reduce((s, m) => s + m.playCount, 0) / activeOnes.length) : 0;
    const newM: Member = { 
      id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, 
      playCount: avg, imputedPlayCount: avg, lastPlayedTime: 0, 
      matchHistory: {}, pairHistory: {}, fixedPairMemberId: null,
      sortOrder: members.length
    };
    if (!checkChangeConfirmation([...members, newM])) return;
    setMembers(prev => [...prev, newM]);
    setDisplayMembers(prev => [...prev, newM]);
    setNextMemberId(id => id + 1);
  };

  const updateFixedPair = (mId: number, pId: number | null) => {
    const nextList = displayMembers.map(m => {
      let nm = { ...m };
      if (m.id === mId) nm.fixedPairMemberId = pId;
      if (pId && m.id === pId) nm.fixedPairMemberId = mId;
      if (m.fixedPairMemberId === mId && m.id !== pId) nm.fixedPairMemberId = null;
      const oldPId = members.find(x => x.id === mId)?.fixedPairMemberId;
      if (oldPId && m.id === oldPId && m.id !== pId) nm.fixedPairMemberId = null;
      return nm;
    });
    if (!checkChangeConfirmation(nextList)) return;
    syncUpdates(nextList);
    setEditingPairMemberId(null);
  };

  const handleLevelChange = (id: number) => {
    const levels: Level[] = ['A', 'B', 'C'];
    const target = displayMembers.find(m => m.id === id);
    if (!target) return;
    const nextL = levels[(levels.indexOf(target.level) + 1) % 3];
    const nextList = displayMembers.map(m => (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) ? { ...m, level: nextL } : m);
    if (!checkChangeConfirmation(nextList)) return;
    syncUpdates(nextList);
  };

  const calculateNextMemberState = (current: Member[], p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const ids = [p1, p2, p3, p4];
    const updated = current.map(m => {
      if (!ids.includes(m.id)) return m;
      const matchH = { ...(m.matchHistory || {}) }, pairH = { ...(m.pairHistory || {}) };
      let partner = 0, opps: number[] = [];
      if (m.id === p1) { partner = p2; opps = [p3, p4]; }
      else if (m.id === p2) { partner = p1; opps = [p3, p4]; }
      else if (m.id === p3) { partner = p4; opps = [p1, p2]; }
      else if (m.id === p4) { partner = p3; opps = [p1, p2]; }
      pairH[partner] = (pairH[partner] || 0) + 1;
      opps.forEach(o => matchH[o] = (matchH[o] || 0) + 1);
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: matchH, pairHistory: pairH };
    });
    const actives = updated.filter(m => m.isActive);
    const avg = actives.length > 0 ? Math.floor(actives.reduce((s, m) => s + m.playCount, 0) / actives.length) : 0;
    return updated.map(m => (!m.isActive && m.playCount < avg) ? { ...m, playCount: avg, imputedPlayCount: (m.imputedPlayCount || 0) + (avg - m.playCount) } : m);
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playing = new Set<number>();
    currentCourts.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playing.add(id)); });
    let candidates = currentMembers.filter(m => m.isActive && !playing.has(m.id));
    if (candidates.length < 4) return null;
    if (config.levelStrict) {
      const counts: Record<string, number> = { 'A': 0, 'B': 0, 'C': 0 };
      candidates.forEach(m => counts[m.level]++);
      candidates = candidates.filter(m => counts[m.level] >= 4);
    }
    if (candidates.length < 4) return null;

    const minP = Math.min(...candidates.map(m => m.playCount)), minT = Math.min(...candidates.map(m => m.lastPlayedTime));
    const pick = (sel: Member[], step: string): Member | null => {
      const rem = candidates.filter(m => !sel.find(s => s.id === m.id));
      const score = (m: Member) => {
        let c: number[] = [];
        if (step === 'W') c = [m.playCount, m.lastPlayedTime];
        else if (step === 'X') {
          c.push(sel[0].fixedPairMemberId === m.id ? 0 : 1, m.fixedPairMemberId && candidates.some(x => x.id === m.fixedPairMemberId) ? 1 : 0);
          if (config.levelStrict) c.push(m.level === sel[0].level ? 0 : 1);
          c.push((m.playCount === minP || m.lastPlayedTime === minT) ? 0 : 1, sel[0].pairHistory?.[m.id] || 0, sel[0].matchHistory?.[m.id] || 0);
        } else if (step === 'Y') {
          if (config.levelStrict) c.push(m.level === sel[0].level ? 0 : 1);
          c.push((m.playCount === minP || m.lastPlayedTime === minT) ? 0 : 1, (sel[0].pairHistory?.[m.id] || 0) + (sel[0].matchHistory?.[m.id] || 0), (sel[1].pairHistory?.[m.id] || 0) + (sel[1].matchHistory?.[m.id] || 0));
        } else if (step === 'Z') {
          c.push(sel[2].fixedPairMemberId === m.id ? 0 : 1, m.fixedPairMemberId && candidates.some(x => x.id === m.fixedPairMemberId) ? 1 : 0);
          if (config.levelStrict) c.push(m.level === sel[0].level ? 0 : 1);
          c.push((m.playCount === minP || m.lastPlayedTime === minT) ? 0 : 1, sel[2].pairHistory?.[m.id] || 0, sel[2].matchHistory?.[m.id] || 0);
        }
        return c;
      };
      const sorted = rem.sort((a, b) => { const sA = score(a), sB = score(b); for (let i = 0; i < sA.length; i++) if (sA[i] !== sB[i]) return sA[i] - sB[i]; return 0; });
      const top = score(sorted[0]), filtered = sorted.filter(m => score(m).every((v, i) => v === top[i]));
      return filtered[Math.floor(Math.random() * filtered.length)];
    };

    const patterns: Member[][] = [];
    for (let i = 0; i < 4; i++) {
      const s: Member[] = [];
      ['W','X','Y','Z'].forEach(st => { const p = pick(s, st); if (p) s.push(p); });
      if (s.length === 4) patterns.push(s);
    }
    if (patterns.length === 0) return null;
    const best = patterns.reduce((a, b) => {
      const cost = (p: Member[]) => [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].reduce((s, [i,j]) => s + ((p[i].fixedPairMemberId === p[j].id) ? 0 : (p[i].pairHistory?.[p[j].id] || 0) + (p[i].matchHistory?.[p[j].id] || 0)), 0);
      return cost(b) < cost(a) ? b : a;
    });
    return { p1: best[0].id, p2: best[1].id, p3: best[2].id, p4: best[3].id, level: config.levelStrict ? best[0].level : undefined };
  };

  const regeneratePlannedMatches = (mList?: Member[]) => {
    let tmp = JSON.parse(JSON.stringify(mList || members));
    let planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const m = getMatchForCourt(planned, tmp);
      if (m) {
        planned.push({ id: i + 1, match: m });
        const ids = [m.p1, m.p2, m.p3, m.p4];
        tmp = tmp.map((x: any) => ids.includes(x.id) ? { ...x, playCount: x.playCount + 1, lastPlayedTime: Date.now() } : x);
      } else planned.push({ id: i + 1, match: null });
    }
    setNextMatches(planned);
  };

  const handleBulkAction = () => {
    if (config.bulkOnlyMode) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const toApply = [...nextMatches];
      setCourts(prev => prev.map(c => ({ ...c, match: null })));
      setNextMatches(prev => prev.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        let curM = [...members], curH: MatchRecord[] = [];
        toApply.forEach(c => {
          if (c.match) {
            const ids = [c.match.p1, c.match.p2, c.match.p3, c.match.p4], names = ids.map(id => curM.find(m => m.id === id)?.name || '?');
            curH.push({ id: Date.now() + c.id + '', timestamp: time, courtId: c.id, players: names, playerIds: ids, level: c.match.level });
            curM = calculateNextMemberState(curM, c.match.p1, c.match.p2, c.match.p3, c.match.p4);
          }
        });
        setMatchHistory(prev => [...curH, ...prev]);
        setMembers(curM);
        setCourts(toApply);
        setHasUserConfirmedRegen(false);
        regeneratePlannedMatches(curM);
      }, 200);
    } else {
      setCourts(prev => prev.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        setCourts(prev => {
          let cur = [...prev], tmp = JSON.parse(JSON.stringify(members));
          for (let i = 0; i < cur.length; i++) {
            const m = getMatchForCourt(cur, tmp);
            if (m) {
              const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => tmp.find((x: any) => x.id === id)?.name || '?');
              setMatchHistory(h => [{ id: Date.now() + i + '', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: cur[i].id, players: names, playerIds: ids, level: m.level }, ...h]);
              cur[i] = { ...cur[i], match: m };
              tmp = calculateNextMemberState(tmp, m.p1, m.p2, m.p3, m.p4);
            }
          }
          setMembers(tmp);
          return cur;
        });
      }, 200);
    }
  };

  const generateNextMatch = (cId: number) => {
    const m = getMatchForCourt(courts, members);
    if (!m) return alert('待機メンバー不足');
    const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => members.find(x => x.id === id)?.name || '?');
    setMatchHistory(h => [{ id: Date.now() + '', timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: cId, players: names, playerIds: ids, level: m.level }, ...h]);
    setMembers(prev => calculateNextMemberState(prev, m.p1, m.p2, m.p3, m.p4));
    setCourts(prev => prev.map(c => c.id === cId ? { ...c, match: m } : c));
  };

  // --- UI部品 ---
  const getFontSize = (n = '', mod = 1) => {
    const len = n.split('').reduce((a, c) => a + (/[\x20-\x7E]/.test(c) ? 0.6 : 1), 0);
    const base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const h = (config.bulkOnlyMode ? 140 : 180) * config.zoomLevel;
    return (
      <div className={`relative rounded-xl shadow-md border overflow-hidden flex ${config.bulkOnlyMode ? `border-l-8 ${isPlanned?'border-gray-400 bg-gray-50':'border-slate-900 bg-white'}` : 'flex-col border-gray-300 bg-white'} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80 border-orange-200 bg-orange-50/50' : ''}`} style={{ height: h, minHeight: h }}>
        {config.bulkOnlyMode ? (
          <>
            <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-gray-100/50' : 'bg-slate-50'}`}>
              <span className={`font-black text-2xl ${isPlanned?'text-gray-400':'text-slate-900'}`}>{court.id}</span>
              {court.match?.level && <span className={`mt-1 px-1 py-0.5 rounded text-[8px] font-bold text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}
            </div>
            <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden">
              {court.match ? (
                <div className="grid grid-cols-2 gap-2 h-full">
                  {[1, 2].map(pIdx => (
                    <div key={pIdx} className={`rounded-lg flex flex-col justify-center px-3 border ${pIdx === 1 ? 'bg-blue-50/30 border-blue-100' : 'bg-red-50/30 border-red-100'}`}>
                      {[pIdx === 1 ? 'p1' : 'p3', pIdx === 1 ? 'p2' : 'p4'].map((pKey, i) => (
                        <div key={pKey} className={`h-1/2 flex items-center font-black whitespace-nowrap overflow-hidden text-ellipsis ${pIdx===1?'text-blue-900':'text-red-900'} ${i===1?'text-right justify-end':'text-left'}`} style={{ fontSize: getFontSize(members.find(m => m.id === (court.match as any)?.[pKey])?.name, config.nameFontSizeModifier * 0.9) }}>
                          {members.find(m => m.id === (court.match as any)?.[pKey])?.name}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : <div className="text-gray-300 font-bold text-center italic">No Match</div>}
            </div>
          </>
        ) : (
          <>
            <div className={`px-4 py-1.5 border-b flex justify-between items-center shrink-0 ${isPlanned ? 'bg-orange-50 border-orange-100' : 'bg-gray-100 border-gray-300'}`}>
              <span className={`font-black text-sm uppercase ${isPlanned ? 'text-orange-600' : 'text-gray-600'}`}>COURT {court.id} {isPlanned && '(予定)'}</span>
              {!isPlanned && court.match && <button onClick={() => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match: null } : c))} className="bg-gray-900 text-white px-4 py-1 rounded-md text-xs font-black">終了</button>}
            </div>
            <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden bg-gray-50/50">
              {court.match ? (
                <div className="grid grid-cols-2 gap-3 h-full">
                  {[1, 2].map(pIdx => (
                    <div key={pIdx} className={`rounded-lg flex flex-col justify-center px-3 border-2 shadow-sm ${pIdx === 1 ? 'bg-blue-50/80 border-blue-200' : 'bg-red-50/80 border-red-200'}`}>
                      {[pIdx === 1 ? 'p1' : 'p3', pIdx === 1 ? 'p2' : 'p4'].map((pKey, i) => (
                        <div key={pKey} className={`h-1/2 flex items-center font-black whitespace-nowrap overflow-hidden text-ellipsis ${pIdx===1?'text-blue-900':'text-red-900'} ${i===1?'text-right justify-end':'text-left'}`} style={{ fontSize: getFontSize(members.find(m => m.id === (court.match as any)?.[pKey])?.name, config.nameFontSizeModifier) }}>
                          {members.find(m => m.id === (court.match as any)?.[pKey])?.name}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : !isPlanned && <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-4 border-dashed border-gray-400 text-gray-500 font-black text-2xl rounded-xl flex items-center justify-center gap-3"><Play size={32} fill="currentColor" /> 割当</button>}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900 pb-24 overflow-x-hidden">
      <header className="bg-blue-900 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> D.M.</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5"><button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, p.zoomLevel - 0.1) }))} className="p-1.5"><ZoomOut size={16}/></button><button onClick={() => setConfig(p => ({ ...p, zoomLevel: Math.min(2, p.zoomLevel + 0.1) }))} className="p-1.5"><ZoomIn size={16}/></button></div>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2"><button onClick={() => setConfig(p => ({ ...p, nameFontSizeModifier: Math.max(0.5, p.nameFontSizeModifier - 0.1) }))} className="p-1.5"><ZoomOut size={16}/></button><div className="px-0.5 text-white/50"><Type size={14} /></div><button onClick={() => setConfig(p => ({ ...p, nameFontSizeModifier: Math.min(2, p.nameFontSizeModifier + 0.1) }))} className="p-1.5"><ZoomIn size={16}/></button></div>
              <button onClick={handleBulkAction} className="bg-orange-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-lg border border-orange-400">一括更新</button>
            </>
          )}
        </div>
      </header>

      <main className="p-2 max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {showScheduleNotice && <div className="bg-orange-100 border border-orange-200 text-orange-800 px-4 py-2 rounded-lg flex items-center gap-2 animate-bounce"><AlertCircle size={18} /> <span className="text-sm font-bold">状況に合わせて予定を更新しました</span></div>}
            <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4">{courts.map(c => <CourtCard key={c.id} court={c} />)}</section>
            {config.bulkOnlyMode && <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4 mt-8 pb-8"><h2 className="col-span-full font-black text-xl text-gray-500 border-l-8 border-gray-400 pl-3">次回の予定</h2>{nextMatches.map(c => <CourtCard key={c.id} court={c} isPlanned={true} />)}</section>}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2"><h2 className="font-bold text-xl text-gray-700">名簿 ({members.filter(m => m.isActive).length}/{members.length})</h2><button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button></div>
            <div className="flex justify-between items-center px-2 pb-2">
              <div className="flex gap-2"><button onClick={resetToSavedOrder} className="px-3 py-1.5 bg-white border rounded-full text-xs font-bold text-gray-600 shadow-sm"><RotateCcw size={14}/> 保存した順</button><button onClick={sortByName} className="px-3 py-1.5 bg-white border rounded-full text-xs font-bold text-gray-600 shadow-sm"><SortAsc size={14}/> 名前順</button></div>
              <button onClick={saveCurrentOrder} className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold shadow-md"><Save size={14}/> 順序を保存</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden">
              {displayMembers.map((m, idx) => (
                <div key={m.id} draggable onDragStart={() => onDragStart(idx)} onDragOver={e => onDragOver(e, idx)} onDragEnd={() => setDraggedIndex(null)} className={`p-4 flex items-center gap-2 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''} ${draggedIndex === idx ? 'opacity-20 bg-blue-100' : ''}`}>
                  <div className="p-2 cursor-grab text-gray-300"><GripVertical size={20} /></div>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => syncUpdates(displayMembers.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button onClick={() => handleLevelChange(m.id)} className={`text-xs font-bold rounded-md px-3 py-1 text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>レベル{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{members.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => { const nl = displayMembers.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x); if (checkChangeConfirmation(nl)) syncUpdates(nl); }} className={`px-4 py-2 rounded-xl font-bold border-2 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => { if(confirm(`${m.name}削除？`)) { const nl = displayMembers.filter(x => x.id !== m.id); if (checkChangeConfirmation(nl)) { setDisplayMembers(nl); setMembers(prev => prev.filter(x => x.id !== m.id)); } } }} className="text-gray-200 hover:text-red-500 px-2"><Trash2 size={24} /></button>
                </div>
              ))}
            </div>
            {editingPairMemberId && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="bg-gray-100 px-4 py-3 flex justify-between border-b"><h3 className="font-bold">ペア選択</h3><button onClick={() => setEditingPairMemberId(null)}><X size={20}/></button></div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペア解消</button>
                    {members.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && m.level === members.find(x => x.id === editingPairMemberId)?.level)
                      .map(c => <button key={c.id} onClick={() => updateFixedPair(editingPairMemberId, c.id)} className="w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b">{c.name}</button>)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left"><thead className="bg-gray-50 text-gray-400"><tr><th className="p-4 text-xs font-bold uppercase">時刻</th><th className="p-4 text-xs font-bold uppercase">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">{matchHistory.map(h => (
                <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td><td className="p-4 font-bold">{h.level && <span className={`mr-2 px-2 py-0.5 rounded text-[10px] text-white ${h.level === 'A' ? 'bg-blue-600' : 'bg-yellow-500'}`}>{h.level}</span>}{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-6 uppercase">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label>
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => { const nc = { ...config, courtCount: +e.target.value }; if (checkChangeConfirmation(undefined, nc)) { setConfig(nc); const adj = (p: Court[]) => { const c = +e.target.value; return c > p.length ? [...p, ...Array.from({ length: c - p.length }, (_, i) => ({ id: p.length + i + 1, match: null }))] : p.slice(0, c); }; setCourts(adj); setNextMatches(adj); } }} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
              <button onClick={() => { const json = JSON.stringify(members.map(m => ({ id: m.id, name: m.name, level: m.level, fixedPairMemberId: m.fixedPairMemberId, sortOrder: m.sortOrder })), null, 2); const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `DMaker_Backup.json`; a.click(); }} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"><Download size={18} /> 保存</button>
              <button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2"><Upload size={18} /> 復元</button>
              <input type="file" ref={fileInputRef} onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target?.result as string); if (confirm('復元しますか？')) { const nm = d.map((m: any, idx: number) => ({ ...m, isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, sortOrder: m.sortOrder ?? idx })); setMembers(nm); setDisplayMembers([...nm].sort((a,b)=>a.sortOrder-b.sortOrder)); setNextMemberId(nm.length > 0 ? Math.max(...nm.map((x:any)=>x.id)) + 1 : 1); setMatchHistory([]); setCourts(prev => prev.map(c => ({ ...c, match: null }))); setNextMatches(prev => prev.map(c => ({ ...c, match: null }))); } } catch(e) { alert('形式エラー'); } }; r.readAsText(f); }} accept=".json" className="hidden" />
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <div className="flex flex-col"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span></div>
              <button onClick={() => { const nc = { ...config, levelStrict: !config.levelStrict }; if (checkChangeConfirmation(undefined, nc)) setConfig(nc); }} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex flex-col"><span className="font-bold text-lg text-gray-700">一括進行モード</span></div>
              <button onClick={() => setConfig(p => ({ ...p, bulkOnlyMode: !p.bulkOnlyMode }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.bulkOnlyMode ? 'bg-orange-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${config.bulkOnlyMode ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <button onClick={() => { if (confirm('試合数/履歴をリセット？')) { const nm = members.map(m => ({ ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {} })); setMembers(nm); setMatchHistory([]); setCourts(prev => prev.map(c => ({ ...c, match: null }))); regeneratePlannedMatches(nm); } }} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold border flex items-center justify-center gap-3"><RotateCcw size={20} /> リセット</button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around pb-safe z-30 shadow-lg">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ]
          .map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === t.id ? 'text-blue-700 scale-110' : 'text-gray-400'}`}>
              <t.icon size={26} strokeWidth={activeTab === t.id ? 3 : 2} /><span className="text-[10px] font-black mt-1.5">{t.label}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}
