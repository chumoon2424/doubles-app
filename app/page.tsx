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
  StickyNote
} from 'lucide-react';

// --- 型定義 ---
type MemberLevel = 'A/B/C' | 'A' | 'A/B' | 'B' | 'B/C' | 'C';
const LEVEL_OPTIONS: MemberLevel[] = ['A/B/C', 'A', 'A/B', 'B', 'B/C', 'C'];

interface Member {
  id: number;
  name: string;
  level: MemberLevel;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number;
  lastPlayedTime: number; 
  lastPlayedBlock: number; 
  matchHistory: Record<number, number>;
  pairHistory: Record<number, number>;
  fixedPairMemberId: number | null;
  sortOrder: number;
  memo: string; 
}

interface Match {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  level?: string;
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
    let loadedVersion = '';
    for (const v of versions) {
      const saved = localStorage.getItem(`doubles-app-data-${v}`);
      if (saved) {
        try { 
          loadedData = JSON.parse(saved); 
          if (loadedData) {
            loadedVersion = v;
            break;
          }
        } catch (e) { console.error("Parse error", e); }
      }
    }

    if (loadedData) {
      const safeMembers = (loadedData.members || []).map((m: any, idx: number) => {
        let newLevel = m.level;
        if (loadedVersion !== 'v19') {
          if (!LEVEL_OPTIONS.includes(m.level as any)) newLevel = 'A/B/C';
        }
        return {
          ...m,
          level: newLevel,
          fixedPairMemberId: m.fixedPairMemberId !== undefined ? m.fixedPairMemberId : null,
          matchHistory: m.matchHistory || {},
          pairHistory: m.pairHistory || {},
          sortOrder: m.sortOrder !== undefined ? m.sortOrder : idx,
          memo: m.memo !== undefined ? m.memo : '',
          lastPlayedBlock: m.lastPlayedBlock !== undefined ? m.lastPlayedBlock : 0
        };
      });
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
      const initialCourts = Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null }));
      setCourts(initialCourts);
      setNextMatches(initialCourts);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    localStorage.setItem('doubles-app-data-v19', JSON.stringify({ members, courts, nextMatches, matchHistory, config, nextMemberId }));
  }, [members, courts, nextMatches, matchHistory, config, nextMemberId, isInitialized]);

  useEffect(() => {
    if (activeTab !== 'members') {
      const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
      setDisplayMembers(sorted);
    }
  }, [members, activeTab]);

  // --- ヘルパー関数 ---
  const getBelongingLevels = (level: MemberLevel): ('A'|'B'|'C')[] => {
    if (level === 'A/B/C') return ['A', 'B', 'C'];
    if (level === 'A/B') return ['A', 'B'];
    if (level === 'B/C') return ['B', 'C'];
    return [level as 'A'|'B'|'C'];
  };

  const getCurrentBlockIndex = (hLength: number) => Math.floor(hLength / config.courtCount);

  const LevelBadge = ({ level, className = "" }: { level: MemberLevel, className?: string }) => {
    const segments = level.split('/');
    return (
      <div className={`flex h-6 rounded overflow-hidden border border-black/10 font-bold text-[10px] w-12 shrink-0 ${className}`}>
        {segments.map((s, i) => (
          <div key={i} className={`flex-1 flex items-center justify-center text-white ${s === 'A' ? 'bg-blue-600' : s === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>
            {s}
          </div>
        ))}
      </div>
    );
  };

  // --- 並べ替えロジック ---
  const sortByName = () => setDisplayMembers([...displayMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
  const sortByMemo = () => setDisplayMembers([...displayMembers].sort((a, b) => a.memo.localeCompare(b.memo)));
  const resetToSavedOrder = () => setDisplayMembers([...members].sort((a, b) => a.sortOrder - b.sortOrder));
  const saveCurrentOrder = () => {
    const updated = displayMembers.map((m, idx) => ({ ...m, sortOrder: idx }));
    setMembers(updated);
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
  const onDragEnd = () => setDraggedIndex(null);

  const syncMemberUpdate = (updatedList: Member[]) => {
    setDisplayMembers(updatedList);
    setMembers(prev => prev.map(m => {
      const updated = updatedList.find(u => u.id === m.id);
      return updated ? { ...updated, sortOrder: m.sortOrder } : m;
    }));
  };

  const memberFingerprint = useMemo(() => {
    const plannedIds = new Set<number>();
    nextMatches.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id)); });
    const status = members.map(m => `${m.id}-${m.fixedPairMemberId || 'n'}-${plannedIds.has(m.id) ? m.isActive : (m.isActive ? 'a' : 'i')}-${config.levelStrict ? m.level : ''}`).sort().join('|');
    return `${status}_C${config.courtCount}_S${config.levelStrict}_B${config.bulkOnlyMode}_F${config.orderFirstMatchByList}`;
  }, [members, config, nextMatches]);

  const isRegenRequired = (currentMembers: Member[], currentConfig: AppConfig) => {
    const plannedIds = new Set<number>();
    nextMatches.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id)); });
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

  const checkChangeConfirmation = (updatedMembers?: Member[], updatedConfig?: AppConfig) => {
    if (!config.bulkOnlyMode || hasUserConfirmedRegen) return true;
    if (isRegenRequired(updatedMembers || members, updatedConfig || config)) {
      if (confirm('次回の予定が組み直しになりますが、よろしいですか？')) { setHasUserConfirmedRegen(true); return true; }
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
          if (lastFingerprint !== '') { setShowScheduleNotice(true); setTimeout(() => setShowScheduleNotice(false), 3000); }
        }
        setLastFingerprint(memberFingerprint);
        prevMembersRef.current = JSON.parse(JSON.stringify(members));
      }
    }
  }, [activeTab, isInitialized, memberFingerprint, config]);

  const handleCourtCountChange = (count: number) => {
    const nextConfig = { ...config, courtCount: count };
    if (!checkChangeConfirmation(undefined, nextConfig)) return;
    setConfig(nextConfig);
    const adjust = (prev: Court[]) => count > prev.length ? [...prev, ...Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }))] : prev.slice(0, count);
    setCourts(prev => adjust(prev));
    setNextMatches(prev => adjust(prev));
  };

  const resetPlayCountsOnly = () => {
    if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。現在コートの試合もクリアされます。')) {
      const cleared = members.map(m => ({ ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, lastPlayedBlock: 0, matchHistory: {}, pairHistory: {} }));
      setMembers(cleared);
      setMatchHistory([]);
      const clearedCourts = courts.map(c => ({ ...c, match: null }));
      setCourts(clearedCourts);
      setHasUserConfirmedRegen(false); 
      if (config.bulkOnlyMode) regeneratePlannedMatches(cleared);
      else setNextMatches(clearedCourts);
    }
  };

  const exportMembers = () => {
    const data = JSON.stringify(members.map(m => ({ id: m.id, name: m.name, level: m.level, fixedPairMemberId: m.fixedPairMemberId, sortOrder: m.sortOrder, memo: m.memo })), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DMaker_Members_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importMembers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (!Array.isArray(data) || !confirm('名簿を復元します。現在の全ての試合データと履歴はリセットされますが、よろしいですか？')) return;
        const newMembers: Member[] = data.map((m, idx) => ({ ...m, name: m.name || '?', level: m.level || 'A/B/C', isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, lastPlayedBlock: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: m.fixedPairMemberId || null, sortOrder: m.sortOrder ?? idx, memo: m.memo ?? '' }));
        setMembers(newMembers);
        setMatchHistory([]);
        setCourts(courts.map(c => ({ ...c, match: null })));
        setNextMatches(courts.map(c => ({ ...c, match: null })));
        setNextMemberId(newMembers.length > 0 ? Math.max(...newMembers.map(m => m.id)) + 1 : 1);
        setHasUserConfirmedRegen(false);
        alert('名簿を復元しました。');
      } catch (err) { alert('復元に失敗しました。'); }
    };
    reader.readAsText(file);
  };

  const addMember = () => {
    const active = members.filter(m => m.isActive);
    const avg = active.length > 0 ? Math.floor(active.reduce((s, m) => s + m.playCount, 0) / active.length) : 0;
    const now = new Date();
    const newM: Member = { id: nextMemberId, name: `${nextMemberId}`, level: 'A/B/C', isActive: true, playCount: avg, imputedPlayCount: avg, lastPlayedTime: 0, lastPlayedBlock: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: null, sortOrder: members.length, memo: `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}` };
    if (checkChangeConfirmation([...members, newM])) { setMembers([...members, newM]); setDisplayMembers([...displayMembers, newM]); setNextMemberId(prev => prev + 1); }
  };

  const updateFixedPair = (mId: number, partnerId: number | null) => {
    const prev = JSON.parse(JSON.stringify(members));
    const next = displayMembers.map(m => {
      let nm = { ...m };
      if (m.id === mId) nm.fixedPairMemberId = partnerId;
      if (partnerId && m.id === partnerId) nm.fixedPairMemberId = mId;
      if (m.fixedPairMemberId === mId && m.id !== partnerId) nm.fixedPairMemberId = null;
      const old = prev.find((x: any) => x.id === mId);
      if (old?.fixedPairMemberId && m.id === old.fixedPairMemberId && m.id !== partnerId) nm.fixedPairMemberId = null;
      return nm;
    });
    if (checkChangeConfirmation(next)) { syncMemberUpdate(next); setEditingPairMemberId(null); }
  };

  // --- マッチングアルゴリズム ---
  const calculateNextMemberState = (current: Member[], p1: number, p2: number, p3: number, p4: number, hLen: number) => {
    const block = getCurrentBlockIndex(hLen);
    const playerIds = [p1, p2, p3, p4];
    const updated = current.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const nmh = { ...(m.matchHistory || {}) }, nph = { ...(m.pairHistory || {}) };
      let partner = 0, opponents: number[] = [];
      if (m.id === p1) { partner = p2; opponents = [p3, p4]; }
      else if (m.id === p2) { partner = p1; opponents = [p3, p4]; }
      else if (m.id === p3) { partner = p4; opponents = [p1, p2]; }
      else if (m.id === p4) { partner = p3; opponents = [p1, p2]; }
      nph[partner] = (nph[partner] || 0) + 1;
      opponents.forEach(oid => { nmh[oid] = (nmh[oid] || 0) + 1; });
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: Date.now(), lastPlayedBlock: block, matchHistory: nmh, pairHistory: nph };
    });
    const active = updated.filter(m => m.isActive);
    const avg = active.length > 0 ? Math.floor(active.reduce((s, m) => s + m.playCount, 0) / active.length) : 0;
    return updated.map(m => (!m.isActive && m.playCount < avg) ? { ...m, playCount: avg, imputedPlayCount: (m.imputedPlayCount || 0) + (avg - m.playCount) } : m);
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[], hLength: number) => {
    const playing = new Set<number>();
    currentCourts.forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playing.add(id)); });
    let candidates = currentMembers.filter(m => m.isActive && !playing.has(m.id));
    if (candidates.length < 4) return null;

    if (config.orderFirstMatchByList) {
      const ft = candidates.filter(m => m.playCount === 0).sort((a, b) => a.sortOrder - b.sortOrder);
      if (ft.length >= 4) return { p1: ft[0].id, p2: ft[1].id, p3: ft[2].id, p4: ft[3].id };
    }

    if (config.levelStrict) {
      const lc: Record<string, number> = { 'A': 0, 'B': 0, 'C': 0 };
      candidates.forEach(m => getBelongingLevels(m.level).forEach(l => lc[l]++));
      candidates = candidates.filter(m => getBelongingLevels(m.level).some(l => lc[l] >= 4));
    }
    if (candidates.length < 4) return null;

    const generatePattern = () => {
      const s: Member[] = [];
      let matchLevel: 'A' | 'B' | 'C' | null = null;

      // 1. W
      const wCand = [...candidates].sort((a, b) => (a.playCount - b.playCount) || (a.lastPlayedBlock - b.lastPlayedBlock) || (Math.random() - 0.5));
      const W = wCand[0];
      s.push(W);
      if (config.levelStrict) { const bl = getBelongingLevels(W.level); if (bl.length === 1) matchLevel = bl[0]; }

      // 2. X
      const X = candidates.filter(m => m.id !== W.id).sort((a, b) => {
        const af = a.fixedPairMemberId && candidates.some(c => c.id === a.fixedPairMemberId);
        const bf = b.fixedPairMemberId && candidates.some(c => c.id === b.fixedPairMemberId);
        if (af !== bf) return af ? 1 : -1;
        if (config.levelStrict) {
          if (matchLevel) {
            const ai = getBelongingLevels(a.level).includes(matchLevel) ? 0 : 1;
            const bi = getBelongingLevels(b.level).includes(matchLevel) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          } else {
            const wl = getBelongingLevels(W.level);
            const ai = getBelongingLevels(a.level).some(l => wl.includes(l)) ? 0 : 1;
            const bi = getBelongingLevels(b.level).some(l => wl.includes(l)) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          }
        }
        return (a.playCount - b.playCount) || (a.lastPlayedBlock - b.lastPlayedBlock) || ((W.pairHistory?.[a.id] || 0) - (W.pairHistory?.[b.id] || 0)) || ((W.matchHistory?.[a.id] || 0) - (W.matchHistory?.[b.id] || 0)) || (Math.random() - 0.5);
      })[0];
      s.push(X);
      if (config.levelStrict && !matchLevel) {
        const common = getBelongingLevels(W.level).filter(l => getBelongingLevels(X.level).includes(l));
        if (common.length === 1) matchLevel = common[0];
      }

      // 3. Y (3-1修正: WおよびXが所属するいずれかのレベル)
      const Y = candidates.filter(m => m.id !== W.id && m.id !== X.id).sort((a, b) => {
        if (config.levelStrict) {
          if (matchLevel) {
            const ai = getBelongingLevels(a.level).includes(matchLevel) ? 0 : 1;
            const bi = getBelongingLevels(b.level).includes(matchLevel) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          } else {
            const commonWX = getBelongingLevels(W.level).filter(l => getBelongingLevels(X.level).includes(l));
            const ai = getBelongingLevels(a.level).some(l => commonWX.includes(l)) ? 0 : 1;
            const bi = getBelongingLevels(b.level).some(l => commonWX.includes(l)) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          }
        }
        return (a.playCount - b.playCount) || (a.lastPlayedBlock - b.lastPlayedBlock) || (((W.pairHistory?.[a.id] || 0) + (W.matchHistory?.[a.id] || 0)) - ((W.pairHistory?.[b.id] || 0) + (W.matchHistory?.[b.id] || 0))) || (((X.pairHistory?.[a.id] || 0) + (X.matchHistory?.[a.id] || 0)) - ((X.pairHistory?.[b.id] || 0) + (X.matchHistory?.[b.id] || 0))) || (Math.random() - 0.5);
      })[0];
      s.push(Y);
      if (config.levelStrict && !matchLevel) {
        const common = getBelongingLevels(W.level).filter(l => getBelongingLevels(X.level).includes(l) && getBelongingLevels(Y.level).includes(l));
        if (common.length === 1) matchLevel = common[0];
      }

      // 4. Z (4-3修正: WおよびXおよびYが所属するいずれかのレベル)
      const Z = candidates.filter(m => !s.map(sm => sm.id).includes(m.id)).sort((a, b) => {
        const fp = Y.fixedPairMemberId && candidates.some(c => c.id === Y.fixedPairMemberId);
        if (fp) { if (a.id === Y.fixedPairMemberId) return -1; if (b.id === Y.fixedPairMemberId) return 1; }
        const af = a.fixedPairMemberId && candidates.some(c => c.id === a.fixedPairMemberId);
        const bf = b.fixedPairMemberId && candidates.some(c => c.id === b.fixedPairMemberId);
        if (af !== bf) return af ? 1 : -1;
        if (config.levelStrict) {
          if (matchLevel) {
            const ai = getBelongingLevels(a.level).includes(matchLevel) ? 0 : 1;
            const bi = getBelongingLevels(b.level).includes(matchLevel) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          } else {
            const commonWXY = getBelongingLevels(W.level).filter(l => getBelongingLevels(X.level).includes(l) && getBelongingLevels(Y.level).includes(l));
            const ai = getBelongingLevels(a.level).some(l => commonWXY.includes(l)) ? 0 : 1;
            const bi = getBelongingLevels(b.level).some(l => commonWXY.includes(l)) ? 0 : 1;
            if (ai !== bi) return ai - bi;
          }
        }
        return (a.playCount - b.playCount) || (a.lastPlayedBlock - b.lastPlayedBlock) || ((Y.pairHistory?.[a.id] || 0) - (Y.pairHistory?.[b.id] || 0)) || ((Y.matchHistory?.[a.id] || 0) - (Y.matchHistory?.[b.id] || 0)) || (((W.pairHistory?.[a.id] || 0) + (W.matchHistory?.[a.id] || 0)) - ((W.pairHistory?.[b.id] || 0) + (W.matchHistory?.[b.id] || 0))) || (((X.pairHistory?.[a.id] || 0) + (X.matchHistory?.[a.id] || 0)) - ((X.pairHistory?.[b.id] || 0) + (X.matchHistory?.[b.id] || 0))) || (Math.random() - 0.5);
      })[0];
      s.push(Z);
      if (config.levelStrict && !matchLevel) {
        const common = getBelongingLevels(W.level).filter(l => getBelongingLevels(X.level).includes(l) && getBelongingLevels(Y.level).includes(l) && getBelongingLevels(Z.level).includes(l));
        matchLevel = common[0] || null;
      }
      return { players: s, level: matchLevel };
    };

    const patterns = [];
    for (let i = 0; i < 4; i++) { try { patterns.push(generatePattern()); } catch(e){} }
    if (patterns.length === 0) return null;
    const best = patterns.reduce((prev, curr) => {
      const cost = (p: Member[]) => {
        let t = 0;
        [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]].forEach(([i,j]) => {
          if (p[i].fixedPairMemberId !== p[j].id) t += (p[i].pairHistory?.[p[j].id] || 0) + (p[i].matchHistory?.[p[j].id] || 0);
        });
        return t;
      };
      return cost(curr.players) < cost(prev.players) ? curr : prev;
    });
    return { p1: best.players[0].id, p2: best.players[1].id, p3: best.players[2].id, p4: best.players[3].id, level: best.level || undefined };
  };

  const regeneratePlannedMatches = (target?: Member[]) => {
    let tmpM = JSON.parse(JSON.stringify(target || members)), tmpH = matchHistory.length, planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const m = getMatchForCourt(planned, tmpM, tmpH);
      if (m) {
        planned.push({ id: i + 1, match: m });
        const ids = [m.p1, m.p2, m.p3, m.p4], blk = getCurrentBlockIndex(tmpH);
        tmpM = tmpM.map(x => ids.includes(x.id) ? { ...x, playCount: x.playCount + 1, lastPlayedBlock: blk } : x);
        tmpH++;
      } else planned.push({ id: i + 1, match: null });
    }
    setNextMatches(planned);
  };

  const handleBulkAction = () => {
    if (config.bulkOnlyMode) {
      const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), applied = [...nextMatches];
      setCourts(courts.map(c => ({ ...c, match: null }))); setNextMatches(courts.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        let curM = [...members], newH: MatchRecord[] = [], runH = matchHistory.length;
        applied.forEach(c => {
          if (c?.match) {
            const ids = [c.match.p1, c.match.p2, c.match.p3, c.match.p4];
            newH.push({ id: Date.now().toString() + c.id, timestamp: ts, courtId: c.id, players: ids.map(id => curM.find(m => m.id === id)?.name || '?'), playerIds: ids, level: c.match.level });
            curM = calculateNextMemberState(curM, c.match.p1, c.match.p2, c.match.p3, c.match.p4, runH);
            runH++;
          }
        });
        setMatchHistory(prev => [...newH, ...prev]); setMembers(curM); setCourts(applied); setHasUserConfirmedRegen(false); regeneratePlannedMatches(curM);
        prevMembersRef.current = JSON.parse(JSON.stringify(curM));
      }, 200);
    } else {
      setCourts(courts.map(c => ({ ...c, match: null })));
      setTimeout(() => {
        let curC = courts.map(c => ({ ...c, match: null })), tmpM = JSON.parse(JSON.stringify(members)), runH = matchHistory.length;
        for (let i = 0; i < curC.length; i++) {
          const m = getMatchForCourt(curC, tmpM, runH);
          if (m) {
            const ids = [m.p1, m.p2, m.p3, m.p4];
            setMatchHistory(prev => [{ id: Date.now().toString() + curC[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: curC[i].id, players: ids.map(id => tmpM.find((x: any) => x.id === id)?.name || '?'), playerIds: ids, level: m.level }, ...prev]);
            curC[i] = { ...curC[i], match: m }; tmpM = calculateNextMemberState(tmpM, m.p1, m.p2, m.p3, m.p4, runH); setMembers(tmpM); runH++;
          }
        }
        setCourts(curC);
      }, 200);
    }
  };

  const generateNextMatch = (cId: number) => {
    if (config.bulkOnlyMode) return;
    const m = getMatchForCourt(courts, members, matchHistory.length);
    if (!m) return alert('待機メンバーが足りません');
    const ids = [m.p1, m.p2, m.p3, m.p4];
    setMatchHistory(prev => [{ id: Date.now().toString() + cId, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: cId, players: ids.map(id => members.find(x => x.id === id)?.name || '?'), playerIds: ids, level: m.level }, ...prev]);
    setMembers(prev => calculateNextMemberState(prev, m.p1, m.p2, m.p3, m.p4, matchHistory.length));
    setCourts(prev => prev.map(c => c.id === cId ? { ...c, match: m } : c));
  };

  const finishMatch = (cId: number) => setCourts(prev => prev.map(c => c.id === cId ? { ...c, match: null } : c));
  const changeZoom = (d: number) => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, Math.min(2.0, p.zoomLevel + d)) }));
  const changeFontSize = (d: number) => setConfig(p => ({ ...p, nameFontSizeModifier: Math.max(0.5, Math.min(2.0, p.nameFontSizeModifier + d)) }));

  const getFS = (name: string = '', mod: number = 1.0) => {
    const len = name.split('').reduce((a, c) => a + (/[\x20-\x7E]/.test(c) ? 0.6 : 1.0), 0);
    const base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const h = 140 * config.zoomLevel;
    return (
      <div className={`relative rounded-xl shadow-md border overflow-hidden flex border-l-8 ${isPlanned ? 'border-gray-500 bg-gray-100' : 'border-slate-900 bg-white'} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80 border-orange-200 bg-orange-50/50' : ''}`} style={{ height: `${h}px`, minHeight: `${h}px` }}>
        <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-gray-200/50' : 'bg-slate-50'}`}>
          {!config.bulkOnlyMode && !isPlanned && court.match && <button onClick={() => finishMatch(court.id)} className="absolute top-1 left-1 p-1 text-red-500 hover:bg-red-50 rounded-full z-10"><X size={16} strokeWidth={3} /></button>}
          <span className={`font-black text-2xl ${isPlanned ? 'text-gray-500' : 'text-slate-900'}`}>{court.id}</span>
          {court.match?.level && <span className={`mt-1 px-1 py-0.5 rounded text-[8px] font-bold text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}
        </div>
        <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden">
          {court.match ? (
            <div className="flex items-center gap-2 h-full">
              <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                {[1, 2].map(idx => (
                  <div key={idx} className={`rounded-lg flex flex-col justify-center items-stretch border px-3 overflow-hidden ${idx === 1 ? 'bg-blue-50/30 border-blue-100' : 'bg-red-50/30 border-red-100'}`}>
                    {[idx === 1 ? 'p1' : 'p3', idx === 1 ? 'p2' : 'p4'].map((k, i) => (
                      <div key={k} className="h-1/2 flex items-center">
                        <div className={`w-full leading-tight font-black whitespace-nowrap overflow-hidden text-ellipsis ${isPlanned ? 'text-gray-600' : 'text-black'} ${i === 1 ? 'text-right' : 'text-left'}`} style={{ fontSize: getFS(members.find(m => m.id === (court.match as any)?.[k])?.name, config.nameFontSizeModifier * 0.9) }}>{members.find(m => m.id === (court.match as any)?.[k])?.name}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (!isPlanned && !config.bulkOnlyMode ? <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-2 border-dashed border-gray-300 text-gray-400 font-black text-xl rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors italic"><Play size={20} fill="currentColor" /> 割当</button> : <div className="text-gray-300 font-bold text-center italic">No Match</div>)}
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
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-1"><button onClick={() => changeZoom(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><button onClick={() => changeZoom(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2"><button onClick={() => changeFontSize(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><div className="px-0.5 text-white/50"><Type size={14} /></div><button onClick={() => changeFontSize(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
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
              {courts.map(c => <CourtCard key={c.id} court={c} />)}
            </section>
            {config.bulkOnlyMode && (
              <section className="grid grid-cols-1 landscape:grid-cols-2 gap-4 mt-8 pb-8">
                <h2 className="col-span-full font-black text-xl text-gray-600 border-l-8 border-gray-500 pl-3">次回の予定</h2>
                {nextMatches.map(c => <CourtCard key={c.id} court={c} isPlanned={true} />)}
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
            <div className="flex justify-between items-center px-2 pb-2">
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                <button onClick={resetToSavedOrder} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm"><RotateCcw size={14}/> 保存した順</button>
                <button onClick={sortByName} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm"><SortAsc size={14}/> 名前順</button>
                <button onClick={sortByMemo} className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm"><StickyNote size={14}/> メモ順</button>
              </div>
              <button onClick={saveCurrentOrder} className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 rounded-full text-xs font-bold text-white shadow-md ml-4"><Save size={14}/> 順序を保存</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {displayMembers.map((m, idx) => (
                <div key={m.id} draggable onDragStart={() => onDragStart(idx)} onDragOver={e => onDragOver(e, idx)} onDragEnd={onDragEnd} className={`p-4 flex items-center gap-2 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''} ${draggedIndex === idx ? 'opacity-20 bg-blue-100' : ''}`}>
                  <div className="p-2 cursor-grab text-gray-300"><GripVertical size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input value={m.name} onChange={e => syncMemberUpdate(displayMembers.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="flex-1 font-bold text-xl bg-transparent outline-none focus:text-blue-600 min-w-0" />
                      <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-200 shrink-0"><StickyNote size={12} className="text-gray-400" /><input value={m.memo} maxLength={12} onChange={e => syncMemberUpdate(displayMembers.map(x => x.id === m.id ? { ...x, memo: e.target.value } : x))} className="w-16 text-xs font-bold bg-transparent outline-none text-gray-600" placeholder="メモ" /></div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <div className="relative group"><select value={m.level} onChange={e => { const n = displayMembers.map(x => x.id === m.id ? { ...x, level: e.target.value as MemberLevel } : x); if (checkChangeConfirmation(n)) syncMemberUpdate(n); }} className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full">{LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select><LevelBadge level={m.level} className="group-hover:ring-2 ring-blue-400 transition-shadow" /></div>
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{displayMembers.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}{m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}</span>
                    </div>
                  </div>
                  <button onClick={() => { const n = displayMembers.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x); if (checkChangeConfirmation(n)) syncMemberUpdate(n); }} className={`px-4 py-2 rounded-xl font-bold border-2 shrink-0 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => { if(confirm(`${m.name}を削除しますか？`)) { const n = displayMembers.filter(x => x.id !== m.id); if (checkChangeConfirmation(n)) { setDisplayMembers(n); setMembers(members.filter(x => x.id !== m.id)); } } }} className="text-gray-200 hover:text-red-500 px-2 shrink-0"><Trash2 size={24} /></button>
                </div>
              ))}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択</h3><button onClick={() => setEditingPairMemberId(null)}><X size={20}/></button></div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 text-red-600 font-bold border-b flex items-center gap-2 hover:bg-red-50"><Unlink size={16} /> ペアを解消</button>
                      {displayMembers.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId)).map(c => <button key={c.id} onClick={() => updateFixedPair(editingPairMemberId, c.id)} className={`w-full text-left px-4 py-3 font-bold border-b flex items-center gap-2 hover:bg-blue-50 ${displayMembers.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === c.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} className="text-gray-400" />{c.name}</button>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
            <table className="w-full text-left"><thead className="bg-gray-50 text-gray-400"><tr><th className="p-4 text-xs font-bold uppercase">時刻</th><th className="p-4 text-xs font-bold uppercase">対戦</th></tr></thead><tbody className="divide-y divide-gray-100">
              {matchHistory.map(h => (
                <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td><td className="p-4 font-bold text-base flex items-center gap-2">{h.level && <span className={`px-2 py-0.5 rounded text-[10px] text-white shrink-0 ${h.level === 'A' ? 'bg-blue-600' : h.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{h.level}</span>}<span className="truncate">{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</span></td></tr>
              ))}
            </tbody></table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div><label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-[0.2em]">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label><input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
            <div className="space-y-4 pt-4 border-t border-gray-100"><span className="block text-sm font-bold text-gray-400 uppercase tracking-widest">名簿データの管理</span><div className="grid grid-cols-2 gap-3"><button onClick={exportMembers} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors"><Download size={18} /> 退避(保存)</button><button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-indigo-50 transition-colors"><Upload size={18} /> 復元(読込)</button><input type="file" ref={fileInputRef} onChange={importMembers} accept=".json" className="hidden" /></div><p className="text-[10px] text-gray-400 leading-relaxed italic">※「名前・レベル・固定ペア・表示順・メモ」を保存します。</p></div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50"><div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">1巡目の試合は名簿順</span><span className="text-xs text-gray-400">未出場の人が4人以上いる場合、名簿の上位から割り当てます</span></div><button onClick={() => { const n = { ...config, orderFirstMatchByList: !config.orderFirstMatchByList }; if (checkChangeConfirmation(undefined, n)) setConfig(n); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.orderFirstMatchByList ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.orderFirstMatchByList ? 'left-8' : 'left-1'}`} /></button></div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50"><div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><span className="text-xs text-gray-400">同一レベルに所属する人しか同じコートに入りません</span></div><button onClick={() => { const n = { ...config, levelStrict: !config.levelStrict }; if (checkChangeConfirmation(undefined, n)) setConfig(n); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button></div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50"><div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">一括進行モード</span><span className="text-xs text-gray-400">一括更新のみ可能となり、次回の予定が表示されます</span></div><button onClick={() => setConfig(prev => ({ ...prev, bulkOnlyMode: !prev.bulkOnlyMode }))} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.bulkOnlyMode ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.bulkOnlyMode ? 'left-8' : 'left-1'}`} /></button></div>
            <div className="space-y-4"><button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border active:bg-gray-100 transition-colors"><RotateCcw size={20} /> 試合数と履歴をリセット</button><button onClick={() => {if(confirm('全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100 active:bg-red-100 transition-colors">データを完全消去</button></div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === t.id ? 'text-blue-700 scale-110' : 'text-gray-400'}`}><t.icon size={26} strokeWidth={activeTab === t.id ? 3 : 2} /><span className="text-[10px] font-black mt-1.5">{t.label}</span></button>
        ))}
      </nav>
      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }` }} />
    </div>
  );
}
