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
  ChevronDown,
  UserCheck,
  BarChart3,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// --- 型定義 ---
type LevelPattern = 'A/B/C' | 'A' | 'A/B' | 'B' | 'B/C' | 'C';
type LevelPriority = 'none' | 'weak' | 'strong' | 'forced';

interface Member {
  id: number;
  name: string;
  level: LevelPattern;
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
  levelPattern?: LevelPattern;
}

interface Court {
  id: number;
  name: string;
  isActive: boolean;
}

interface AppConfig {
  version: number;
  levelPriority: LevelPriority;
  bulkOnlyMode: boolean;
  orderFirstMatchByList: boolean;
  resetHistoryOnDayChange: boolean;
  lastAccessDate: string;
  nameFontSizeModifier: number;
  memoDefaultText: string;
}

interface HistoryEntry {
  timestamp: number;
  matches: Record<number, Match>;
  courts: Court[];
  snapshotMembers: Member[];
}

// --- レベルバッジ用コンポーネント ---
const LevelBadge = ({ level, className = \"\" }: { level: LevelPattern, className?: string }) => {
  const segments = level.split('/');
  return (
    <div className={`flex h-6 rounded overflow-hidden border border-black/10 font-bold text-[10px] w-12 shrink-0 ${className}`}>
      {segments.map((s, i) => (
        <div 
          key={i} 
          className={`flex-1 flex items-center justify-center text-white ${
            s === 'A' ? 'bg-blue-600' : s === 'B' ? 'bg-yellow-500' : 'bg-red-500'
          }`}
        >
          {s}
        </div>
      ))}
    </div>
  );
};

export default function DoublesApp() {
  // --- 状態定義 ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [currentMatches, setCurrentMatches] = useState<Record<number, Match>>({});
  const [nextMatches, setNextMatches] = useState<Record<number, Match>>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1); 
  const [config, setConfig] = useState<AppConfig>({
    version: 26,
    levelPriority: 'weak',
    bulkOnlyMode: true,
    orderFirstMatchByList: false,
    resetHistoryOnDayChange: true,
    lastAccessDate: new Date().toLocaleDateString(),
    nameFontSizeModifier: 0,
    memoDefaultText: new Date().getFullYear().toString().slice(-2) + ('0' + (new Date().getMonth() + 1)).slice(-2),
  });

  // UI用の一時状態
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberLevel, setNewMemberLevel] = useState<LevelPattern>('A/B/C');
  const [editingMemoId, setEditingMemoId] = useState<number | null>(null);
  const [editingMemoText, setEditingMemoText] = useState('');
  const [searchWord, setSearchWord] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapSource, setSwapSource] = useState<{ courtId: number; position: 'p1'|'p2'|'p3'|'p4' } | null>(null);
  const [draggedMemberId, setDraggedMemberId] = useState<number | null>(null);

  // --- 初期データロード & 互換性チェック ---
  useEffect(() => {
    const savedMembers = localStorage.getItem('dm_members');
    const savedCourts = localStorage.getItem('dm_courts');
    const savedCurrent = localStorage.getItem('dm_current_matches');
    const savedNext = localStorage.getItem('dm_next_matches');
    const savedHistory = localStorage.getItem('dm_history');
    const savedConfig = localStorage.getItem('dm_config');

    let loadedConfig: AppConfig | null = null;
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        loadedConfig = parsed;
      } catch (e) {}
    }

    const todayStr = new Date().toLocaleDateString();
    let shouldResetByDay = false;
    if (loadedConfig && loadedConfig.resetHistoryOnDayChange && loadedConfig.lastAccessDate !== todayStr) {
      shouldResetByDay = true;
    }

    if (savedMembers && !shouldResetByDay) {
      setMembers(JSON.parse(savedMembers));
    } else if (shouldResetByDay && savedMembers) {
      const parsedM = JSON.parse(savedMembers) as Member[];
      const resetM = parsedM.map(m => ({
        ...m,
        playCount: 0,
        imputedPlayCount: 0,
        lastPlayedTime: 0,
        matchHistory: {},
        pairHistory: {}
      }));
      setMembers(resetM);
    } else {
      const initialNames = ['選手1', '選手2', '選手3', '選手4', '選手5', '選手6', '選手7', '選手8'];
      const defMemo = new Date().getFullYear().toString().slice(-2) + ('0' + (new Date().getMonth() + 1)).slice(-2);
      setMembers(initialNames.map((name, i) => ({
        id: i + 1,
        name,
        level: 'A/B/C',
        isActive: true,
        playCount: 0,
        imputedPlayCount: 0,
        lastPlayedTime: 0,
        matchHistory: {},
        pairHistory: {},
        fixedPairMemberId: null,
        sortOrder: i + 1,
        memo: defMemo
      })));
    }

    if (savedCourts) {
      setCourts(JSON.parse(savedCourts));
    } else {
      setCourts([
        { id: 1, name: '1番コート', isActive: true },
        { id: 2, name: '2番コート', isActive: true },
        { id: 3, name: '3番コート', isActive: true },
      ]);
    }

    if (savedCurrent && !shouldResetByDay) setCurrentMatches(JSON.parse(savedCurrent));
    if (savedNext && !shouldResetByDay) setNextMatches(JSON.parse(savedNext));
    if (savedHistory && !shouldResetByDay) setHistory(JSON.parse(savedHistory));

    const newCfg: AppConfig = {
      version: 26,
      levelPriority: loadedConfig?.levelPriority ?? 'weak',
      bulkOnlyMode: loadedConfig?.bulkOnlyMode ?? true,
      orderFirstMatchByList: loadedConfig?.orderFirstMatchByList ?? false,
      resetHistoryOnDayChange: loadedConfig?.resetHistoryOnDayChange ?? true,
      lastAccessDate: todayStr,
      nameFontSizeModifier: loadedConfig?.nameFontSizeModifier ?? 0,
      memoDefaultText: loadedConfig?.memoDefaultText ?? new Date().getFullYear().toString().slice(-2) + ('0' + (new Date().getMonth() + 1)).slice(-2),
    };
    setConfig(newCfg);
    localStorage.setItem('dm_config', JSON.stringify(newCfg));
  }, []);

  // --- データ自動保存 ---
  useEffect(() => {
    if (members.length > 0) localStorage.setItem('dm_members', JSON.stringify(members));
  }, [members]);
  useEffect(() => {
    if (courts.length > 0) localStorage.setItem('dm_courts', JSON.stringify(courts));
  }, [courts]);
  useEffect(() => {
    localStorage.setItem('dm_current_matches', JSON.stringify(currentMatches));
  }, [currentMatches]);
  useEffect(() => {
    localStorage.setItem('dm_next_matches', JSON.stringify(nextMatches));
  }, [nextMatches]);
  useEffect(() => {
    localStorage.setItem('dm_history', JSON.stringify(history));
  }, [history]);
  useEffect(() => {
    if (config) localStorage.setItem('dm_config', JSON.stringify(config));
  }, [config]);

  // --- 次回予定のリアルタイム自動計算（一括更新モードOFF時用） ---
  const memberFingerprint = useMemo(() => {
    return members.map(m => `${m.id}:${m.isActive}:${m.level}:${m.fixedPairMemberId}`).join(',') + 
      `|${courts.map(c => `${c.id}:${c.isActive}`).join(',')}|${config.levelPriority}|${config.orderFirstMatchByList}`;
  }, [members, courts, config.levelPriority, config.orderFirstMatchByList]);

  useEffect(() => {
    if (!config.bulkOnlyMode && historyIndex === -1) {
      generateNextMatches();
    }
  }, [memberFingerprint, config.bulkOnlyMode, historyIndex]);

  // --- 組み合わせ生成ロジック (1コート分) ---
  const getMatchForCourt = (courtId: number, currentMembers: Member[]): Match | null => {
    const activeMembers = currentMembers.filter(m => m.isActive);
    if (activeMembers.length < 4) return null;

    if (config.orderFirstMatchByList) {
      const hasUnplayed = activeMembers.some(m => m.playCount === 0);
      if (hasUnplayed) {
        const unplayed = activeMembers.filter(m => m.playCount === 0)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (unplayed.length >= 4) {
          return { p1: unplayed[0].id, p2: unplayed[1].id, p3: unplayed[2].id, p4: unplayed[3].id };
        }
      }
    }

    const levelPriority = config.levelPriority;
    const attemptMatch = (priorityMode: LevelPriority): Match | null => {
      const sortedByPlay = [...activeMembers].sort((a, b) => {
        const cntA = a.imputedPlayCount;
        const cntB = b.imputedPlayCount;
        if (cntA !== cntB) return cntA - cntB;
        return a.lastPlayedTime - b.lastPlayedTime;
      });

      const minPlay = sortedByPlay[0].imputedPlayCount;
      const candidates = sortedByPlay.filter(m => m.imputedPlayCount <= minPlay + 1);
      if (candidates.length < 4) return null;

      const patterns: Member[][] = [];
      const loopCount = priorityMode === 'none' ? 4 : 1;

      for (let attempt = 0; attempt < loopCount; attempt++) {
        const pool = [...candidates].sort(() => Math.random() - 0.5);
        const pickMember = (selected: Member[], role: 'W'|'X'|'Y'|'Z'): Member | null => {
          for (const m of pool) {
            if (selected.some(s => s.id === m.id)) continue;
            if (role === 'X' && selected[0].fixedPairMemberId !== null && selected[0].fixedPairMemberId !== m.id) continue;
            if (role === 'X' && m.fixedPairMemberId !== null && m.fixedPairMemberId !== selected[0].id) continue;
            if (role === 'Z' && selected[1].fixedPairMemberId !== null && selected[1].fixedPairMemberId !== m.id) continue;
            if (role === 'Z' && m.fixedPairMemberId !== null && m.fixedPairMemberId !== selected[1].id) continue;

            if (role === 'X') {
              const p1 = selected[0];
              if (priorityMode === 'forced' && !p1.level.split('/').some(l => m.level.includes(l))) continue;
            }
            if (role === 'Y') {
              const p1 = selected[0];
              const p2 = selected[1];
              if (priorityMode === 'forced') {
                if (!p1.level.split('/').some(l => m.level.includes(l)) && !p2.level.split('/').some(l => m.level.includes(l))) continue;
              }
            }
            if (role === 'Z') {
              const p3 = selected[2];
              if (priorityMode === 'forced' && !p3.level.split('/').some(l => m.level.includes(l))) continue;
            }
            return m;
          }
          return null;
        };

        const s: Member[] = [];
        const W = pickMember(s, 'W'); if (W) s.push(W); else continue;
        const X = pickMember(s, 'X'); if (X) s.push(X); else continue;
        const Y = pickMember(s, 'Y'); if (Y) s.push(Y); else continue;
        const Z = pickMember(s, 'Z'); if (Z) s.push(Z); else continue;
        if (s.length === 4) patterns.push(s);
      }

      if (patterns.length === 0) return null;

      const best = patterns.reduce((prev, curr) => {
        const cost = (p: Member[]) => {
          let total = 0;
          total += (p[0].pairHistory[p[1].id] || 0) * 10;
          total += (p[2].pairHistory[p[3].id] || 0) * 10;
          total += (p[0].matchHistory[p[2].id] || 0) * 5;
          total += (p[0].matchHistory[p[3].id] || 0) * 5;
          total += (p[1].matchHistory[p[2].id] || 0) * 5;
          total += (p[1].matchHistory[p[3].id] || 0) * 5;

          if (priorityMode === 'strong') {
            if (!p[0].level.split('/').some(l => p[1].level.includes(l))) total += 50;
            if (!p[2].level.split('/').some(l => p[3].level.includes(l))) total += 50;
          } else if (priorityMode === 'weak') {
            if (!p[0].level.split('/').some(l => p[1].level.includes(l))) total += 10;
            if (!p[2].level.split('/').some(l => p[3].level.includes(l))) total += 10;
          }
          return total;
        };
        return cost(curr) < cost(prev) ? curr : prev;
      });

      return { p1: best[0].id, p2: best[1].id, p3: best[2].id, p4: best[3].id };
    };

    let match = attemptMatch(levelPriority);
    if (!match && levelPriority === 'forced') match = attemptMatch('strong');
    if (!match && (levelPriority === 'strong' || levelPriority === 'forced')) match = attemptMatch('weak');
    if (!match) match = attemptMatch('none');

    return match;
  };

  // --- 組み合わせ全体生成（複数パターンのシミュレーション方式に修正） ---
  const generateNextMatches = (activeCourtsList?: Court[], currentMembersList?: Member[]) => {
    const targetCourts = activeCourtsList || courts.filter(c => c.isActive);
    if (targetCourts.length === 0) return;

    const baseMembers = currentMembersList || members;
    const activeMembers = baseMembers.filter(m => m.isActive);

    let bestPatterns: Record<number, Match> | null = null;
    let minTotalCost = Infinity;

    // 100回の全体シミュレーションを実行して最もバランスの良い組み合わせを選ぶ
    for (let sim = 0; sim < 100; sim++) {
      let tempMembers = JSON.parse(JSON.stringify(baseMembers)) as Member[];
      const currentSimMatches: Record<number, Match> = {};
      
      // A方式: コートの処理順序をランダムにシャッフル
      const shuffledCourts = [...targetCourts].sort(() => Math.random() - 0.5);
      let successAll = true;

      for (const court of shuffledCourts) {
        // メンバーの探索順（同点時の選出パターン）を確率的に揺らすため、シャッフルして探索用引数へ渡す
        const shuffledTempMembers = [...tempMembers].sort(() => Math.random() - 0.5);
        const match = getMatchForCourt(court.id, shuffledTempMembers);
        
        if (match) {
          currentSimMatches[court.id] = match;
          const ids = [match.p1, match.p2, match.p3, match.p4];
          tempMembers = tempMembers.map(m => 
            ids.includes(m.id) ? { ...m, imputedPlayCount: m.imputedPlayCount + 1 } : m
          );
        } else {
          successAll = false;
          break;
        }
      } 

      if (!successAll) continue;

      // --- トータルコスト（評価スコア）の算出 ---
      let simCost = 0;

      // 1. 各コート内のコストの合計（既存のロジックベースの評価）
      for (const courtId in currentSimMatches) {
        const m = currentSimMatches[courtId];
        const p1 = baseMembers.find(x => x.id === m.p1)!;
        const p2 = baseMembers.find(x => x.id === m.p2)!;
        const p3 = baseMembers.find(x => x.id === m.p3)!;
        const p4 = baseMembers.find(x => x.id === m.p4)!;

        // ペア履歴ペナルティ (重み10)
        simCost += ((p1.pairHistory[p2.id] || 0) + (p3.pairHistory[p4.id] || 0)) * 10;
        // 対戦履歴ペナルティ (重み5)
        simCost += ((p1.matchHistory[p3.id] || 0) + (p1.matchHistory[p4.id] || 0) +
                    (p2.matchHistory[p3.id] || 0) + (p2.matchHistory[p4.id] || 0)) * 5;

        // 固定ペア制約の違反ペナルティ
        if (p1.fixedPairMemberId !== null && p1.fixedPairMemberId !== p2.id) simCost += 100;
        if (p2.fixedPairMemberId !== null && p2.fixedPairMemberId !== p1.id) simCost += 100;
        if (p3.fixedPairMemberId !== null && p3.fixedPairMemberId !== p4.id) simCost += 100;
        if (p4.fixedPairMemberId !== null && p4.fixedPairMemberId !== p3.id) simCost += 100;

        // レベル優先モードに応じたペナルティ
        if (config.levelPriority === 'strong' || config.levelPriority === 'forced') {
          if (!p1.level.split('/').some(l => p2.level.includes(l))) simCost += 50;
          if (!p3.level.split('/').some(l => p4.level.includes(l))) simCost += 50;
        } else if (config.levelPriority === 'weak') {
          if (!p1.level.split('/').some(l => p2.level.includes(l))) simCost += 10;
          if (!p3.level.split('/').some(l => p4.level.includes(l))) simCost += 10;
        }
      }

      // 2. 全コート全体の試合数格差ペナルティ
      const simulatedPlayCounts = activeMembers.map(m => {
        let isPlayed = 0;
        for (const courtId in currentSimMatches) {
          const match = currentSimMatches[courtId];
          if ([match.p1, match.p2, match.p3, match.p4].includes(m.id)) {
            isPlayed = 1;
            break;
          }
        }
        return m.playCount + isPlayed;
      });

      const maxPlay = Math.max(...simulatedPlayCounts);
      const minPlay = Math.min(...simulatedPlayCounts);
      const playDiff = maxPlay - minPlay;

      // 試合数の最大最少の差が2以上開く場合は、全体パターンに対して非常に重いペナルティを課す
      if (playDiff >= 2) {
        simCost += 100000 * playDiff;
      }

      if (simCost < minTotalCost) {
        minTotalCost = simCost; 
        bestPatterns = currentSimMatches;
      }
    }

    if (bestPatterns) {
      setNextMatches(bestPatterns);
    } else {
      // フォールバック（万が一シミュレーションが全滅した場合は、従来の数珠つなぎ方式で最低限生成）
      let tempMembers = JSON.parse(JSON.stringify(baseMembers)) as Member[];
      const fallbackMatches: Record<number, Match> = {};
      for (const court of targetCourts) {
        const match = getMatchForCourt(court.id, tempMembers);
        if (match) {
          fallbackMatches[court.id] = match; 
          const ids = [match.p1, match.p2, match.p3, match.p4];
          tempMembers = tempMembers.map(m => 
            ids.includes(m.id) ? { ...m, imputedPlayCount: m.imputedPlayCount + 1 } : m
          );
        }
      }
      setNextMatches(fallbackMatches);
    }
  };

  // --- 試合結果の確定 (コートごと or 一括) ---
  const applyMatchToMembers = (m: Match, currentMembers: Member[]): Member[] => {
    const ids = [m.p1, m.p2, m.p3, m.p4];
    return currentMembers.map(member => {
      if (!ids.includes(member.id)) return member;

      const nextMatchHistory = { ...member.matchHistory };
      const nextPairHistory = { ...member.pairHistory };

      if (member.id === m.p1) {
        nextPairHistory[m.p2] = (nextPairHistory[m.p2] || 0) + 1;
        nextMatchHistory[m.p3] = (nextMatchHistory[m.p3] || 0) + 1;
        nextMatchHistory[m.p4] = (nextMatchHistory[m.p4] || 0) + 1;
      } else if (member.id === m.p2) {
        nextPairHistory[m.p1] = (nextPairHistory[m.p1] || 0) + 1;
        nextMatchHistory[m.p3] = (nextMatchHistory[m.p3] || 0) + 1;
        nextMatchHistory[m.p4] = (nextMatchHistory[m.p4] || 0) + 1;
      } else if (member.id === m.p3) {
        nextPairHistory[m.p4] = (nextPairHistory[m.p4] || 0) + 1;
        nextMatchHistory[m.p1] = (nextMatchHistory[m.p1] || 0) + 1;
        nextMatchHistory[m.p2] = (nextMatchHistory[m.p2] || 0) + 1;
      } else if (member.id === m.p4) {
        nextPairHistory[m.p3] = (nextPairHistory[m.p3] || 0) + 1;
        nextMatchHistory[m.p1] = (nextMatchHistory[m.p1] || 0) + 1;
        nextMatchHistory[m.p2] = (nextMatchHistory[m.p2] || 0) + 1;
      }

      return {
        ...member,
        playCount: member.playCount + 1,
        imputedPlayCount: member.playCount + 1,
        lastPlayedTime: Date.now(),
        matchHistory: nextMatchHistory,
        pairHistory: nextPairHistory
      };
    });
  };

  const commitMatches = (targetMatches: Record<number, Match>) => {
    const courtIds = Object.keys(targetMatches).map(Number);
    if (courtIds.length === 0) return;

    let updatedMembers = [...members];
    courtIds.forEach(cid => {
      updatedMembers = applyMatchToMembers(targetMatches[cid], updatedMembers);
    });

    const targetCourts = courts.filter(c => courtIds.includes(c.id));
    const newEntry: HistoryEntry = {
      timestamp: Date.now(),
      matches: { ...targetMatches },
      courts: JSON.parse(JSON.stringify(targetCourts)),
      snapshotMembers: JSON.parse(JSON.stringify(members))
    };

    const updatedHistory = [newEntry, ...history].slice(0, 20);
    setHistory(updatedHistory);
    setHistoryIndex(-1); 
    setMembers(updatedMembers);
    setCurrentMatches(targetMatches);
    setNextMatches({});

    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  const handleBulkUpdate = () => {
    if (Object.keys(nextMatches).length === 0) {
      generateNextMatches();
    } else {
      commitMatches(nextMatches);
    }
  };

  const handleSingleCourtUpdate = (courtId: number) => {
    if (nextMatches[courtId]) {
      const singleMatch = { [courtId]: nextMatches[courtId] };
      commitMatches(singleMatch);
      if (!config.bulkOnlyMode) {
        generateNextMatches();
      }
    } else {
      const match = getMatchForCourt(courtId, members);
      if (match) {
        const singleMatch = { [courtId]: match };
        commitMatches(singleMatch);
        if (!config.bulkOnlyMode) {
          generateNextMatches();
        }
      }
    }
  };

  // --- 休み／参加の切り替え (みなし補正付き) ---
  const toggleMemberActive = (id: number) => {
    const activeCount = members.filter(m => m.isActive).length;
    const target = members.find(m => m.id === id);
    if (!target) return;

    if (target.isActive && activeCount <= 4) {
      alert('最低4人の参加メンバーが必要です。');
      return;
    }

    const nextActive = !target.isActive;
    let updatedMembers = members.map(m => m.id === id ? { ...m, isActive: nextActive } : m);

    if (nextActive) {
      const activePlayers = updatedMembers.filter(m => m.isActive && m.id !== id);
      if (activePlayers.length > 0) {
        const totalPlays = activePlayers.reduce((sum, m) => sum + m.playCount, 0);
        const avgPlays = Math.floor(totalPlays / activePlayers.length);
        if (target.playCount < avgPlays) {
          updatedMembers = updatedMembers.map(m => m.id === id ? { ...m, playCount: avgPlays, imputedPlayCount: avgPlays } : m);
        }
      }
    }

    setMembers(updatedMembers);
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  // --- 選手名簿の管理操作 ---
  const addMember = () => {
    if (!newMemberName.trim()) return;
    const maxId = members.reduce((max, m) => m.id > max ? m.id : max, 0);
    const maxOrder = members.reduce((max, m) => m.sortOrder > max ? m.sortOrder : max, 0);

    const activePlayers = members.filter(m => m.isActive);
    let startPlayCount = 0;
    if (activePlayers.length > 0) {
      const totalPlays = activePlayers.reduce((sum, m) => sum + m.playCount, 0);
      startPlayCount = Math.floor(totalPlays / activePlayers.length);
    }

    const newMember: Member = {
      id: maxId + 1,
      name: newMemberName.trim(),
      level: newMemberLevel,
      isActive: true,
      playCount: startPlayCount,
      imputedPlayCount: startPlayCount,
      lastPlayedTime: 0,
      matchHistory: {},
      pairHistory: {},
      fixedPairMemberId: null,
      sortOrder: maxOrder + 1,
      memo: config.memoDefaultText
    };

    const updatedMembers = [...members, newMember];
    setMembers(updatedMembers);
    setNewMemberName('');
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  const deleteMember = (id: number) => {
    if (members.filter(m => m.isActive).length <= 4 && members.find(m => m.id === id)?.isActive) {
      alert('アクティブな選手が4人未満になるため削除できません。');
      return;
    }
    if (!confirm('本当に削除しますか？')) return;

    const updatedMembers = members.filter(m => m.id !== id).map(m => {
      if (m.fixedPairMemberId === id) return { ...m, fixedPairMemberId: null };
      return m;
    });
    setMembers(updatedMembers);
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  const changeMemberLevel = (id: number, level: LevelPattern) => {
    const updatedMembers = members.map(m => {
      if (m.id === id) return { ...m, level };
      if (m.fixedPairMemberId === id) return { ...m, level }; 
      return m;
    });
    setMembers(updatedMembers);
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  const toggleFixedPair = (id1: number, id2: number | null) => {
    const updatedMembers = members.map(m => {
      if (m.id === id1) {
        return { ...m, fixedPairMemberId: id2 };
      }
      if (id2 !== null && m.id === id2) {
        return { ...m, fixedPairMemberId: id1 };
      }
      if (m.fixedPairMemberId === id1 && m.id !== id2) {
        return { ...m, fixedPairMemberId: null };
      }
      if (id2 !== null && m.fixedPairMemberId === id2 && m.id !== id1) {
        return { ...m, fixedPairMemberId: null };
      }
      return m;
    });
    setMembers(updatedMembers);
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), updatedMembers);
    }
  };

  // メモ編集処理
  const startEditingMemo = (m: Member) => {
    setEditingMemoId(m.id);
    setEditingMemoText(m.memo || '');
  };

  const saveMemo = (id: number) => {
    const updated = members.map(m => m.id === id ? { ...m, memo: editingMemoText.trim().slice(0, 8) } : m);
    setMembers(updated);
    setEditingMemoId(null);
  };

  // --- 並び替え機能 (D&D + ソート) ---
  const handleDragStart = (id: number) => { 
    setDraggedMemberId(id); 
  };

  const handleDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedMemberId === null || draggedMemberId === targetId) return;

    const draggedIndex = members.findIndex(m => m.id === draggedMemberId);
    const targetIndex = members.findIndex(m => m.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;

    const newMembers = [...members];
    const [removed] = newMembers.splice(draggedIndex, 1);
    newMembers.splice(targetIndex, 0, removed);

    const reordered = newMembers.map((m, idx) => ({ ...m, sortOrder: idx + 1 }));
    setMembers(reordered);
  };

  const handleDragEnd = () => {
    setDraggedMemberId(null);
  };

  const sortMembersByName = () => {
    const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    setMembers(sorted.map((m, i) => ({ ...m, sortOrder: i + 1 })));
  };

  const sortMembersByLevel = () => {
    const levelOrder: Record<LevelPattern, number> = { 'A': 1, 'A/B': 2, 'B': 3, 'B/C': 4, 'C': 5, 'A/B/C': 6 };
    const sorted = [...members].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
    setMembers(sorted.map((m, i) => ({ ...m, sortOrder: i + 1 })));
  };

  const sortMembersByMemo = () => {
    const sorted = [...members].sort((a, b) => (a.memo || '').localeCompare(b.memo || '', 'ja'));
    setMembers(sorted.map((m, i) => ({ ...m, sortOrder: i + 1 })));
  };

  const sortMembersByPlayCount = () => {
    const sorted = [...members].sort((a, b) => a.playCount - b.playCount);
    setMembers(sorted.map((m, i) => ({ ...m, sortOrder: i + 1 })));
  };

  const displayMembers = useMemo(() => {
    let result = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
    if (searchWord.trim()) {
      result = result.filter(m => m.name.includes(searchWord.trim()) || (m.memo && m.memo.includes(searchWord.trim())));
    }
    return result;
  }, [members, searchWord]);

  // --- 試合画面でのメンバー入れ替え操作 ---
  const startSwap = (courtId: number, position: 'p1'|'p2'|'p3'|'p4') => {
    setIsSwapping(true);
    setSwapSource({ courtId, position });
  };

  const executeSwapWithMember = (targetMemberId: number) => {
    if (!swapSource) return;
    const { courtId, position } = swapSource;
    const isBulk = config.bulkOnlyMode;
    const matchMap = isBulk ? nextMatches : currentMatches;
    const targetMatch = matchMap[courtId];
    if (!targetMatch) return;

    const oldMemberId = targetMatch[position];
    if (oldMemberId === targetMemberId) {
      setIsSwapping(false);
      setSwapSource(null);
      return;
    }

    // 最新の対戦（完了前）のコート内メンバー同士の入れ替えか確認
    let isInternalSwap = false;
    if (!isBulk) {
      isInternalSwap = [targetMatch.p1, targetMatch.p2, targetMatch.p3, targetMatch.p4].includes(targetMemberId);
    }

    const nextMatch = { ...targetMatch, [position]: targetMemberId };
    const nextMatchMap = { ...matchMap, [courtId]: nextMatch };

    if (isBulk) {
      setNextMatches(nextMatchMap);
    } else {
      setCurrentMatches(nextMatchMap);
      let temp = [...members];

      // コート内同士の入れ替えでなければ、試合数の増減を正しく適用
      if (!isInternalSwap) {
        temp = temp.map(x => x.id === oldMemberId ? { ...x, playCount: Math.max(0, x.playCount - 1), imputedPlayCount: Math.max(0, x.imputedPlayCount - 1) } : x);
        temp = temp.map(x => x.id === targetMemberId ? { ...x, playCount: x.playCount + 1, imputedPlayCount: x.imputedPlayCount + 1, lastPlayedTime: Date.now() } : x);
      }
      
      if (history.length > 0 && historyIndex === -1) {
        const updatedHistory = [...history];
        updatedHistory[0] = { ...updatedHistory[0], matches: nextMatchMap };
        setHistory(updatedHistory);
      }
      setMembers(temp);
    }

    setIsSwapping(false);
    setSwapSource(null);
  };

  // --- 履歴ブラウザ（フリック/ボタン対応） ---
  const loadHistoryEntry = (idx: number) => {
    if (idx === -1) {
      const savedCurrent = localStorage.getItem('dm_current_matches');
      const savedNext = localStorage.getItem('dm_next_matches');
      const savedMembers = localStorage.getItem('dm_members');
      setCurrentMatches(savedCurrent ? JSON.parse(savedCurrent) : {});
      setNextMatches(savedNext ? JSON.parse(savedNext) : {});
      if (savedMembers) setMembers(JSON.parse(savedMembers));
      setHistoryIndex(-1);
    } else {
      const entry = history[idx];
      setCurrentMatches(entry.matches);
      setNextMatches({});
      setMembers(entry.snapshotMembers);
      setHistoryIndex(idx);
    }
  };

  // --- コート設定の管理 --- 
  const toggleCourtActive = (id: number) => {
    const updated = courts.map(c => c.id === id ? { ...c, isActive: !c.isActive } : c);
    const activeCourts = updated.filter(c => c.isActive);
    if (activeCourts.length === 0) {
      alert('最低1つのコートを有効にする必要があります。');
      return;
    }
    setCourts(updated);

    if (config.bulkOnlyMode) {
      const nextMatchMap = { ...nextMatches };
      courts.forEach(c => { 
        if (c.isActive && !updated.find(u => u.id === c.id)?.isActive) delete nextMatchMap[c.id];
      });
      setNextMatches(nextMatchMap);
      generateNextMatches(activeCourts, members);
    }
  };

  const addCourt = () => {
    const maxId = courts.reduce((max, c) => c.id > max ? c.id : max, 0);
    const updated = [...courts, { id: maxId + 1, name: `${maxId + 1}番コート`, isActive: true }];
    setCourts(updated);
  };

  const deleteCourt = (id: number) => {
    if (courts.length <= 1) {
      alert('これ以上コートを削除できません。');
      return;
    }
    if (!confirm('コートを削除しますか？')) return;
    const updated = courts.filter(c => c.id !== id);
    setCourts(updated);
    const nextMatchMap = { ...nextMatches };
    delete nextMatchMap[id];
    setNextMatches(nextMatchMap);
  };

  const renameCourt = (id: number, name: string) => {
    if (!name.trim()) return;
    setCourts(courts.map(c => c.id === id ? { ...c, name: name.trim() } : c));
  };

  // --- データの完全初期化・インポート/エクスポート ---
  const resetPlayCountsOnly = () => {
    if (!confirm('全員の試合数と対戦履歴をリセットしますか？(名簿や設定は残ります)')) return;
    const reset = members.map(m => ({
      ...m,
      playCount: 0,
      imputedPlayCount: 0,
      lastPlayedTime: 0,
      matchHistory: {},
      pairHistory: {}
    }));
    setMembers(reset);
    setCurrentMatches({});
    setNextMatches({});
    setHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem('dm_current_matches');
    localStorage.removeItem('dm_next_matches');
    localStorage.removeItem('dm_history');
    if (config.bulkOnlyMode) {
      generateNextMatches(courts.filter(c => c.isActive), reset);
    }
  };

  const exportData = () => {
    const data = { members, courts, currentMatches, nextMatches, history, config };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dm_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target?.result as string);
        if (data.members) setMembers(data.members);
        if (data.courts) setCourts(data.courts);
        if (data.currentMatches) setCurrentMatches(data.currentMatches);
        if (data.nextMatches) setNextMatches(data.nextMatches);
        if (data.history) setHistory(data.history);
        if (data.config) setConfig({ ...config, ...data.config, version: 26 });
        setHistoryIndex(-1);
        alert('データをインポートしました。');
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。正しい形式のJSONを選択してください。');
      }
    };
    reader.readAsText(file);
  };

  // 選手名表示サイズ計算用のヘルパー
  const nameFontClass = (baseSize: string) => {
    const mod = config.nameFontSizeModifier || 0;
    if (baseSize === 'text-lg') {
      if (mod === -1) return 'text-base';
      if (mod === 1) return 'text-xl';
      return 'text-lg';
    }
    if (baseSize === 'text-sm') {
      if (mod === -1) return 'text-xs';
      if (mod === 1) return 'text-base';
      return 'text-sm';
    }
    return baseSize;
  };

  // --- 画面描画用オブジェクト --- 
  const activeCourts = courts.filter(c => c.isActive);
  const isNextReady = Object.keys(nextMatches).length > 0;
  const isHistoryMode = historyIndex !== -1;

  return (
    <div className=\"min-h-screen bg-gray-100 pb-24 text-gray-900 font-sans select-none overflow-x-hidden\">
      {/* ヘッダー */}
      <header className=\"bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-md sticky top-0 z-40 px-4 py-3 flex items-center justify-between pb-safe-top\">
        <div className=\"flex items-center gap-2\">
          <Trophy className=\"text-yellow-400 animate-pulse\" size={24} />
          <h1 className=\"text-xl font-black tracking-wider\">D Maker</h1>
          {isHistoryMode && (
            <span className=\"bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 animate-bounce\">
              履歴閲覧中 ({historyIndex + 1}/{history.length})
            </span>
          )}
        </div>
        <div className=\"text-xs bg-white/20 px-3 py-1 rounded-full font-medium backdrop-blur-sm\">
          参加:{members.filter(m => m.isActive).length}人 / 割当:{activeCourts.length * 4}人
        </div>
      </header>

      {/* 入れ替え操作のオーバーレイ案内 */}
      {isSwapping && (
        <div className=\"bg-yellow-500 text-yellow-950 px-4 py-2 text-center text-sm font-bold flex items-center justify-center gap-2 shadow-inner animate-fade-in sticky top-[52px] z-50\">
          <AlertCircle size={16} />
          <span>入れ替える選手をタップするか、下の名簿から選んでください</span>
          <button onClick={() => { setIsSwapping(false); setSwapSource(null); }} className=\"ml-2 bg-yellow-700 text-white rounded px-2 py-0.5 text-xs active:bg-yellow-800\">キャンセル</button>
        </div>
      )}

      <main className=\"max-w-md mx-auto p-4 space-y-4\">
        {/* 1. 試合画面 */}
        {activeTab === 'dashboard' && (
          <div className=\"space-y-4 animate-fade-in\">
            {/* 履歴ブラウザの操作パネル（履歴がある場合のみ表示） */}
            {history.length > 0 && (
              <div className=\"bg-white rounded-2xl p-3 shadow-sm border border-gray-200 flex items-center justify-between gap-2\">
                <button 
                  disabled={historyIndex >= history.length - 1} 
                  onClick={() => loadHistoryEntry(historyIndex + 1)} 
                  className=\"flex-1 py-2 bg-gray-100 rounded-xl flex items-center justify-center gap-1 font-bold text-sm text-gray-700 disabled:opacity-40 active:bg-gray-200 transition-colors\"
                >
                  <ChevronLeft size={16} /> 前の試合
                </button>
                <button 
                  disabled={historyIndex === -1} 
                  onClick={() => loadHistoryEntry(historyIndex - 1)} 
                  className=\"flex-1 py-2 bg-gray-100 rounded-xl flex items-center justify-center gap-1 font-bold text-sm text-gray-700 disabled:opacity-40 active:bg-gray-200 transition-colors\"
                >
                  次へ <ChevronRight size={16} />
                </button>
                {isHistoryMode && (
                  <button 
                    onClick={() => loadHistoryEntry(-1)} 
                    className=\"px-3 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold text-sm border border-blue-100 active:bg-blue-100 transition-colors\"
                  >
                    最新に戻る
                  </button>
                )}
              </div>
            )}

            {/* 各コートカード */}
            {activeCourts.map(court => {
              const match = isNextReady ? nextMatches[court.id] : currentMatches[court.id];
              const p1 = match ? members.find(m => m.id === match.p1) : null;
              const p2 = match ? members.find(m => m.id === match.p2) : null;
              const p3 = match ? members.find(m => m.id === match.p3) : null;
              const p4 = match ? members.find(m => m.id === match.p4) : null;

              return (
                <div key={court.id} className={`bg-white rounded-3xl shadow-sm border overflow-hidden transition-all duration-300 ${isNextReady ? 'border-amber-300 ring-4 ring-amber-100' : 'border-gray-200'}`}>
                  {/* コートヘッダー */}
                  <div className={`px-4 py-2.5 flex items-center justify-between ${isNextReady ? 'bg-amber-500 text-white' : 'bg-gray-50 border-b text-gray-700'}`}>
                    <div className=\"flex items-center gap-2\">
                      <span className=\"font-black tracking-tight text-sm\">{court.name}</span>
                      {isNextReady && <span className=\"bg-white text-amber-600 font-extrabold text-[10px] px-2 py-0.5 rounded-full shadow-sm\">次回の予定</span>}
                    </div>
                    {!isHistoryMode && (
                      <button 
                        onClick={() => handleSingleCourtUpdate(court.id)} 
                        className={`px-3 py-1 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 ${isNextReady ? 'bg-white text-amber-600 active:bg-amber-50' : 'bg-blue-600 text-white active:bg-blue-700'}`}
                      >
                        {isNextReady ? 'このコートのみ確定' : '個別割当'}
                      </button>
                    )}
                  </div>

                  {/* コート内対戦表レイアウト */}
                  <div className=\"p-4 flex items-center justify-center gap-2 bg-gradient-to-b from-white to-gray-50/50\">
                    {match && p1 && p2 && p3 && p4 ? (
                      <div className=\"w-full flex items-center justify-between gap-1\">
                        {/* ペア1 (左側) */}
                        <div className=\"flex-1 space-y-2\">
                          <button onClick={() => startSwap(court.id, 'p1')} className={`w-full p-2.5 rounded-xl border bg-white shadow-sm flex flex-col items-stretch justify-center text-left transition-all active:bg-gray-50 ${swapSource?.courtId === court.id && swapSource?.position === 'p1' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-100'}`}>
                            <span className={`font-bold tracking-tight text-gray-800 leading-tight ${nameFontClass('text-lg')}`}>{p1.name}</span>
                            <div className=\"flex items-center justify-between mt-1 text-gray-400 text-[10px] font-medium\">
                              <span>{p1.memo || '-'}</span>
                              <span>{p1.playCount}回</span>
                            </div>
                          </button>
                          <button onClick={() => startSwap(court.id, 'p2')} className={`w-full p-2.5 rounded-xl border bg-white shadow-sm flex flex-col items-stretch justify-center text-right transition-all active:bg-gray-50 ${swapSource?.courtId === court.id && swapSource?.position === 'p2' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-100'}`}>
                            <span className={`font-bold tracking-tight text-gray-800 leading-tight ${nameFontClass('text-lg')}`}>{p2.name}</span>
                            <div className=\"flex items-center justify-between mt-1 text-gray-400 text-[10px] font-medium\">
                              <span>{p2.playCount}回</span>
                              <span>{p2.memo || '-'}</span>
                            </div>
                          </button>
                        </div>

                        {/* VSディバイダー */}
                        <div className=\"flex flex-col items-center justify-center px-1\">
                          <span className=\"text-xs font-black italic tracking-widest text-gray-300 bg-gray-100 px-2 py-1 rounded-md border border-gray-200/60 shadow-inner\">VS</span>
                        </div>

                        {/* ペア2 (右側) */}
                        <div className=\"flex-1 space-y-2\">
                          <button onClick={() => startSwap(court.id, 'p3')} className={`w-full p-2.5 rounded-xl border bg-white shadow-sm flex flex-col items-stretch justify-center text-left transition-all active:bg-gray-50 ${swapSource?.courtId === court.id && swapSource?.position === 'p3' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-100'}`}>
                            <span className={`font-bold tracking-tight text-gray-800 leading-tight ${nameFontClass('text-lg')}`}>{p3.name}</span>
                            <div className=\"flex items-center justify-between mt-1 text-gray-400 text-[10px] font-medium\">
                              <span>{p3.memo || '-'}</span>
                              <span>{p3.playCount}回</span>
                            </div>
                          </button>
                          <button onClick={() => startSwap(court.id, 'p4')} className={`w-full p-2.5 rounded-xl border bg-white shadow-sm flex flex-col items-stretch justify-center text-right transition-all active:bg-gray-50 ${swapSource?.courtId === court.id && swapSource?.position === 'p4' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-gray-100'}`}>
                            <span className={`font-bold tracking-tight text-gray-800 leading-tight ${nameFontClass('text-lg')}`}>{p4.name}</span>
                            <div className=\"flex items-center justify-between mt-1 text-gray-400 text-[10px] font-medium\">
                              <span>{p4.playCount}回</span>
                              <span>{p4.memo || '-'}</span>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className=\"text-center py-6 text-gray-400 font-bold text-sm tracking-tight\">メンバー未割当</div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 下部一括操作ボタン (履歴モード時は非表示) */}
            {!isHistoryMode && (
              <div className=\"pt-2\">
                <button 
                  onClick={handleBulkUpdate} 
                  className={`w-full py-4 rounded-2xl font-black text-lg shadow-md tracking-wider flex items-center justify-center gap-2 border transition-all active:scale-[0.99] active:opacity-90 ${
                    isNextReady 
                      ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white border-amber-400 animate-pulse'
                      : 'bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-blue-500'
                  }`}
                >
                  {isNextReady ? '次回の予定を全て確定する' : '次回の予定を一括更新'} 
                </button>
              </div>
            )}

            {/* 待機メンバー一覧パネル */}
            <div className=\"bg-white rounded-3xl p-4 shadow-sm border border-gray-200\">
              <h3 className=\"text-xs font-black text-gray-400 tracking-wider uppercase mb-3\">現在の待機メンバー</h3>
              <div className=\"flex flex-wrap gap-1.5\">
                {members.filter(m => m.isActive).map(m => {
                  let isPlayingNow = false;
                  const matchMap = isNextReady ? nextMatches : currentMatches;
                  Object.values(matchMap).forEach(match => {
                    if ([match.p1, match.p2, match.p3, match.p4].includes(m.id)) isPlayingNow = true;
                  });

                  if (isPlayingNow) return null;
                  return (
                    <button 
                      key={m.id} 
                      onClick={() => isSwapping ? executeSwapWithMember(m.id) : toggleMemberActive(m.id)} 
                      className={`px-3 py-1.5 rounded-xl text-sm font-bold border shadow-sm transition-all flex items-center gap-1.5 active:scale-95 ${isSwapping ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-gray-50 border-gray-200 text-gray-700 active:bg-gray-100'}`}
                    >
                      <span className={nameFontClass('text-sm')}>{m.name}</span>
                      <span className=\"text-[10px] bg-gray-200 text-gray-500 rounded px-1 font-mono\">{m.playCount}</span>
                    </button>
                  );
                })}
                {members.filter(m => m.isActive).every(m => {
                  const matchMap = isNextReady ? nextMatches : currentMatches;
                  return Object.values(matchMap).some(match => [match.p1, match.p2, match.p3, match.p4].includes(m.id));
                }) && (
                  <div className=\"text-xs font-bold text-gray-400 py-1\">待機中の選手はいません</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 2. 名簿管理画面 */}
        {activeTab === 'members' && (
          <div className=\"space-y-4 animate-fade-in\">
            {/* クイック追加フォーム */}
            <div className=\"bg-white rounded-2xl p-3 shadow-sm border border-gray-200 flex items-center gap-2\">
              <input 
                type=\"text\" 
                placeholder=\"選手名を入力...\" 
                value={newMemberName} 
                onChange={(e) => setNewMemberName(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && addMember()} 
                className=\"flex-1 px-3 py-2 border rounded-xl bg-gray-50 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500\" 
              />
              <div className=\"relative h-9 shrink-0 flex items-center border rounded-xl bg-gray-50 px-2\">
                <select 
                  value={newMemberLevel} 
                  onChange={(e) => setNewMemberLevel(e.target.value as LevelPattern)} 
                  className=\"opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10\" 
                >
                  <option value=\"A/B/C\">A/B/C</option>
                  <option value=\"A\">A</option>
                  <option value=\"A/B\">A/B</option>
                  <option value=\"B\">B</option>
                  <option value=\"B/C\">B/C</option>
                  <option value=\"C\">C</option>
                </select>
                <LevelBadge level={newMemberLevel} />
                <ChevronDown size={12} className=\"text-gray-400 ml-1\" />
              </div>
              <button onClick={addMember} className=\"p-2 bg-blue-600 text-white rounded-xl shadow-sm active:bg-blue-700 transition-colors shrink-0\">
                <Plus size={20} />
              </button>
            </div>

            {/* 検索・ソートツールバー */}
            <div className=\"bg-white rounded-2xl p-3 shadow-sm border border-gray-200 space-y-2\">
              <input 
                type=\"text\" 
                placeholder=\"選手名・メモで検索...\" 
                value={searchWord} 
                onChange={(e) => setSearchWord(e.target.value)} 
                className=\"w-full px-3 py-1.5 border rounded-xl bg-gray-50 font-medium text-xs focus:outline-none focus:ring-2 focus:ring-blue-500\" 
              />
              <div className=\"flex flex-wrap gap-1 pt-1\">
                <button onClick={sortMembersByPlayCount} className=\"px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold rounded-lg flex items-center gap-1 active:bg-gray-100\">
                  <BarChart3 size={12} /> 試合数順
                </button>
                <button onClick={sortMembersByName} className=\"px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold rounded-lg flex items-center gap-1 active:bg-gray-100\">
                  <SortAsc size={12} /> 名前順
                </button>
                <button onClick={sortMembersByLevel} className=\"px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold rounded-lg flex items-center gap-1 active:bg-gray-100\">
                  <UserCheck size={12} /> レベル順
                </button>
                <button onClick={sortMembersByMemo} className=\"px-2 py-1 bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold rounded-lg flex items-center gap-1 active:bg-gray-100\">
                  <StickyNote size={12} /> メモ順
                </button>
              </div>
            </div>

            {/* 選手リスト（ドラッグ＆ドロップ対応） */}
            <div className=\"space-y-2\">
              {displayMembers.map((m) => (
                <div 
                  key={m.id} 
                  draggable
                  onDragStart={() => handleDragStart(m.id)}
                  onDragOver={(e) => handleDragOver(e, m.id)}
                  onDragEnd={handleDragEnd}
                  className={`bg-white rounded-2xl p-3 shadow-sm border flex items-center justify-between gap-2 transition-all ${
                    m.isActive ? 'border-gray-200' : 'border-gray-200 opacity-50 bg-gray-50'
                  } ${draggedMemberId === m.id ? 'opacity-30 border-blue-400 border-dashed' : ''}`}
                >
                  {/* ドラッグハンドル ＋ 参加インジケータ */}
                  <div className=\"flex items-center gap-2 flex-1 min-w-0\">
                    <div className=\"cursor-grab active:cursor-grabbing text-gray-300 p-0.5 hover:text-gray-400 transition-colors shrink-0\">
                      <GripVertical size={16} />
                    </div>
                    <button 
                      onClick={() => toggleMemberActive(m.id)} 
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                        m.isActive 
                          ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-200' 
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {m.isActive && <span className=\"text-xs font-black\">✓</span>}
                    </button>
                    
                    {/* 名前 ＋ 試合数表示 */}
                    <div className=\"flex flex-col min-w-0 flex-1\">
                      <span className={`font-bold text-gray-800 truncate ${nameFontClass('text-base')}`}>{m.name}</span>
                      <span className=\"text-[10px] font-bold text-gray-400 mt-0.5\">試合数: {m.playCount}回</span>
                    </div>
                  </div>

                  {/* アクションエリア (レベル、ペア、メモ、削除) */}
                  <div className=\"flex items-center gap-1.5 shrink-0\">
                    {/* メモ欄（インライン編集対応） */}
                    {editingMemoId === m.id ? (
                      <div className=\"flex items-center border rounded-xl overflow-hidden bg-gray-50\">
                        <input 
                          type=\"text\" 
                          maxLength={8} 
                          value={editingMemoText} 
                          onChange={(e) => setEditingMemoText(e.target.value)} 
                          className=\"w-16 px-1.5 py-1 text-xs bg-transparent font-bold focus:outline-none\" 
                          autoFocus 
                        />
                        <button onClick={() => saveMemo(m.id)} className=\"p-1 bg-green-600 text-white active:bg-green-700\">
                          <Save size={12} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => startEditingMemo(m)} 
                        className=\"px-2 py-1 bg-gray-50 border border-gray-200 rounded-xl text-[10px] font-bold text-gray-500 max-w-[70px] truncate active:bg-gray-100\"
                      >
                        {m.memo || 'メモ追加'}
                      </button>
                    )}

                    {/* レベル選択リスト */} 
                    <div className=\"relative flex items-center border rounded-xl bg-gray-50 px-1.5 py-1 text-xs shadow-sm\">
                      <select 
                        value={m.level} 
                        onChange={(e) => changeMemberLevel(m.id, e.target.value as LevelPattern)} 
                        className=\"opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10\" 
                      >
                        <option value=\"A/B/C\">A/B/C</option>
                        <option value=\"A\">A</option>
                        <option value=\"A/B\">A/B</option>
                        <option value=\"B\">B</option>
                        <option value=\"B/C\">B/C</option>
                        <option value=\"C\">C</option>
                      </select>
                      <LevelBadge level={m.level} />
                      <ChevronDown size={10} className=\"text-gray-400 ml-0.5\" />
                    </div>

                    {/* 固定ペアピン */} 
                    <div className=\"relative flex items-center border rounded-xl bg-gray-50 px-1.5 py-1 shadow-sm\">
                      <select 
                        value={m.fixedPairMemberId || ''} 
                        onChange={(e) => {
                          const val = e.target.value ? Number(e.target.value) : null;
                          toggleFixedPair(m.id, val);
                        }} 
                        className=\"opacity-0 absolute inset-0 w-full h-full cursor-pointer z-10\" 
                      >
                        <option value=\"\">ペアなし</option>
                        {members.filter(x => x.id !== m.id).map(x => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                      {m.fixedPairMemberId ? (
                        <LinkIcon size={14} className=\"text-blue-600 animate-pulse\" />
                      ) : (
                        <Unlink size={14} className=\"text-gray-300\" />
                      )}
                    </div>

                    {/* 削除ボタン */} 
                    <button 
                      onClick={() => isSwapping ? executeSwapWithMember(m.id) : deleteMember(m.id)} 
                      className={`p-2 rounded-xl border transition-colors ${isSwapping ? 'bg-yellow-500 border-yellow-400 text-white' : 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100 active:bg-red-100'}`}
                    >
                      {isSwapping ? <span className=\"text-xs font-black px-0.5\">選出</span> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. 履歴画面 */} 
        {activeTab === 'history' && (
          <div className=\"space-y-4 animate-fade-in\">
            {history.length === 0 ? (
              <div className=\"text-center py-12 text-gray-400 font-bold bg-white rounded-3xl border border-gray-200 shadow-sm\">
                進行済みの試合履歴はありません
              </div>
            ) : (
              <div className=\"space-y-3\">
                <div className=\"text-xs font-black text-gray-400 tracking-wider px-1\">過去20回分の確定履歴</div>
                {history.map((entry, idx) => (
                  <div key={idx} className=\"bg-white rounded-2xl p-3 shadow-sm border border-gray-200 space-y-2\">
                    <div className=\"flex items-center justify-between border-b pb-1.5\">
                      <span className=\"text-xs font-bold text-gray-500\">{new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                      <button 
                        onClick={() => loadHistoryEntry(idx)} 
                        className=\"text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl font-bold border border-blue-100 active:bg-blue-100 transition-colors\"
                      >
                        この時点を詳しく確認
                      </button>
                    </div>
                    <div className=\"space-y-1\">
                      {entry.courts.map(c => {
                        const m = entry.matches[c.id];
                        if (!m) return null;
                        const mn = (id: number) => entry.snapshotMembers.find(x => x.id === id)?.name || `不明(${id})`;
                        return (
                          <div key={c.id} className=\"text-xs font-medium text-gray-700 flex items-center justify-between bg-gray-50 p-1.5 rounded-lg\">
                            <span className=\"font-bold text-gray-400 shrink-0 w-14\">{c.name}</span>
                            <span className=\"truncate flex-1 text-center\">{mn(m.p1)} & {mn(m.p2)} <span className=\"font-black italic text-[9px] text-gray-300 mx-1\">VS</span> {mn(m.p3)} & {mn(m.p4)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. 設定画面 */}
        {activeTab === 'settings' && (
          <div className=\"space-y-4 animate-fade-in bg-white rounded-3xl p-5 shadow-sm border border-gray-200\">
            <h2 className=\"text-sm font-black tracking-wider text-gray-400 uppercase border-b pb-2 mb-2\">各種動作設定</h2>
            
            {/* レベルマッチング優先度設定 */} 
            <div className=\"space-y-1.5\">
              <label className=\"text-xs font-extrabold text-gray-600 block\">レベルマッチング優先度</label>
              <div className=\"grid grid-cols-4 gap-1 p-1 bg-gray-50 border rounded-2xl\">
                {[ 
                  { id: 'none', label: 'なし' }, 
                  { id: 'weak', label: '弱優先' }, 
                  { id: 'strong', label: '強優先' },
                  { id: 'forced', label: '強制' }
                ].map(opt => (
                  <button 
                    key={opt.id} 
                    onClick={() => setConfig({ ...config, levelPriority: opt.id as LevelPriority })}
                    className={`py-2 text-xs font-bold rounded-xl shadow-sm transition-all active:scale-95 ${
                      config.levelPriority === opt.id 
                        ? 'bg-blue-600 text-white font-black shadow-blue-200' 
                        : 'text-gray-500 hover:text-gray-700 active:bg-gray-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 各種フラグトグルスイッチ */} 
            <div className=\"space-y-3 pt-2\">
              <div className=\"flex items-center justify-between border-b pb-2.5\">
                <div>
                  <div className=\"text-xs font-extrabold text-gray-700\">次回の予定を一括先行生成</div>
                  <div className=\"text-[10px] font-bold text-gray-400 mt-0.5\">ONにすると試合確定まで次回の予定を固定します</div>
                </div>
                <button 
                  onClick={() => setConfig({ ...config, bulkOnlyMode: !config.bulkOnlyMode })}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors relative focus:outline-none ${
                    config.bulkOnlyMode ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform duration-200 ${config.bulkOnlyMode ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className=\"flex items-center justify-between border-b pb-2.5\">
                <div>
                  <div className=\"text-xs font-extrabold text-gray-700\">1巡目の試合は名簿順</div>
                  <div className=\"text-[10px] font-bold text-gray-400 mt-0.5\">全員の初戦のみ名簿の並び順通りに割り当てます</div>
                </div>
                <button 
                  onClick={() => setConfig({ ...config, orderFirstMatchByList: !config.orderFirstMatchByList })}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors relative focus:outline-none ${
                    config.orderFirstMatchByList ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform duration-200 ${config.orderFirstMatchByList ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className=\"flex items-center justify-between border-b pb-2.5\">
                <div>
                  <div className=\"text-xs font-extrabold text-gray-700\">日付が変わったら履歴をリセット</div>
                  <div className=\"text-[10px] font-bold text-gray-400 mt-0.5\">次回起動時に日付が変更されていれば自動初期化します</div>
                </div>
                <button 
                  onClick={() => setConfig({ ...config, resetHistoryOnDayChange: !config.resetHistoryOnDayChange })}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors relative focus:outline-none ${
                    config.resetHistoryOnDayChange ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow-md transform duration-200 ${config.resetHistoryOnDayChange ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* 名簿表示フォントサイズ調整 */} 
            <div className=\"space-y-1.5 pt-1\">
              <label className=\"text-xs font-extrabold text-gray-600 block\">名簿のフォントサイズ調整</label>
              <div className=\"flex items-center gap-2 bg-gray-50 border p-1.5 rounded-2xl justify-between\">
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, nameFontSizeModifier: Math.max(-1, (prev.nameFontSizeModifier || 0) - 1) }))}
                  className=\"p-2 bg-white rounded-xl border shadow-sm active:bg-gray-100 disabled:opacity-40 flex items-center justify-center shrink-0\"
                  disabled={config.nameFontSizeModifier === -1}
                >
                  <ZoomOut size={16} />
                </button>
                <div className=\"flex items-center gap-1 font-bold text-xs text-gray-600\">
                  <Type size={14} />
                  <span>{
                    config.nameFontSizeModifier === -1 ? '小さめ' :
                    config.nameFontSizeModifier === 1 ? '大きめ' : '標準'
                  }</span>
                </div>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, nameFontSizeModifier: Math.min(1, (prev.nameFontSizeModifier || 0) + 1) }))}
                  className=\"p-2 bg-white rounded-xl border shadow-sm active:bg-gray-100 disabled:opacity-40 flex items-center justify-center shrink-0\"
                  disabled={config.nameFontSizeModifier === 1}
                >
                  <ZoomIn size={16} />
                </button>
              </div>
            </div>

            {/* メモ欄のデフォルト設定 */}
            <div className=\"space-y-1.5 pt-1\">
              <label className=\"text-xs font-extrabold text-gray-600 block\">新規追加時のデフォルトメモ(最大8文字)</label>
              <input 
                type=\"text\" 
                maxLength={8} 
                value={config.memoDefaultText || ''} 
                onChange={(e) => setConfig({ ...config, memoDefaultText: e.target.value.trim() })}
                className=\"w-full px-3 py-2 border rounded-xl bg-gray-50 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500\" 
                placeholder=\"例: 2605\"
              />
            </div>

            {/* コート増減設定セクション */} 
            <div className=\"space-y-2 pt-2 border-t\">
              <div className=\"flex items-center justify-between mb-1\">
                <label className=\"text-xs font-black text-gray-400 tracking-wider uppercase\">コート数設定</label>
                <button onClick={addCourt} className=\"px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-100 active:bg-blue-100 transition-all flex items-center gap-1\">
                  <Plus size={12} /> コート追加
                </button>
              </div>
              <div className=\"space-y-1.5\">
                {courts.map(c => (
                  <div key={c.id} className=\"flex items-center gap-2 bg-gray-50 border p-2 rounded-2xl shadow-sm\">
                    <button 
                      onClick={() => toggleCourtActive(c.id)} 
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                        c.isActive ? 'bg-blue-600 border-blue-600 text-white shadow-inner' : 'border-gray-300 bg-white'
                      }`}
                    >
                      {c.isActive && <span className=\"text-xs font-black\">✓</span>}
                    </button>
                    <input 
                      type=\"text\" 
                      value={c.name} 
                      onChange={(e) => renameCourt(c.id, e.target.value)} 
                      className=\"flex-1 px-2 py-1 bg-transparent border-b border-transparent focus:border-gray-300 text-xs font-bold focus:outline-none\" 
                    />
                    <button onClick={() => deleteCourt(c.id)} className=\"p-1.5 text-gray-400 hover:text-red-500 active:bg-gray-100 rounded-lg transition-colors\">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* データバックアップ ＆ リセット */} 
            <div className=\"space-y-2 pt-4 border-t\">
              <label className=\"text-xs font-black text-gray-400 tracking-wider uppercase block mb-1\">データ管理・バックアップ</label>
              <div className=\"grid grid-cols-2 gap-2\">
                <button onClick={exportData} className=\"py-2.5 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border active:bg-gray-100 transition-colors\">
                  <Download size={14} /> バックアップ保存
                </button>
                <label className=\"py-2.5 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 border active:bg-gray-100 transition-colors cursor-pointer text-center\">
                  <Upload size={14} /> データを復元
                  <input type=\"file\" accept=\".json\" onChange={importData} className=\"hidden\" />
                </label>
              </div>
            </div>

            <div className=\"space-y-4 pt-4 border-t\">
              <button onClick={resetPlayCountsOnly} className=\"w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border active:bg-gray-100 transition-colors\">
                <RotateCcw size={20} /> 試合数と履歴をリセット
              </button>
              <button onClick={() => {if(confirm('全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className=\"w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100 active:bg-red-100 transition-colors\">
                データを完全消去
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 下部ナビゲーションバー */}
      <nav className=\"fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]\">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id as any)} 
            className={`flex flex-col items-center py-3 px-8 transition-colors ${
              activeTab === tab.id 
                ? 'text-blue-700 scale-105 font-black' 
                : 'text-gray-400 hover:text-gray-600 active:opacity-60'
            }`}
          >
            <tab.icon size={20} className={activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-[2]'} />
            <span className=\"text-[10px] tracking-wider mt-1\">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
