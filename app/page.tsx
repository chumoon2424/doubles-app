
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
// 6パターンのレベル定義
type MemberLevel = 'A/B/C' | 'A' | 'A/B' | 'B' | 'B/C' | 'C';
const LEVEL_OPTIONS: MemberLevel[] = ['A/B/C', 'A', 'A/B', 'B', 'B/C', 'C'];

interface Member {
  id: number;
  name: string;
  level: MemberLevel;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number;
  lastPlayedTime: number; // 互換性のために維持
  lastPlayedBlock: number; // 指示に基づき、何ブロック目に最後に出たかを記録
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

  // --- データの読み込みと保存 (v19対応) ---
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
        } catch (e) {
          console.error("Parse error in version", v);
        }
      }
    }

    if (loadedData) {
      const safeMembers = (loadedData.members || []).map((m: any, idx: number) => {
        // レベルの互換性処理 ('A' | 'B' | 'C' -> 新形式)
        let newLevel = m.level;
        if (loadedVersion !== 'v19') {
          if (!LEVEL_OPTIONS.includes(m.level as any)) {
            newLevel = 'A/B/C'; // デフォルト
          }
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
      console.error("Failed to save data");
    }
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

  const getCurrentBlockIndex = (hLength: number) => {
    return Math.floor(hLength / config.courtCount);
  };

  // --- レベルバッジ用コンポーネント ---
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

  // --- 並べ替えロジック (変更なし) ---
  const sortByName = () => {
    const sorted = [...displayMembers].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    setDisplayMembers(sorted);
  };
  const sortByMemo = () => {
    const sorted = [...displayMembers].sort((a, b) => a.memo.localeCompare(b.memo));
    setDisplayMembers(sorted);
  };
  const resetToSavedOrder = () => {
    const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
    setDisplayMembers(sorted);
  };
  const saveCurrentOrder = () => {
    const updatedMembers = displayMembers.map((m, idx) => ({ ...m, sortOrder: idx }));
    setMembers(updatedMembers);
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
    try {
      const plannedIds = new Set<number>();
      nextMatches.forEach(c => {
        if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id));
      });
      const status = (members || []).map(m => {
        let s = `${m.id}-${m.fixedPairMemberId || 'none'}`;
        if (plannedIds.has(m.id)) {
          s += `-${m.isActive}`;
          if (config.levelStrict) s += `-${m.level}`;
        } else {
          s += `-${m.isActive === true ? 'active' : 'inactive'}`;
        }
        return s;
      }).sort().join('|');
      return `${status}_C${config.courtCount}_S${config.levelStrict}_B${config.bulkOnlyMode}_F${config.orderFirstMatchByList}`;
    } catch (e) { return ''; }
  }, [members, config.courtCount, config.levelStrict, config.bulkOnlyMode, config.orderFirstMatchByList, nextMatches]);

  const isRegenRequired = (currentMembers: Member[], currentConfig: AppConfig) => {
    const plannedIds = new Set<number>();
    nextMatches.forEach(c => {
      if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id));
    });
    const configPart = `_C${currentConfig.courtCount}_S${currentConfig.levelStrict}_B${currentConfig.bulkOnlyMode}_F${currentConfig.orderFirstMatchByList}`;
    if (lastFingerprint !== '' && !lastFingerprint.endsWith(configPart)) return true;
    const currentMemberIds = new Set(currentMembers.map(m => m.id));
    const wasPlannedMemberDeleted = Array.from(plannedIds).some(id => !currentMemberIds.has(id));
    if (wasPlannedMemberDeleted) return true;
    return currentMembers.some(m => {
      const prev = prevMembersRef.current.find(p => p.id === m.id);
      if (!prev) return true;
      if (prev.fixedPairMemberId !== m.fixedPairMemberId) return true;
      const isActiveChanged = prev.isActive !== m.isActive;
      if (plannedIds.has(m.id) && isActiveChanged && !m.isActive) return true;
      if (!plannedIds.has(m.id) && isActiveChanged && m.isActive) return true;
      if (currentConfig.levelStrict && plannedIds.has(m.id) && prev.level !== m.level) return true;
      return false;
    });
  };

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
  }, [activeTab, isInitialized, memberFingerprint, config.bulkOnlyMode, config.levelStrict, config.courtCount, config.orderFirstMatchByList]);

  const handleCourtCountChange = (count: number) => {
    const nextConfig = { ...config, courtCount: count };
    if (!checkChangeConfirmation(undefined, nextConfig)) return;
    setConfig(nextConfig);
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
        ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, lastPlayedBlock: 0,
        matchHistory: {}, pairHistory: {} 
      }));
      setMembers(clearedMembers);
      setMatchHistory([]);
      const clearedCourts = courts.map(c => ({ ...c, match: null }));
      setCourts(clearedCourts);
      setHasUserConfirmedRegen(false); 
      if (config.bulkOnlyMode) { regeneratePlannedMatches(clearedMembers); } 
      else { setNextMatches(clearedCourts); }
    }
  };

  const exportMembers = () => {
    const backupData = members.map(m => ({
      id: m.id, name: m.name, level: m.level, fixedPairMemberId: m.fixedPairMemberId, sortOrder: m.sortOrder, memo: m.memo
    }));
    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
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
        if (!Array.isArray(data)) throw new Error('Invalid format');
        if (!confirm('名簿を復元します。現在の全ての試合データと履歴はリセットされますが、よろしいですか？')) return;
        const newMembers: Member[] = data.map((m, idx) => ({
          ...m, name: m.name || '?', level: m.level || 'A/B/C', isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, lastPlayedBlock: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: m.fixedPairMemberId || null, sortOrder: m.sortOrder !== undefined ? m.sortOrder : idx, memo: m.memo !== undefined ? m.memo : ''
        }));
        setMembers(newMembers);
        setMatchHistory([]);
        setCourts(prev => prev.map(c => ({ ...c, match: null })));
        setNextMatches(prev => prev.map(c => ({ ...c, match: null })));
        setNextMemberId(newMembers.length > 0 ? Math.max(...newMembers.map(m => m.id)) + 1 : 1);
        setHasUserConfirmedRegen(false);
        alert('名簿を復元しました。');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) { alert('復元に失敗しました。'); }
    };
    reader.readAsText(file);
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const now = new Date();
    const year2 = String(now.getFullYear()).slice(-2);
    const month2 = String(now.getMonth() + 1).padStart(2, '0');
    const defaultMemo = `${year2}${month2}`;

    const newMember: Member = { 
      id: nextMemberId, name: `${nextMemberId}`, level: 'A/B/C', isActive: true, 
      playCount: avgPlay, imputedPlayCount: avgPlay, lastPlayedTime: 0, lastPlayedBlock: 0,
      matchHistory: {}, pairHistory: {}, fixedPairMemberId: null,
      sortOrder: members.length, memo: defaultMemo
    };
    if (!checkChangeConfirmation([...members, newMember])) return;
    setMembers([...members, newMember]);
    setDisplayMembers([...displayMembers, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    const prevMembersCopy = JSON.parse(JSON.stringify(members));
    const nextDisplay = displayMembers.map(m => {
      let nm = { ...m };
      if (m.id === memberId) nm.fixedPairMemberId = partnerId;
      if (partnerId && m.id === partnerId) nm.fixedPairMemberId = memberId;
      if (m.fixedPairMemberId === memberId && m.id !== partnerId) nm.fixedPairMemberId = null;
      const oldTarget = prevMembersCopy.find((x: any) => x.id === memberId);
      if (oldTarget?.fixedPairMemberId && m.id === oldTarget.fixedPairMemberId && m.id !== partnerId) nm.fixedPairMemberId = null;
      return nm;
    });
    if (!checkChangeConfirmation(nextDisplay)) return;
    syncMemberUpdate(nextDisplay);
    setEditingPairMemberId(null);
  };

  // --- マッチングアルゴリズム本体 (修正箇所) ---
  const calculateNextMemberState = (currentMembers: Member[], p1: number, p2: number, p3: number, p4: number, hLength: number) => {
    const now = Date.now();
    const currentBlock = getCurrentBlockIndex(hLength);
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
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, lastPlayedBlock: currentBlock, matchHistory: newMatchH, pairHistory: newPairH };
    });
    const activeMembers = updated.filter(m => m.isActive);
    if (activeMembers.length === 0) return updated;
    const avgPlays = Math.floor(activeMembers.reduce((sum, m) => sum + m.playCount, 0) / activeMembers.length);
    return updated.map(m => {
      if (!m.isActive && m.playCount < avgPlays) {
        const diff = avgPlays - m.playCount;
        return { ...m, playCount: avgPlays, imputedPlayCount: (m.imputedPlayCount || 0) + diff };
      }
      return m;
    });
  };

  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[], hLength: number) => {
    const playingIds = new Set<number>();
    (currentCourts || []).forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    let candidates = (currentMembers || []).filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // --- 1巡目優先 ---
    if (config.orderFirstMatchByList) {
      const firstTimers = candidates.filter(m => m.playCount === 0).sort((a, b) => a.sortOrder - b.sortOrder);
      if (firstTimers.length >= 4) {
        const p = firstTimers.slice(0, 4);
        return { p1: p[0].id, p2: p[1].id, p3: p[2].id, p4: p[3].id };
      }
    }

    // レベル厳格モードの場合、4人揃わないレベルを除外
    if (config.levelStrict) {
      const levelCounts: Record<string, number> = { 'A': 0, 'B': 0, 'C': 0 };
      candidates.forEach(m => {
        getBelongingLevels(m.level).forEach(l => levelCounts[l]++);
      });
      // 自身が所属するいずれのレベルにおいても、そのレベル所属者が4名未満である場合は除外
      candidates = candidates.filter(m => {
        return getBelongingLevels(m.level).some(l => levelCounts[l] >= 4);
      });
    }

    if (candidates.length < 4) return null;

    const currentBlock = getCurrentBlockIndex(hLength);

    // 単一パターン生成関数
    const generatePattern = () => {
      const s: Member[] = [];
      let matchLevel: 'A' | 'B' | 'C' | null = null;

      // 1. Wを決める
      const wCandidates = [...candidates].sort((a, b) => {
        if (a.playCount !== b.playCount) return a.playCount - b.playCount;
        if (a.lastPlayedBlock !== b.lastPlayedBlock) return a.lastPlayedBlock - b.lastPlayedBlock;
        return Math.random() - 0.5;
      });
      const W = wCandidates[0];
      s.push(W);

      if (config.levelStrict) {
        const bl = getBelongingLevels(W.level);
        if (bl.length === 1) matchLevel = bl[0];
      }

      // 2. Xを決める
      const getX = () => {
        const remaining = candidates.filter(m => m.id !== W.id);
        const fixedPartner = remaining.find(m => m.id === W.fixedPairMemberId);
        if (fixedPartner) return fixedPartner;

        const xSorted = remaining.sort((a, b) => {
          // 2-2. 固定ペアがいない人、または固定ペアが休み中の人 (優先)
          const aHasActiveFixed = a.fixedPairMemberId && candidates.some(c => c.id === a.fixedPairMemberId);
          const bHasActiveFixed = b.fixedPairMemberId && candidates.some(c => c.id === b.fixedPairMemberId);
          if (aHasActiveFixed !== bHasActiveFixed) return aHasActiveFixed ? 1 : -1;

          if (config.levelStrict) {
            const aLevels = getBelongingLevels(a.level);
            const bLevels = getBelongingLevels(b.level);
            if (matchLevel) {
              const aIn = aLevels.includes(matchLevel) ? 0 : 1;
              const bIn = bLevels.includes(matchLevel) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            } else {
              const wLevels = getBelongingLevels(W.level);
              const aIn = aLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              const bIn = bLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            }
          }

          if (a.playCount !== b.playCount) return a.playCount - b.playCount;
          if (a.lastPlayedBlock !== b.lastPlayedBlock) return a.lastPlayedBlock - b.lastPlayedBlock;
          
          const aPairCount = W.pairHistory?.[a.id] || 0;
          const bPairCount = W.pairHistory?.[b.id] || 0;
          if (aPairCount !== bPairCount) return aPairCount - bPairCount;

          const aMatchCount = W.matchHistory?.[a.id] || 0;
          const bMatchCount = W.matchHistory?.[b.id] || 0;
          if (aMatchCount !== bMatchCount) return aMatchCount - bMatchCount;

          return Math.random() - 0.5;
        });
        return xSorted[0];
      };
      const X = getX();
      s.push(X);

      if (config.levelStrict && !matchLevel) {
        const wLevels = getBelongingLevels(W.level);
        const xLevels = getBelongingLevels(X.level);
        const common = wLevels.filter(l => xLevels.includes(l));
        if (common.length === 1) matchLevel = common[0];
      }

      // 3. Yを決める
      const getY = () => {
        const remaining = candidates.filter(m => m.id !== W.id && m.id !== X.id);
        const ySorted = remaining.sort((a, b) => {
          if (config.levelStrict) {
            const aLevels = getBelongingLevels(a.level);
            const bLevels = getBelongingLevels(b.level);
            if (matchLevel) {
              const aIn = aLevels.includes(matchLevel) ? 0 : 1;
              const bIn = bLevels.includes(matchLevel) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            } else {
              const wLevels = getBelongingLevels(W.level);
              const aIn = aLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              const bIn = bLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            }
          }

          if (a.playCount !== b.playCount) return a.playCount - b.playCount;
          if (a.lastPlayedBlock !== b.lastPlayedBlock) return a.lastPlayedBlock - b.lastPlayedBlock;

          const aWCount = (W.pairHistory?.[a.id] || 0) + (W.matchHistory?.[a.id] || 0);
          const bWCount = (W.pairHistory?.[b.id] || 0) + (W.matchHistory?.[b.id] || 0);
          if (aWCount !== bWCount) return aWCount - bWCount;

          const aXCount = (X.pairHistory?.[a.id] || 0) + (X.matchHistory?.[a.id] || 0);
          const bXCount = (X.pairHistory?.[b.id] || 0) + (X.matchHistory?.[b.id] || 0);
          if (aXCount !== bXCount) return aXCount - bXCount;

          return Math.random() - 0.5;
        });
        return ySorted[0];
      };
      const Y = getY();
      s.push(Y);

      if (config.levelStrict && !matchLevel) {
        const wLevels = getBelongingLevels(W.level);
        const xLevels = getBelongingLevels(X.level);
        const yLevels = getBelongingLevels(Y.level);
        const common = wLevels.filter(l => xLevels.includes(l) && yLevels.includes(l));
        if (common.length === 1) matchLevel = common[0];
      }

      // 4. Zを決める
      const getZ = () => {
        const remaining = candidates.filter(m => !s.map(sm=>sm.id).includes(m.id));
        const fixedPartner = remaining.find(m => m.id === Y.fixedPairMemberId);
        if (fixedPartner) return fixedPartner;

        const zSorted = remaining.sort((a, b) => {
          const aHasActiveFixed = a.fixedPairMemberId && candidates.some(c => c.id === a.fixedPairMemberId);
          const bHasActiveFixed = b.fixedPairMemberId && candidates.some(c => c.id === b.fixedPairMemberId);
          if (aHasActiveFixed !== bHasActiveFixed) return aHasActiveFixed ? 1 : -1;

          if (config.levelStrict) {
            const aLevels = getBelongingLevels(a.level);
            const bLevels = getBelongingLevels(b.level);
            if (matchLevel) {
              const aIn = aLevels.includes(matchLevel) ? 0 : 1;
              const bIn = bLevels.includes(matchLevel) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            } else {
              const wLevels = getBelongingLevels(W.level);
              const aIn = aLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              const bIn = bLevels.some(l => wLevels.includes(l)) ? 0 : 1;
              if (aIn !== bIn) return aIn - bIn;
            }
          }

          if (a.playCount !== b.playCount) return a.playCount - b.playCount;
          if (a.lastPlayedBlock !== b.lastPlayedBlock) return a.lastPlayedBlock - b.lastPlayedBlock;

          const aYPair = Y.pairHistory?.[a.id] || 0;
          const bYPair = Y.pairHistory?.[b.id] || 0;
          if (aYPair !== bYPair) return aYPair - bYPair;

          const aYMatch = Y.matchHistory?.[a.id] || 0;
          const bYMatch = Y.matchHistory?.[b.id] || 0;
          if (aYMatch !== bYMatch) return aYMatch - bYMatch;

          const aWCount = (W.pairHistory?.[a.id] || 0) + (W.matchHistory?.[a.id] || 0);
          const bWCount = (W.pairHistory?.[b.id] || 0) + (W.matchHistory?.[b.id] || 0);
          if (aWCount !== bWCount) return aWCount - bWCount;

          const aXCount = (X.pairHistory?.[a.id] || 0) + (X.matchHistory?.[a.id] || 0);
          const bXCount = (X.pairHistory?.[b.id] || 0) + (X.matchHistory?.[b.id] || 0);
          if (aXCount !== bXCount) return aXCount - bXCount;

          return Math.random() - 0.5;
        });
        return zSorted[0];
      };
      const Z = getZ();
      s.push(Z);

      // 最終レベル決定
      if (config.levelStrict && !matchLevel) {
        const wLevels = getBelongingLevels(W.level);
        const xLevels = getBelongingLevels(X.level);
        const yLevels = getBelongingLevels(Y.level);
        const zLevels = getBelongingLevels(Z.level);
        const common = wLevels.filter(l => xLevels.includes(l) && yLevels.includes(l) && zLevels.includes(l));
        matchLevel = common[0];
      }

      return { players: s, level: matchLevel };
    };

    const patterns = [];
    for (let i = 0; i < 4; i++) {
      try { patterns.push(generatePattern()); } catch(e) {}
    }

    if (patterns.length === 0) return null;

    // 7. 回数合計が最少のパターンを採用
    const best = patterns.reduce((prev, curr) => {
      const cost = (p: Member[]) => {
        let total = 0;
        // W,X,Y,Zの組み合わせ
        const pairs = [[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
        pairs.forEach(([i,j]) => {
          // 固定ペア分はコストから除く (指示: 「固定ペアの分を除く」)
          if (p[i].fixedPairMemberId !== p[j].id) {
            total += (p[i].pairHistory?.[p[j].id] || 0) + (p[i].matchHistory?.[p[j].id] || 0);
          }
        });
        return total;
      };
      return cost(curr.players) < cost(prev.players) ? curr : prev;
    });

    return { 
      p1: best.players[0].id, 
      p2: best.players[1].id, 
      p3: best.players[2].id, 
      p4: best.players[3].id, 
      level: best.level || undefined 
    };
  };

  const regeneratePlannedMatches = (targetMembers?: Member[]) => {
    let tempMembers = JSON.parse(JSON.stringify(targetMembers || members)) as Member[];
    let tempHistoryLength = matchHistory.length;
    let planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const match = getMatchForCourt(planned, tempMembers, tempHistoryLength);
      if (match) {
        planned.push({ id: i + 1, match });
        const ids = [match.p1, match.p2, match.p3, match.p4];
        const block = getCurrentBlockIndex(tempHistoryLength);
        tempMembers = tempMembers.map(m => ids.includes(m.id) ? { ...m, playCount: m.playCount + 1, lastPlayedBlock: block } : m);
        tempHistoryLength++;
      } else { planned.push({ id: i + 1, match: null }); }
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
        let runningHLength = matchHistory.length;

        matchesToApply.forEach(c => {
          if (c?.match) {
            const ids = [c.match.p1, c.match.p2, c.match.p3, c.match.p4];
            const names = ids.map(id => currentMembersState.find(m => m.id === id)?.name || '?');
            newHistoryEntries.push({ id: Date.now().toString() + c.id, timestamp, courtId: c.id, players: names, playerIds: ids, level: c.match?.level });
            currentMembersState = calculateNextMemberState(currentMembersState, c.match.p1, c.match.p2, c.match.p3, c.match.p4, runningHLength);
            runningHLength++;
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
          let runningHLength = matchHistory.length;
          for (let i = 0; i < current.length; i++) {
            const m = getMatchForCourt(current, temp, runningHLength);
            if (m) {
              const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => temp.find((x: any) => x.id === id)?.name || '?');
              setMatchHistory(prevH => [{ id: Date.now().toString() + current[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.level }, ...prevH]);
              current[i] = { ...current[i], match: m };
              temp = calculateNextMemberState(temp, m.p1, m.p2, m.p3, m.p4, runningHLength);
              setMembers(temp);
              runningHLength++;
            }
          }
          return current;
        });
      }, 200);
    }
  };

  const generateNextMatch = (courtId: number) => {
    if (config.bulkOnlyMode) return;
    const match = getMatchForCourt(courts, members, matchHistory.length);
    if (!match) return alert('待機メンバーが足りません');
    const ids = [match.p1, match.p2, match.p3, match.p4], names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{ id: Date.now().toString() + courtId, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId, players: names, playerIds: ids, level: match.level }, ...prev]);
    setMembers(prev => calculateNextMemberState(prev, match.p1, match.p2, match.p3, match.p4, matchHistory.length));
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: null } : c));
  const changeZoom = (d: number) => setConfig(p => ({ ...p, zoomLevel: Math.max(0.5, Math.min(2.0, p.zoomLevel + d)) }));
  const changeNameFontSize = (d: number) => setConfig(p => ({ ...p, nameFontSizeModifier: Math.max(0.5, Math.min(2.0, p.nameFontSizeModifier + d)) }));

  const getDynamicFontSize = (name: string = '', mod: number = 1.0) => {
    if (!name) return '1rem';
    const len = name.split('').reduce((acc, char) => acc + (/[\x20-\x7E]/.test(char) ? 0.6 : 1.0), 0);
    let base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const h = (config.bulkOnlyMode ? 140 : 140) * config.zoomLevel;
    const border = isPlanned ? 'border-gray-500' : 'border-slate-900';
    const bg = isPlanned ? 'bg-gray-100' : 'bg-white';
    
    return (
      <div 
        className={`relative rounded-xl shadow-md border overflow-hidden flex border-l-8 ${border} ${bg} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80 border-orange-200 bg-orange-50/50' : ''}`}
        style={{ height: `${h}px`, minHeight: `${h}px` }}
      >
        <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-gray-200/50' : 'bg-slate-50'}`}>
          {!config.bulkOnlyMode && !isPlanned && court.match ? (
            <button onClick={() => finishMatch(court.id)} className="absolute top-1 left-1 p-1 text-red-500 hover:bg-red-50 rounded-full transition-colors z-10">
              <X size={16} strokeWidth={3} />
            </button>
          ) : null}
          <span className={`font-black text-2xl ${isPlanned ? 'text-gray-500' : 'text-slate-900'}`}>{court.id}</span>
          {court.match?.level && <span className={`mt-1 px-1 py-0.5 rounded text-[8px] font-bold text-white ${court.match.level === 'A' ? 'bg-blue-600' : court.match.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{court.match.level}</span>}
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
              <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-2 border-dashed border-gray-300 text-gray-400 font-black text-xl rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors italic">
                <Play size={20} fill="currentColor" /> 割当
              </button>
            ) : (
              <div className="text-gray-300 font-bold text-center italic">No Match</div>
            )
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
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-1"><button onClick={() => changeZoom(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><button onClick={() => changeZoom(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2"><button onClick={() => changeNameFontSize(-0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button><div className="px-0.5 text-white/50"><Type size={14} /></div><button onClick={() => changeNameFontSize(0.1)} className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button></div>
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
              <button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
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
                      {/* レベル選択リスト */}
                      <div className="relative group">
                        <select 
                          value={m.level} 
                          onChange={e => {
                            const next = displayMembers.map(x => x.id === m.id ? { ...x, level: e.target.value as MemberLevel } : x);
                            if (checkChangeConfirmation(next)) syncMemberUpdate(next);
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full"
                        >
                          {LEVEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <LevelBadge level={m.level} className="group-hover:ring-2 ring-blue-400 transition-shadow" />
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
                      <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペアを解消</button>
                      {displayMembers.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId))
                        .map(candidate => <button key={candidate.id} onClick={() => updateFixedPair(editingPairMemberId, candidate.id)} className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b flex items-center gap-2 ${displayMembers.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}><LinkIcon size={16} className="text-gray-400" />{candidate.name}</button>)}
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
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td><td className="p-4 font-bold text-base flex items-center gap-2">
                    {h.level && <span className={`px-2 py-0.5 rounded text-[10px] text-white shrink-0 ${h.level === 'A' ? 'bg-blue-600' : h.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>{h.level}</span>}
                    <span className="truncate">{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</span>
                  </td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-sm p-8 space-y-8 max-w-2xl mx-auto">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-6 uppercase tracking-[0.2em]">コート数: <span className="text-blue-600 text-2xl ml-2">{config.courtCount}</span></label>
              <input type="range" min="1" max="8" value={config.courtCount} onChange={e => handleCourtCountChange(parseInt(e.target.value))} className="w-full h-3 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" style={{ WebkitAppearance: 'none' }} />
            </div>
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <span className="block text-sm font-bold text-gray-400 uppercase tracking-widest">名簿データの管理</span>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={exportMembers} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:bg-indigo-700 transition-colors"><Download size={18} /> 退避(保存)</button>
                <button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-indigo-50 transition-colors"><Upload size={18} /> 復元(読込)</button>
                <input type="file" ref={fileInputRef} onChange={importMembers} accept=".json" className="hidden" />
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed italic">※「名前・レベル・固定ペア・表示順・メモ」を保存します。機種変更時や名簿のバックアップに利用してください。復元すると現在の試合履歴はリセットされます。</p>
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">1巡目の試合は名簿順</span><span className="text-xs text-gray-400 leading-tight">未出場の人が4人以上いる場合、名簿の上位から（制約無視で）割り当てます</span></div>
              <button onClick={() => { const next = { ...config, orderFirstMatchByList: !config.orderFirstMatchByList }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.orderFirstMatchByList ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.orderFirstMatchByList ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><span className="text-xs text-gray-400 leading-tight">同一レベルに所属する人しか同じコートに入りません</span></div>
              <button onClick={() => { const next = { ...config, levelStrict: !config.levelStrict }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">一括進行モード</span><span className="text-xs text-gray-400 leading-tight">一括更新のみ可能となり、次回の予定が表示されます</span></div>
              <button onClick={() => setConfig(prev => ({ ...prev, bulkOnlyMode: !prev.bulkOnlyMode }))} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.bulkOnlyMode ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.bulkOnlyMode ? 'left-8' : 'left-1'}`} /></button>
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
      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }` }} />
    </div>
  );
}
