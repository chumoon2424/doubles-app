'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Settings, 
  History, 
  Play, 
  Plus, 
  Trash2, 
  RefreshCw,
  Trophy,
  FastForward,
  RotateCcw,
  Link as LinkIcon,
  Unlink,
  X,
  ZoomIn,
  ZoomOut,
  Type
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number; // みなし試合数
  lastPlayedTime: number;
  matchHistory: Record<number, number>; // 対戦した回数
  pairHistory: Record<number, number>;  // ペアを組んだ回数
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
  nameFontSizeModifier: number; // 一括フォントサイズ調整用
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
    zoomLevel: 1.0,
    nameFontSizeModifier: 1.0,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  // データ読み込みと移行ロジック
  useEffect(() => {
    const savedDataV15 = localStorage.getItem('doubles-app-data-v15');
    
    if (savedDataV15) {
      const data = JSON.parse(savedDataV15);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ 
        ...prev, 
        ...(data.config || {}),
        nameFontSizeModifier: data.config?.nameFontSizeModifier || 1.0 
      }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      let legacyData = null;
      const legacyKeys = [
        'doubles-app-data-v14',
        'doubles-app-data-v13',
        'doubles-app-data-v12',
        'doubles-app-data-v11',
        'doubles-app-data-v10',
        'doubles-app-data-v9',
        'doubles-app-data-v8',
        'doubles-app-data',
        'badminton-doubles-manager'
      ];

      for (const key of legacyKeys) {
        const found = localStorage.getItem(key);
        if (found) {
          try {
            legacyData = JSON.parse(found);
            break;
          } catch (e) {
            continue;
          }
        }
      }

      if (legacyData) {
        try {
          const rawMembers = legacyData.members || legacyData.players || [];
          const migratedMembers = rawMembers.map((m: any) => ({
            id: m.id,
            name: m.name || `選手${m.id}`,
            level: (m.level === 'A' || m.level === 'B' || m.level === 'C') ? m.level : 'A',
            isActive: m.isActive !== undefined ? m.isActive : true,
            playCount: m.playCount || 0,
            imputedPlayCount: m.imputedPlayCount || 0,
            lastPlayedTime: m.lastPlayedTime || 0,
            matchHistory: m.matchHistory || {},
            pairHistory: m.pairHistory || {},
            fixedPairMemberId: m.fixedPairMemberId || null
          }));

          setMembers(migratedMembers);
          
          const courtCount = legacyData.config?.courtCount || legacyData.courtCount || 4;
          setConfig(prev => ({ 
            ...prev, 
            courtCount: courtCount, 
            levelStrict: legacyData.config?.levelStrict || legacyData.levelStrict || false 
          }));
          
          const maxId = migratedMembers.length > 0 ? Math.max(...migratedMembers.map((m: any) => m.id)) : 0;
          setNextMemberId((legacyData.nextMemberId || maxId) + 1);
          
          initializeCourts(courtCount);
          setMatchHistory([]);
        } catch (e) {
          console.error("Migration failed", e);
          initializeCourts(4);
        }
      } else {
        initializeCourts(4);
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v15', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  const initializeCourts = (count: number) => {
    setCourts(Array.from({ length: count }, (_, i) => ({ id: i + 1, match: null })));
  };

  const handleCourtCountChange = (count: number) => {
    setConfig(prev => ({ ...prev, courtCount: count }));
    setCourts(prev => {
      if (count > prev.length) {
        const added = Array.from({ length: count - prev.length }, (_, i) => ({ id: prev.length + i + 1, match: null }));
        return [...prev, ...added];
      }
      return prev.slice(0, count);
    });
  };

  const resetPlayCountsOnly = () => {
    if (confirm('全員の試合数と対戦履歴、および履歴画面をリセットします。固定ペア設定は維持されます。')) {
      setMembers(prev => prev.map(m => ({ 
        ...m, 
        playCount: 0,
        imputedPlayCount: 0,
        lastPlayedTime: 0, 
        matchHistory: {},
        pairHistory: {} 
      })));
      setMatchHistory([]);
    }
  };

  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    const avgPlay = activeMembers.length > 0 ? Math.floor(activeMembers.reduce((s, m) => s + m.playCount, 0) / activeMembers.length) : 0;
    const newMember: Member = { 
      id: nextMemberId, 
      name: `${nextMemberId}`, 
      level: 'A', 
      isActive: true, 
      playCount: avgPlay, 
      imputedPlayCount: avgPlay,
      lastPlayedTime: 0, 
      matchHistory: {},
      pairHistory: {},
      fixedPairMemberId: null
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
      const newLevel = toggleLevel(target.level);
      return prev.map(m => {
        if (m.id === id || (target.fixedPairMemberId && m.id === target.fixedPairMemberId)) {
          return { ...m, level: newLevel };
        }
        return m;
      });
    });
  };

  const applyMatchToMembers = (p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const playerIds = [p1, p2, p3, p4];
    
    setMembers(prev => {
      const updatedMembers = prev.map(m => {
        if (!playerIds.includes(m.id)) return m;
        
        const newMatchH = { ...m.matchHistory };
        const newPairH = { ...m.pairHistory };
        
        let partnerId = 0;
        let opponents: number[] = [];
        if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
        else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
        else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
        else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }

        newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
        opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });

        return { 
          ...m, 
          playCount: m.playCount + 1, 
          lastPlayedTime: now, 
          matchHistory: newMatchH,
          pairHistory: newPairH
        };
      });

      const activeMembers = updatedMembers.filter(m => m.isActive);
      if (activeMembers.length === 0) return updatedMembers;
      
      const totalPlays = activeMembers.reduce((sum, m) => sum + m.playCount, 0);
      const avgPlays = Math.floor(totalPlays / activeMembers.length);

      return updatedMembers.map(m => {
        if (!m.isActive && m.playCount < avgPlays) {
          const diff = avgPlays - m.playCount;
          return {
            ...m,
            playCount: avgPlays,
            imputedPlayCount: m.imputedPlayCount + diff
          };
        }
        return m;
      });
    });
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

      const w = currentSelection[0];
      const x = currentSelection[1];
      const y = currentSelection[2];

      const score = (m: Member): number[] => {
        const criteria: number[] = [];
        if (step === 'W') {
          // 1-1. 試合数が最少
          criteria.push(m.playCount);
          // 1-2. セットが最古
          criteria.push(m.lastPlayedTime);
        } else if (step === 'X') {
          // 2-1. Wに休み中でない固定ペアがいる場合は、その固定ペア
          const wFixedPartner = candidates.find(c => c.id === w.fixedPairMemberId);
          criteria.push(wFixedPartner && m.id === w.fixedPairMemberId ? 0 : 1);
          // 2-2. 固定ペアがいない人、または固定ペアが休み中の人
          const mFixedPartnerIsActive = m.fixedPairMemberId ? candidates.some(c => c.id === m.fixedPairMemberId) : false;
          criteria.push(!mFixedPartnerIsActive ? 0 : 1);
          // 2-3. レベル厳格モードなら、Wと同じレベル
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          // 2-4. 試合数最少 or セット最古
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          // 2-5. Wとペア回数最少
          criteria.push(w.pairHistory[m.id] || 0);
          // 2-6. Wと対戦回数最少
          criteria.push(w.matchHistory[m.id] || 0);
        } else if (step === 'Y') {
          // 3-1. 同レベル
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          // 3-2. 試合数最少 or セット最古
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          // 3-3. Wとの合計最少
          criteria.push((w.pairHistory[m.id] || 0) + (w.matchHistory[m.id] || 0));
          // 3-4. Xとの合計最少
          criteria.push((x.pairHistory[m.id] || 0) + (x.matchHistory[m.id] || 0));
        } else if (step === 'Z') {
          // 4-1. Yに休み中でない固定ペアがいる場合は、その固定ペア
          const yFixedPartner = candidates.find(c => c.id === y.fixedPairMemberId);
          criteria.push(yFixedPartner && m.id === y.fixedPairMemberId ? 0 : 1);
          // 4-2. 固定ペアがいない人、または固定ペアが休み中の人
          const mFixedPartnerIsActive = m.fixedPairMemberId ? candidates.some(c => c.id === m.fixedPairMemberId) : false;
          criteria.push(!mFixedPartnerIsActive ? 0 : 1);
          // 4-3. 同レベル
          if (config.levelStrict) criteria.push(m.level === w.level ? 0 : 1);
          // 4-4. 試合数最少 or セット最古
          criteria.push((m.playCount === minPlayCount || m.lastPlayedTime === minLastTime) ? 0 : 1);
          // 4-5. Yとペア回数最少
          criteria.push(y.pairHistory[m.id] || 0);
          // 4-6. Yと対戦回数最少
          criteria.push(y.matchHistory[m.id] || 0);
          // 4-7. Wとの合計最少
          criteria.push((w.pairHistory[m.id] || 0) + (w.matchHistory[m.id] || 0));
          // 4-8. Xとの合計最少
          criteria.push((x.pairHistory[m.id] || 0) + (x.matchHistory[m.id] || 0));
        }
        return criteria;
      };

      const sorted = remaining.sort((a, b) => {
        const scoreA = score(a);
        const scoreB = score(b);
        for (let i = 0; i < scoreA.length; i++) {
          if (scoreA[i] !== scoreB[i]) return scoreA[i] - scoreB[i];
        }
        return 0; // 全く同じスコア
      });

      // 1-3, 2-7, 3-5, 4-9. ランダム要素の適用
      const topScore = score(sorted[0]);
      const topCandidates = sorted.filter(m => {
        const s = score(m);
        return s.every((val, idx) => val === topScore[idx]);
      });

      return topCandidates[Math.floor(Math.random() * topCandidates.length)];
    };

    const patterns: Member[][] = [];
    for (let i = 0; i < 4; i++) {
      const selection: Member[] = [];
      const W = pickMember(selection, 'W');
      if (W) selection.push(W); else continue;
      const X = pickMember(selection, 'X');
      if (X) selection.push(X); else continue;
      const Y = pickMember(selection, 'Y');
      if (Y) selection.push(Y); else continue;
      const Z = pickMember(selection, 'Z');
      if (Z) selection.push(Z); else continue;

      if (selection.length === 4) {
        patterns.push(selection);
      }
    }

    if (patterns.length === 0) return null;

    const getPatternCost = (p: Member[]) => {
      let total = 0;
      const combs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
      combs.forEach(([i, j]) => {
        const m1 = p[i];
        const m2 = p[j];
        // 固定ペアの分（現在有効なもの）を除く
        const isCurrentFixedPair = (m1.fixedPairMemberId === m2.id && candidates.some(c => c.id === m1.id) && candidates.some(c => c.id === m2.id));
        if (!isCurrentFixedPair) {
          total += (m1.pairHistory[m2.id] || 0) + (m1.matchHistory[m2.id] || 0);
        }
      });
      return total;
    };

    const bestPattern = patterns.reduce((prev, curr) => {
      // 7. 同じ場合は先に作成したパターンを採用
      return getPatternCost(curr) < getPatternCost(prev) ? curr : prev;
    });

    return { p1: bestPattern[0].id, p2: bestPattern[1].id, p3: bestPattern[2].id, p4: bestPattern[3].id, level: config.levelStrict ? bestPattern[0].level : undefined };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません（条件に合うメンバーがいません）');
    
    const ids = [match.p1, match.p2, match.p3, match.p4];
    const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{
      id: Date.now().toString() + courtId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      courtId, players: names, playerIds: ids, level: match.level
    }, ...prev]);

    applyMatchToMembers(match.p1, match.p2, match.p3, match.p4);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match } : c));
  };

  const finishMatch = (courtId: number) => {
    setCourts(prevCourts => prevCourts.map(c => c.id === courtId ? { ...c, match: null } : c));
  };

  const handleBulkAction = () => {
    setCourts(prev => prev.map(c => ({ ...c, match: null })));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        let tempMembers = JSON.parse(JSON.stringify(members)) as Member[];
        for (let i = 0; i < current.length; i++) {
          if (!current[i].match) {
            const match = getMatchForCourt(current, tempMembers);
            if (match) {
              const ids = [match.p1, match.p2, match.p3, match.p4];
              const names = ids.map(id => tempMembers.find(m => m.id === id)?.name || '?');
              setMatchHistory(prevH => [{
                id: Date.now().toString() + current[i].id,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                courtId: current[i].id, players: names, playerIds: ids, level: match.level
              }, ...prevH]);
              current[i] = { ...current[i], match };
              
              const now = Date.now();
              tempMembers = tempMembers.map(m => {
                if (!ids.includes(m.id)) return m;
                const newMatchH = { ...m.matchHistory };
                const newPairH = { ...m.pairHistory };
                let p1=match.p1, p2=match.p2, p3=match.p3, p4=match.p4;
                let partnerId = 0; let opponents: number[] = [];
                if (m.id === p1) { partnerId = p2; opponents = [p3, p4]; }
                else if (m.id === p2) { partnerId = p1; opponents = [p3, p4]; }
                else if (m.id === p3) { partnerId = p4; opponents = [p1, p2]; }
                else if (m.id === p4) { partnerId = p3; opponents = [p1, p2]; }
                newPairH[partnerId] = (newPairH[partnerId] || 0) + 1;
                opponents.forEach(oid => { newMatchH[oid] = (newMatchH[oid] || 0) + 1; });

                return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newMatchH, pairHistory: newPairH };
              });
              applyMatchToMembers(match.p1, match.p2, match.p3, match.p4);
            }
          }
        }
        return current;
      });
    }, 200);
  };

  const changeZoom = (delta: number) => {
    setConfig(prev => ({
      ...prev,
      zoomLevel: Math.max(0.5, Math.min(2.0, prev.zoomLevel + delta))
    }));
  };

  const changeNameFontSize = (delta: number) => {
    setConfig(prev => ({
      ...prev,
      nameFontSizeModifier: Math.max(0.5, Math.min(2.0, prev.nameFontSizeModifier + delta))
    }));
  };

  const getLevelBadge = (l?: Level) => {
    if (!l) return null;
    const c = { A: 'bg-blue-600', B: 'bg-yellow-500', C: 'bg-red-500' };
    return <span className={`ml-2 px-2 py-0.5 rounded text-[10px] text-white ${c[l]}`}>{l}</span>;
  };

  const toggleLevel = (currentLevel: Level): Level => {
    if (currentLevel === 'A') return 'B';
    if (currentLevel === 'B') return 'C';
    return 'A';
  };

  const getDynamicFontSize = (name: string = '', modifier: number = 1.0) => {
    // 1文字ずつ判定して有効長を計算 (半角0.6, 全角1.0)
    const effectiveLen = name.split('').reduce((acc, char) => {
      return acc + (/[\x20-\x7E]/.test(char) ? 0.6 : 1.0);
    }, 0);

    let baseSize = '';
    if (effectiveLen <= 2) baseSize = '3.5rem';
    else if (effectiveLen <= 4) baseSize = '2.8rem';
    else if (effectiveLen <= 6) baseSize = '2rem';
    else if (effectiveLen <= 8) baseSize = '1.6rem';
    else baseSize = '1.3rem';

    return `calc(${baseSize} * ${modifier})`;
  };

  return (
    <div className="min-h-screen bg-gray-200 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-900 text-white px-4 py-3 shadow-md flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> D Maker</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              {/* コート高さ調整 */}
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-1">
                <button onClick={() => changeZoom(-0.1)} title="コート高さを縮小" className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button>
                <button onClick={() => changeZoom(0.1)} title="コート高さを拡大" className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button>
              </div>
              {/* 選手名フォントサイズ一括調整 */}
              <div className="flex items-center bg-black/20 rounded-lg p-0.5 mr-2">
                <button onClick={() => changeNameFontSize(-0.1)} title="文字サイズを縮小" className="p-1.5 hover:bg-white/10 rounded"><ZoomOut size={16}/></button>
                <div className="px-0.5 text-white/50"><Type size={14} /></div>
                <button onClick={() => changeNameFontSize(0.1)} title="文字サイズを拡大" className="p-1.5 hover:bg-white/10 rounded"><ZoomIn size={16}/></button>
              </div>
            </>
          )}
          {activeTab === 'dashboard' && (
            <button onClick={handleBulkAction} className="bg-orange-600 text-white px-4 py-2 rounded-full text-xs font-black shadow-lg active:scale-95 transition-transform border border-orange-400">
              一括更新
            </button>
          )}
        </div>
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 landscape:grid-cols-2 gap-4">
            {courts.map(court => {
              const baseHeight = 180; 
              const calculatedHeight = baseHeight * config.zoomLevel;

              return (
                <div 
                  key={court.id} 
                  className="bg-white rounded-xl shadow-md border border-gray-300 overflow-hidden flex flex-col"
                  style={{ height: `${calculatedHeight}px`, minHeight: `${calculatedHeight}px` }}
                >
                  <div className="bg-gray-100 px-4 py-1.5 border-b border-gray-300 flex justify-between items-center shrink-0">
                    <span className="font-black text-sm text-gray-600 uppercase tracking-tighter">COURT {court.id} {getLevelBadge(court.match?.level)}</span>
                    {court.match && (
                      <button 
                        onClick={() => finishMatch(court.id)} 
                        className="bg-gray-900 text-white px-4 py-1 rounded-md font-black text-xs shadow hover:bg-black transition-colors"
                      >
                        終了
                      </button>
                    )}
                  </div>
                  <div className="flex-1 p-2 flex flex-col justify-center overflow-hidden bg-gray-50/50">
                    {court.match ? (
                      <div className="flex items-center gap-2 h-full overflow-hidden">
                        <div className="flex-1 grid grid-cols-2 gap-3 h-full">
                          <div className="bg-blue-50/80 rounded-lg flex flex-col justify-between items-stretch border-2 border-blue-200 px-3 overflow-hidden py-1 shadow-sm">
                            <div className="w-full text-left leading-tight font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis self-start" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p1)?.name, config.nameFontSizeModifier) }}>
                              {members.find(m => m.id === court.match?.p1)?.name}
                            </div>
                            <div className="w-full text-right leading-tight font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis self-end" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p2)?.name, config.nameFontSizeModifier) }}>
                              {members.find(m => m.id === court.match?.p2)?.name}
                            </div>
                          </div>
                          <div className="bg-red-50/80 rounded-lg flex flex-col justify-between items-stretch border-2 border-red-200 px-3 overflow-hidden py-1 shadow-sm">
                            <div className="w-full text-left leading-tight font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis self-start" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p3)?.name, config.nameFontSizeModifier) }}>
                              {members.find(m => m.id === court.match?.p3)?.name}
                            </div>
                            <div className="w-full text-right leading-tight font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis self-end" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p4)?.name, config.nameFontSizeModifier) }}>
                              {members.find(m => m.id === court.match?.p4)?.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => generateNextMatch(court.id)} className="w-full h-full border-4 border-dashed border-gray-400 text-gray-500 font-black text-2xl rounded-xl flex items-center justify-center gap-3 hover:bg-white hover:text-blue-600 hover:border-blue-400 transition-all">
                        <Play size={32} fill="currentColor" /> 割当
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
                      <button 
                        onClick={() => handleLevelChange(m.id)}
                        className={`text-xs font-bold rounded-md px-3 py-1 text-white transition-colors ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      >
                        レベル{m.level}
                      </button>
                      
                      <button 
                        onClick={() => setEditingPairMemberId(m.id)}
                        className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}
                      >
                        {m.fixedPairMemberId ? (
                          <>
                            <LinkIcon size={12} />
                            {members.find(x => x.id === m.fixedPairMemberId)?.name}
                          </>
                        ) : (
                          <>
                            <Unlink size={12} />
                            ペアなし
                          </>
                        )}
                      </button>

                      <span className="text-xs text-gray-400 font-bold tracking-wider">
                        試合数: {m.playCount}
                        {m.imputedPlayCount > 0 && <span className="text-gray-300 ml-1">({m.imputedPlayCount})</span>}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>
                    {m.isActive ? '参加' : '休み'}
                  </button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 transition-colors px-2"><Trash2 size={24} /></button>
                </div>
              ))}

              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b">
                      <h3 className="font-bold text-lg">ペアを選択 (同レベルのみ)</h3>
                      <button onClick={() => setEditingPairMemberId(null)} className="text-gray-500"><X size={20}/></button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto p-2">
                      <button 
                        onClick={() => updateFixedPair(editingPairMemberId, null)}
                        className="w-full text-left px-4 py-3 hover:bg-red-50 text-red-600 font-bold border-b border-gray-100 flex items-center gap-2"
                      >
                        <Unlink size={16} /> ペアを解消（なし）
                      </button>
                      {members
                        .filter(m => m.id !== editingPairMemberId && m.isActive)
                        .filter(m => !m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId)
                        .filter(m => m.level === members.find(x => x.id === editingPairMemberId)?.level)
                        .map(candidate => (
                          <button
                            key={candidate.id}
                            onClick={() => updateFixedPair(editingPairMemberId, candidate.id)}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b border-gray-100 flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                          >
                            <LinkIcon size={16} className="text-gray-400" />
                            {candidate.name}
                          </button>
                        ))}
                      {members.filter(m => m.id !== editingPairMemberId && m.isActive && (!m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) && m.level === members.find(x => x.id === editingPairMemberId)?.level).length === 0 && (
                        <div className="px-4 py-3 text-gray-400 text-sm text-center">選択可能なメンバーがいません</div>
                      )}
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
              <thead className="bg-gray-50 text-gray-400">
                <tr><th className="p-4 text-xs font-bold uppercase tracking-widest">時刻</th><th className="p-4 text-xs font-bold uppercase tracking-widest">対戦</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}>
                    <td className="p-4 text-gray-400 font-mono text-sm whitespace-nowrap">{h.timestamp}</td>
                    <td className="p-4 font-bold text-base">
                      {getLevelBadge(h.level)} {h.players[0]}, {h.players[1]} <span className="text-gray-300 px-1 font-normal italic">vs</span> {h.players[2]}, {h.players[3]}
                    </td>
                  </tr>
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
              <button onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))} className={`w-14 h-7 rounded-full relative transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all shadow-md ${config.levelStrict ? 'left-8' : 'left-1'}`} />
              </button>
            </div>
            <div className="space-y-4">
              <button onClick={resetPlayCountsOnly} className="w-full py-4 bg-gray-50 text-gray-700 rounded-2xl font-bold flex items-center justify-center gap-3 border border-gray-200 active:bg-gray-100 transition-colors">
                <RotateCcw size={20} /> 試合数と履歴をリセット
              </button>
              <button onClick={() => {if(confirm('名簿を含め全てリセットしますか？')) {localStorage.clear(); location.reload();}}} className="w-full py-4 bg-red-50 text-red-500 rounded-2xl font-bold border border-red-100 active:bg-red-100 transition-colors">
                データを完全消去
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.1)]">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === tab.id ? 'text-blue-700 scale-110' : 'text-gray-400'}`}>
            <tab.icon size={26} strokeWidth={activeTab === tab.id ? 3 : 2} />
            <span className="text-[10px] font-black mt-1.5">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
