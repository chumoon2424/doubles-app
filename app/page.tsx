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
// 修正：レベル設定を6パターンに変更
type Level = 'A/B/C' | 'A' | 'A/B' | 'B' | 'B/C' | 'C';
type BaseLevel = 'A' | 'B' | 'C';

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

interface Match {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  level?: BaseLevel;
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
  level?: BaseLevel;
}

interface AppConfig {
  courtCount: number;
  levelStrict: boolean;
  zoomLevel: number;
  nameFontSizeModifier: number;
  bulkOnlyMode: boolean;
  orderFirstMatchByList: boolean;
}

// レベル対応表の定義
const LEVEL_MAP: Record<Level, BaseLevel[]> = {
  'A/B/C': ['A', 'B', 'C'],
  'A': ['A'],
  'A/B': ['A', 'B'],
  'B': ['B'],
  'B/C': ['B', 'C'],
  'C': ['C']
};

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
  const [editingLevelMemberId, setEditingLevelMemberId] = useState<number | null>(null);
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
        } catch (e) { console.error("Parse error", v); }
      }
    }

    if (loadedData) {
      const safeMembers = (loadedData.members || []).map((m: any, idx: number) => ({
        ...m,
        // 旧バージョンからの移行：文字列がA,B,C以外の場合のフォールバック
        level: Object.keys(LEVEL_MAP).includes(m.level) ? m.level : 'A',
        fixedPairMemberId: m.fixedPairMemberId ?? null,
        matchHistory: m.matchHistory || {},
        pairHistory: m.pairHistory || {},
        sortOrder: m.sortOrder ?? idx,
        memo: m.memo ?? ''
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
    } catch (e) { console.error("Failed to save data"); }
  }, [members, courts, nextMatches, matchHistory, config, nextMemberId, isInitialized]);

  useEffect(() => {
    if (activeTab !== 'members') {
      const sorted = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
      setDisplayMembers(sorted);
    }
  }, [members, activeTab]);

  // --- 共通ロジック ---
  const syncMemberUpdate = (updatedList: Member[]) => {
    setDisplayMembers(updatedList);
    setMembers(prev => prev.map(m => {
      const updated = updatedList.find(u => u.id === m.id);
      return updated ? { ...updated, sortOrder: m.sortOrder } : m;
    }));
  };

  // ブロック判定用のヘルパー
  const getLastPlayedBlock = (memberId: number, history: MatchRecord[], courtCount: number): number => {
    const idx = history.findIndex(h => h.playerIds.includes(memberId));
    if (idx === -1) return 9999;
    return Math.floor(idx / courtCount);
  };

  const getCompatibleCandidates = (baseLevel: BaseLevel | null, allActive: Member[]) => {
    if (!baseLevel) return allActive;
    return allActive.filter(m => LEVEL_MAP[m.level].includes(baseLevel));
  };

  // --- マッチングアルゴリズム本体 ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[], currentHistory: MatchRecord[]) => {
    const playingIds = new Set<number>();
    (currentCourts || []).forEach(c => { if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    let candidates = (currentMembers || []).filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // 1巡目優先（名簿順）
    if (config.orderFirstMatchByList) {
      const firstTimers = candidates.filter(m => m.playCount === 0).sort((a, b) => a.sortOrder - b.sortOrder);
      if (firstTimers.length >= 4) {
        const p = firstTimers.slice(0, 4);
        return { p1: p[0].id, p2: p[1].id, p3: p[2].id, p4: p[3].id };
      }
    }

    const courtCount = config.courtCount;

    // アルゴリズム実行: W,X,Y,Zを選出する1回分の試行
    const runTrial = (): Match | null => {
      let matchLevel: BaseLevel | null = null;
      let selection: Member[] = [];

      // 1. Wの選出
      let wCandidates = [...candidates];
      if (config.levelStrict) {
        // 厳格モード：その人が所属するいずれかのレベルで4人以上揃うレベルがある人のみ
        wCandidates = wCandidates.filter(m => 
          LEVEL_MAP[m.level].some(bl => getCompatibleCandidates(bl, candidates).length >= 4)
        );
      }
      if (wCandidates.length === 0) return null;

      const w = wCandidates.sort((a, b) => {
        if (a.playCount !== b.playCount) return a.playCount - b.playCount;
        const blockA = getLastPlayedBlock(a.id, currentHistory, courtCount);
        const blockB = getLastPlayedBlock(b.id, currentHistory, courtCount);
        if (blockA !== blockB) return blockB - blockA; // ブロックが古い(値が大きい)方を優先
        return Math.random() - 0.5;
      })[0];
      selection.push(w);

      const wLevels = LEVEL_MAP[w.level];
      if (wLevels.length === 1) matchLevel = wLevels[0];

      // 2. Xの選出
      const getXCandidates = () => {
        let list = candidates.filter(m => m.id !== w.id);
        // 2-1 & 2-2. 固定ペア優先
        const fixedPartner = list.find(m => m.id === w.fixedPairMemberId);
        if (fixedPartner) return [fixedPartner];
        
        // レベル制約
        if (config.levelStrict) {
          if (matchLevel) {
            list = list.filter(m => LEVEL_MAP[m.level].includes(matchLevel));
          } else {
            list = list.filter(m => LEVEL_MAP[m.level].some(bl => wLevels.includes(bl)));
          }
        }
        return list;
      };

      const xList = getXCandidates();
      if (xList.length === 0) return null;
      const x = xList.sort((a, b) => {
        const blockA = getLastPlayedBlock(a.id, currentHistory, courtCount);
        const blockB = getLastPlayedBlock(b.id, currentHistory, courtCount);
        if (a.playCount !== b.playCount) return a.playCount - b.playCount;
        if (blockA !== blockB) return blockB - blockA;
        if ((w.pairHistory[a.id] || 0) !== (w.pairHistory[b.id] || 0)) return (w.pairHistory[a.id] || 0) - (w.pairHistory[b.id] || 0);
        if ((w.matchHistory[a.id] || 0) !== (w.matchHistory[b.id] || 0)) return (w.matchHistory[a.id] || 0) - (w.matchHistory[b.id] || 0);
        return Math.random() - 0.5;
      })[0];
      selection.push(x);

      // レベルの確定（WとXの共通レベルが一つの場合）
      const commonWX = LEVEL_MAP[w.level].filter(l => LEVEL_MAP[x.level].includes(l));
      if (commonWX.length === 1) matchLevel = commonWX[0];

      // 3. Yの選出
      const getYCandidates = () => {
        let list = candidates.filter(m => !selection.find(s => s.id === m.id));
        if (config.levelStrict) {
          if (matchLevel) {
            list = list.filter(m => LEVEL_MAP[m.level].includes(matchLevel));
          } else {
            list = list.filter(m => LEVEL_MAP[m.level].some(bl => commonWX.includes(bl)));
          }
        }
        return list;
      };
      const yList = getYCandidates();
      if (yList.length === 0) return null;
      const y = yList.sort((a, b) => {
        const blockA = getLastPlayedBlock(a.id, currentHistory, courtCount);
        const blockB = getLastPlayedBlock(b.id, currentHistory, courtCount);
        if (a.playCount !== b.playCount) return a.playCount - b.playCount;
        if (blockA !== blockB) return blockB - blockA;
        const scoreA = (w.pairHistory[a.id] || 0) + (w.matchHistory[a.id] || 0) + (x.pairHistory[a.id] || 0) + (x.matchHistory[a.id] || 0);
        const scoreB = (w.pairHistory[b.id] || 0) + (w.matchHistory[b.id] || 0) + (x.pairHistory[b.id] || 0) + (x.matchHistory[b.id] || 0);
        return scoreA - scoreB;
      })[0];
      selection.push(y);

      // レベルの確定
      const commonWXY = commonWX.filter(l => LEVEL_MAP[y.level].includes(l));
      if (commonWXY.length === 1) matchLevel = commonWXY[0];

      // 4. Zの選出
      const getZCandidates = () => {
        let list = candidates.filter(m => !selection.find(s => s.id === m.id));
        const fixedPartnerY = list.find(m => m.id === y.fixedPairMemberId);
        if (fixedPartnerY) return [fixedPartnerY];
        
        if (config.levelStrict) {
          if (matchLevel) {
            list = list.filter(m => LEVEL_MAP[m.level].includes(matchLevel));
          } else {
            list = list.filter(m => LEVEL_MAP[m.level].some(bl => commonWXY.includes(bl)));
          }
        }
        return list;
      };
      const zList = getZCandidates();
      if (zList.length === 0) return null;
      const z = zList.sort((a, b) => {
        const blockA = getLastPlayedBlock(a.id, currentHistory, courtCount);
        const blockB = getLastPlayedBlock(b.id, currentHistory, courtCount);
        if (a.playCount !== b.playCount) return a.playCount - b.playCount;
        if (blockA !== blockB) return blockB - blockA;
        if ((y.pairHistory[a.id] || 0) !== (y.pairHistory[b.id] || 0)) return (y.pairHistory[a.id] || 0) - (y.pairHistory[b.id] || 0);
        if ((y.matchHistory[a.id] || 0) !== (y.matchHistory[b.id] || 0)) return (y.matchHistory[a.id] || 0) - (y.matchHistory[b.id] || 0);
        const scoreA = (w.pairHistory[a.id] || 0) + (w.matchHistory[a.id] || 0) + (x.pairHistory[a.id] || 0) + (x.matchHistory[a.id] || 0);
        const scoreB = (w.pairHistory[b.id] || 0) + (w.matchHistory[b.id] || 0) + (x.pairHistory[b.id] || 0) + (x.matchHistory[b.id] || 0);
        return scoreA - scoreB;
      })[0];
      selection.push(z);

      // 共通レベルの最終決定
      const finalCommon = commonWXY.filter(l => LEVEL_MAP[z.level].includes(l));
      if (finalCommon.length === 0) return null; // 4人に共通するレベルがない
      const finalLevel = matchLevel || finalCommon[0];

      return { p1: w.id, p2: x.id, p3: y.id, p4: z.id, level: finalLevel };
    };

    // 4パターン試行して、最適なものを採用
    const patterns: Match[] = [];
    for (let i = 0; i < 4; i++) {
      const res = runTrial();
      if (res) patterns.push(res);
    }

    if (patterns.length === 0) return null;

    const calculateCost = (m: Match) => {
      const p = [m.p1, m.p2, m.p3, m.p4].map(id => currentMembers.find(mem => mem.id === id)!);
      let totalInteraction = 0;
      const pairs = [[0,1], [2,3], [0,2], [0,3], [1,2], [1,3]];
      pairs.forEach(([i, j]) => {
        // 固定ペア同士の組み合わせコストは除外
        if (p[i].fixedPairMemberId === p[j].id) return;
        totalInteraction += (p[i].pairHistory[p[j].id] || 0) + (p[i].matchHistory[p[j].id] || 0);
      });
      return totalInteraction;
    };

    return patterns.sort((a, b) => calculateCost(a) - calculateCost(b))[0];
  };

  const regeneratePlannedMatches = (targetMembers?: Member[]) => {
    let tempMembers = JSON.parse(JSON.stringify(targetMembers || members)) as Member[];
    let tempHistory = JSON.parse(JSON.stringify(matchHistory)) as MatchRecord[];
    let planned: Court[] = [];
    for (let i = 0; i < config.courtCount; i++) {
      const match = getMatchForCourt(planned, tempMembers, tempHistory);
      if (match) {
        planned.push({ id: i + 1, match });
        const ids = [match.p1, match.p2, match.p3, match.p4];
        // 仮想的に履歴と回数を更新
        tempMembers = tempMembers.map(m => ids.includes(m.id) ? { ...m, playCount: m.playCount + 1 } : m);
        tempHistory = [{ id: 'temp', timestamp: '', courtId: i+1, players: [], playerIds: ids }, ...tempHistory];
      } else { planned.push({ id: i + 1, match: null }); }
    }
    setNextMatches(planned);
  };

  // --- UIコンポーネント: レベルバッジ ---
  const LevelBadge = ({ level, onClick }: { level: Level, onClick?: () => void }) => {
    const getStyle = (): React.CSSProperties => {
      const blue = '#2563eb';
      const yellow = '#eab308';
      const red = '#ef4444';
      if (level === 'A') return { backgroundColor: blue };
      if (level === 'B') return { backgroundColor: yellow };
      if (level === 'C') return { backgroundColor: red };
      if (level === 'A/B') return { background: `linear-gradient(90deg, ${blue} 50%, ${yellow} 50%)` };
      if (level === 'B/C') return { background: `linear-gradient(90deg, ${yellow} 50%, ${red} 50%)` };
      if (level === 'A/B/C') return { background: `linear-gradient(90deg, ${blue} 33.33%, ${yellow} 33.33% 66.66%, ${red} 66.66%)` };
      return { backgroundColor: '#94a3b8' };
    };

    return (
      <button 
        onClick={onClick}
        className="w-16 h-6 rounded text-[10px] font-black text-white flex items-center justify-center shadow-sm active:opacity-80 transition-opacity"
        style={getStyle()}
      >
        {level}
      </button>
    );
  };

  // --- 各種ハンドラ（既存ロジックの継承） ---
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
            newHistoryEntries.push({ id: Date.now().toString() + c.id, timestamp, courtId: c.id, players: names, playerIds: ids, level: c.match?.level });
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
          let current = [...prev], temp = JSON.parse(JSON.stringify(members)), tempHist = [...matchHistory];
          for (let i = 0; i < current.length; i++) {
            const m = getMatchForCourt(current, temp, tempHist);
            if (m) {
              const ids = [m.p1, m.p2, m.p3, m.p4], names = ids.map(id => temp.find((x: any) => x.id === id)?.name || '?');
              const rec = { id: Date.now().toString() + current[i].id, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: ids, level: m.level };
              setMatchHistory(prevH => [rec, ...prevH]);
              tempHist = [rec, ...tempHist];
              current[i] = { ...current[i], match: m };
              temp = calculateNextMemberState(temp, m.p1, m.p2, m.p3, m.p4);
              applyMatchToMembers(m.p1, m.p2, m.p3, m.p4);
            }
          }
          return current;
        });
      }, 200);
    }
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

  const applyMatchToMembers = (p1: number, p2: number, p3: number, p4: number) => {
    setMembers(prev => calculateNextMemberState(prev, p1, p2, p3, p4));
  };

  const handleLevelSelection = (memberId: number, newLevel: Level) => {
    const target = displayMembers.find(m => m.id === memberId);
    if (!target) return;
    const nextDisplay = displayMembers.map(m => {
      if (m.id === memberId || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) {
        return { ...m, level: newLevel };
      }
      return m;
    });
    if (!checkChangeConfirmation(nextDisplay)) return;
    syncMemberUpdate(nextDisplay);
    setEditingLevelMemberId(null);
  };

  // --- 判定/制御系 ---
  const memberFingerprint = useMemo(() => {
    try {
      const plannedIds = new Set<number>();
      nextMatches.forEach(c => {
        if (c?.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => plannedIds.add(id));
      });
      const status = (members || []).map(m => `${m.id}-${m.fixedPairMemberId || 'none'}-${plannedIds.has(m.id)}-${m.isActive}-${m.level}`).sort().join('|');
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

  // --- その他機能 ---
  const handleCourtCountChange = (count: number) => {
    const nextConfig = { ...config, courtCount: count };
    if (!checkChangeConfirmation(undefined, nextConfig)) return;
    setConfig(nextConfig);
    const adjust = (prev: Court[]) => {
      if (count > prev.length) return [...prev, ...Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }))];
      return prev.slice(0, count);
    };
    setCourts(prev => adjust(prev));
    setNextMatches(prev => adjust(prev));
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const now = new Date();
    const defaultMemo = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const newMember: Member = { 
      id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, 
      playCount: avgPlay, imputedPlayCount: avgPlay, lastPlayedTime: 0, 
      matchHistory: {}, pairHistory: {}, fixedPairMemberId: null,
      sortOrder: members.length, memo: defaultMemo
    };
    if (!checkChangeConfirmation([...members, newMember])) return;
    setMembers([...members, newMember]);
    setDisplayMembers([...displayMembers, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    const nextDisplay = displayMembers.map(m => {
      let nm = { ...m };
      if (m.id === memberId) nm.fixedPairMemberId = partnerId;
      if (partnerId && m.id === partnerId) nm.fixedPairMemberId = memberId;
      const oldTargetId = members.find(x => x.id === memberId)?.fixedPairMemberId;
      if (oldTargetId && m.id === oldTargetId && partnerId !== oldTargetId) nm.fixedPairMemberId = null;
      if (m.fixedPairMemberId === memberId && m.id !== partnerId) nm.fixedPairMemberId = null;
      return nm;
    });
    if (!checkChangeConfirmation(nextDisplay)) return;
    syncMemberUpdate(nextDisplay);
    setEditingPairMemberId(null);
  };

  const exportMembers = () => {
    const json = JSON.stringify(members.map(m => ({ id: m.id, name: m.name, level: m.level, fixedPairMemberId: m.fixedPairMemberId, sortOrder: m.sortOrder, memo: m.memo })), null, 2);
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
        if (!Array.isArray(data)) throw new Error();
        if (!confirm('名簿を復元します。現在のデータはリセットされますが、よろしいですか？')) return;
        const newMembers: Member[] = data.map((m, idx) => ({
          ...m, name: m.name || '?', level: Object.keys(LEVEL_MAP).includes(m.level) ? m.level : 'A', isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: m.fixedPairMemberId || null, sortOrder: m.sortOrder ?? idx, memo: m.memo ?? ''
        }));
        setMembers(newMembers);
        setMatchHistory([]);
        setCourts(prev => prev.map(c => ({ ...c, match: null })));
        setNextMatches(prev => prev.map(c => ({ ...c, match: null })));
        setNextMemberId(newMembers.length > 0 ? Math.max(...newMembers.map(m => m.id)) + 1 : 1);
        setHasUserConfirmedRegen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) { alert('復元に失敗しました。'); }
    };
    reader.readAsText(file);
  };

  const resetPlayCountsOnly = () => {
    if (confirm('全員の試合数と対戦履歴をリセットします。')) {
      const cleared = members.map(m => ({ ...m, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {} }));
      setMembers(cleared);
      setMatchHistory([]);
      setCourts(courts.map(c => ({ ...c, match: null })));
      setHasUserConfirmedRegen(false);
      if (config.bulkOnlyMode) regeneratePlannedMatches(cleared);
      else setNextMatches(nextMatches.map(c => ({ ...c, match: null })));
    }
  };

  const generateNextMatch = (courtId: number) => {
    if (config.bulkOnlyMode) return;
    const match = getMatchForCourt(courts, members, matchHistory);
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
    if (!name) return '1rem';
    const len = name.split('').reduce((acc, char) => acc + (/[\x20-\x7E]/.test(char) ? 0.6 : 1.0), 0);
    let base = len <= 2 ? '3.5rem' : len <= 4 ? '2.8rem' : len <= 6 ? '2rem' : len <= 8 ? '1.6rem' : '1.3rem';
    return `calc(${base} * ${mod})`;
  };

  // --- コートカード表示 ---
  const CourtCard = ({ court, isPlanned = false }: { court: Court, isPlanned?: boolean }) => {
    const h = 140 * config.zoomLevel;
    const border = isPlanned ? 'border-gray-500' : 'border-slate-900';
    const bg = isPlanned ? 'bg-gray-100' : 'bg-white';
    
    return (
      <div className={`relative rounded-xl shadow-md border overflow-hidden flex border-l-8 ${border} ${bg} ${isPlanned && !config.bulkOnlyMode ? 'opacity-80' : ''}`} style={{ height: `${h}px`, minHeight: `${h}px` }}>
        <div className={`w-10 shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${isPlanned ? 'bg-gray-200/50' : 'bg-slate-50'}`}>
          {!config.bulkOnlyMode && !isPlanned && court.match && (
            <button onClick={() => finishMatch(court.id)} className="absolute top-1 left-1 p-1 text-red-500 hover:bg-red-50 rounded-full z-10"><X size={16} strokeWidth={3} /></button>
          )}
          <span className={`font-black text-2xl ${isPlanned ? 'text-gray-500' : 'text-slate-900'}`}>{court.id}</span>
          {court.match?.level && (
            <div className="mt-1">
              <LevelBadge level={court.match.level as any} />
            </div>
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

            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {displayMembers.map((m, idx) => (
                <div key={m.id} draggable={true} onDragStart={() => setDraggedIndex(idx)} onDragOver={(e) => { e.preventDefault(); if (draggedIndex !== null && draggedIndex !== idx) { const newList = [...displayMembers]; const [moved] = newList.splice(draggedIndex, 1); newList.splice(idx, 0, moved); setDraggedIndex(idx); setDisplayMembers(newList); } }} onDragEnd={() => setDraggedIndex(null)} className={`p-4 flex items-center gap-2 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''} ${draggedIndex === idx ? 'opacity-20 bg-blue-100' : ''}`}>
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
                      <LevelBadge level={m.level} onClick={() => setEditingLevelMemberId(m.id)} />
                      <button onClick={() => setEditingPairMemberId(m.id)} className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}>{m.fixedPairMemberId ? <><LinkIcon size={12} />{displayMembers.find(x => x.id === m.fixedPairMemberId)?.name}</> : <><Unlink size={12} />ペアなし</>}</button>
                      <span className="text-xs text-gray-400 font-bold">試合数: {m.playCount}</span>
                    </div>
                  </div>
                  <button onClick={() => { const next = displayMembers.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x); if (checkChangeConfirmation(next)) syncMemberUpdate(next); }} className={`px-4 py-2 rounded-xl font-bold border-2 shrink-0 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => { if(confirm(`${m.name}を削除しますか？`)) { const next = displayMembers.filter(x => x.id !== m.id); if (checkChangeConfirmation(next)) { setDisplayMembers(next); setMembers(prev => prev.filter(x => x.id !== m.id)); } } }} className="text-gray-200 hover:text-red-500 px-2 shrink-0"><Trash2 size={24} /></button>
                </div>
              ))}
              {/* レベル選択モーダル */}
              {editingLevelMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingLevelMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-64 overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-2 text-sm font-bold border-b text-center">レベル選択</div>
                    <div className="p-2 grid grid-cols-1 gap-1">
                      {(Object.keys(LEVEL_MAP) as Level[]).map(lv => (
                        <button key={lv} onClick={() => handleLevelSelection(editingLevelMemberId, lv)} className="w-full flex justify-center py-3 hover:bg-gray-50 transition-colors">
                          <LevelBadge level={lv} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* ペア選択モーダル */}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-[calc(100%-2rem)] max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold text-lg">ペアを選択</h3><button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button></div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button onClick={() => updateFixedPair(editingPairMemberId, null)} className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b flex items-center gap-2"><Unlink size={16} /> ペアを解消</button>
                      {displayMembers.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && LEVEL_MAP[m.level].some(l => LEVEL_MAP[displayMembers.find(x => x.id === editingPairMemberId)!.level].includes(l)))
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
                  <tr key={h.id}><td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td><td className="p-4 font-bold text-base flex items-center gap-2">{h.level && <LevelBadge level={h.level as any} />}{h.players[0]}, {h.players[1]} <span className="text-gray-300 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}</td></tr>
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
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <span className="block text-sm font-bold text-gray-400 uppercase tracking-widest">名簿データの管理</span>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={exportMembers} className="py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm active:bg-indigo-700 transition-colors"><Download size={18} /> 退避(保存)</button>
                <button onClick={() => fileInputRef.current?.click()} className="py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl font-bold flex items-center justify-center gap-2 active:bg-indigo-50 transition-colors"><Upload size={18} /> 復元(読込)</button>
                <input type="file" ref={fileInputRef} onChange={importMembers} accept=".json" className="hidden" />
              </div>
            </div>
            <div className="flex items-center justify-between py-6 border-y border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">1巡目の試合は名簿順</span><span className="text-xs text-gray-400 leading-tight">未出場の人が4人以上いる場合、名簿の上位から割り当てます</span></div>
              <button onClick={() => { const next = { ...config, orderFirstMatchByList: !config.orderFirstMatchByList }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.orderFirstMatchByList ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.orderFirstMatchByList ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">レベル厳格モード</span><span className="text-xs text-gray-400 leading-tight">同一レベルに所属する人しか同じコートに入りません</span></div>
              <button onClick={() => { const next = { ...config, levelStrict: !config.levelStrict }; if (checkChangeConfirmation(undefined, next)) setConfig(next); }} className={`shrink-0 w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}><div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between py-6 border-b border-gray-50">
              <div className="flex-1 pr-4 flex flex-col"><span className="font-bold text-lg text-gray-700">一括進行モード</span><span className="text-xs text-gray-400 leading-tight">次回の予定が表示され、一括更新が可能になります</span></div>
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
