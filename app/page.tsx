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
  X
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  lastPlayedTime: number;
  matchHistory: Record<number, number>;
  fixedPairMemberId: number | null; // 固定ペアの相手ID
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
}

export default function DoublesMatchupApp() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 4,
    levelStrict: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // ペア選択モーダル用
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data-v12'); // Version up
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 4, levelStrict: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      initializeCourts(4);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v12', JSON.stringify(data));
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
    if (confirm('全員の試合数と対戦履歴をリセットします。固定ペア設定は維持されます。')) {
      setMembers(prev => prev.map(m => ({ 
        ...m, 
        playCount: 0, 
        lastPlayedTime: 0, 
        matchHistory: {} 
      })));
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
      lastPlayedTime: 0, 
      matchHistory: {},
      fixedPairMemberId: null
    };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  // ペア設定の更新
  const updateFixedPair = (memberId: number, partnerId: number | null) => {
    setMembers(prev => {
      let newMembers = [...prev];
      const target = newMembers.find(m => m.id === memberId);
      if (!target) return prev;

      // 1. もしターゲットが既に誰かと組んでいたら、その元相方のペアIDを消す
      if (target.fixedPairMemberId) {
        const oldPartner = newMembers.find(m => m.id === target.fixedPairMemberId);
        if (oldPartner) oldPartner.fixedPairMemberId = null;
      }

      // 2. もし新しいパートナーが既に誰かと組んでいたら、その元相方のペアIDを消す
      if (partnerId) {
        const newPartner = newMembers.find(m => m.id === partnerId);
        if (newPartner && newPartner.fixedPairMemberId) {
          const partnersOldPartner = newMembers.find(m => m.id === newPartner.fixedPairMemberId);
          if (partnersOldPartner) partnersOldPartner.fixedPairMemberId = null;
        }
        // 新しいパートナーに自分をセット
        if (newPartner) newPartner.fixedPairMemberId = memberId;
      }

      // 3. 自分に新しいパートナーをセット
      target.fixedPairMemberId = partnerId;

      return newMembers;
    });
    setEditingPairMemberId(null);
  };

  const applyMatchToMembers = (playerIds: number[]) => {
    const now = Date.now();
    setMembers(prevM => prevM.map(m => {
      if (!playerIds.includes(m.id)) return m;
      const newH = { ...m.matchHistory };
      playerIds.forEach(oid => { if (m.id !== oid) newH[oid] = (newH[oid] || 0) + 1; });
      return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: newH };
    }));
  };

  // --- ユニットベースのマッチングロジック ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    
    // 待機中のメンバー
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));

    // 候補者を「ユニット（ペアまたはシングル）」に変換
    // 固定ペアは2人で1つのユニットとして扱う
    type Unit = { type: 'pair', members: Member[], avgPlay: number, lastTime: number } | { type: 'single', members: Member[], avgPlay: number, lastTime: number };
    
    const units: Unit[] = [];
    const processedIds = new Set<number>();

    candidates.forEach(m => {
      if (processedIds.has(m.id)) return;

      if (m.fixedPairMemberId && candidates.some(c => c.id === m.fixedPairMemberId)) {
        // 固定ペアの相手も待機中にいる場合 -> ペアユニット作成
        const partner = candidates.find(c => c.id === m.fixedPairMemberId)!;
        processedIds.add(m.id);
        processedIds.add(partner.id);
        
        // 2人の平均試合数と、より遅い(最近の)プレイ時刻を採用
        units.push({
          type: 'pair',
          members: [m, partner],
          avgPlay: (m.playCount + partner.playCount) / 2,
          lastTime: Math.max(m.lastPlayedTime, partner.lastPlayedTime)
        });
      } else {
        // シングルユニット
        processedIds.add(m.id);
        units.push({
          type: 'single',
          members: [m],
          avgPlay: m.playCount,
          lastTime: m.lastPlayedTime
        });
      }
    });

    // ユニットをソート（試合数平均 > 最終プレイ時刻 > ランダム）
    const sortedUnits = units.sort((a, b) => {
      if (a.avgPlay !== b.avgPlay) return a.avgPlay - b.avgPlay;
      if (a.lastTime !== b.lastTime) return a.lastTime - b.lastTime;
      return Math.random() - 0.5;
    });

    // 4人を選出する（ナップサック問題的アプローチの簡易版）
    // 上から順に取っていき、4人ぴったりになれば採用
    let selectedMembers: Member[] = [];
    let currentCount = 0;
    
    // レベル厳格モードの場合、ユニットの属性（レベル）も考慮が必要だが、
    // 固定ペアの場合はレベルが混在する可能性があるため、簡易的に「ペアの代表者のレベル」を見るか、
    // もしくは厳格モード時はペア設定を無視するか等の判断が必要。
    // 今回は「固定ペア優先」とし、厳格モードでもペアが組まれていればレベル不一致でも通すか、
    // 厳密にやるなら「ペアの両方がそのレベルであること」を条件にする。
    // -> ユーザー指示「固定ペア対バラでもOK」なので、柔軟に対応。
    // ここではシンプルに「ユニット優先順」で4人埋める。
    
    // 厳格モード用のフィルタリング
    // ペアの場合は「2人のレベルが同じ」かつ「基準レベルと一致」のみ許可するなど
    // 複雑になるため、今回は「ソート順に上から、4名枠に収まるなら入れる」方式にする
    
    for (const unit of sortedUnits) {
      if (currentCount + unit.members.length <= 4) {
        // 厳格モードチェック
        if (config.levelStrict && selectedMembers.length > 0) {
          // 既に選ばれているメンバーのレベル（代表）
          const baseLevel = selectedMembers[0].level;
          // ユニット内の全員がそのレベルと一致するか？
          const isLevelMatch = unit.members.every(m => m.level === baseLevel);
          if (!isLevelMatch) continue; // レベルが合わなければスキップ
        } else if (config.levelStrict && unit.type === 'pair') {
             // 最初の選出だがペアの場合、ペア同士のレベルが違うと厳格モードでは破綻する可能性があるが
             // 今回は「ペアのレベルが異なっていても、ペアとして成立させる」か「スキップ」か。
             // 厳格モードなので、ペア内でもレベル不一致なら選ばないようにする
             if(unit.members[0].level !== unit.members[1].level) continue;
        }

        selectedMembers = [...selectedMembers, ...unit.members];
        currentCount += unit.members.length;
      }
      if (currentCount === 4) break;
    }

    if (currentCount < 4) return null;

    // チーム分け
    // 固定ペアが含まれている場合は、そのペアを分解しないように配置する
    // ケース1: 固定ペアA(2名) + 固定ペアB(2名) -> A vs B
    // ケース2: 固定ペアA(2名) + ソロB + ソロC -> A vs (B+C)
    // ケース3: 全員ソロ -> 通常ロジック
    
    const fixedPairs = units.filter(u => u.type === 'pair' && selectedMembers.includes(u.members[0]));
    
    let p1, p2, p3, p4;
    
    if (fixedPairs.length === 2) {
      // ペア対ペア
      p1 = fixedPairs[0].members[0];
      p2 = fixedPairs[0].members[1];
      p3 = fixedPairs[1].members[0];
      p4 = fixedPairs[1].members[1];
    } else if (fixedPairs.length === 1) {
      // ペア対バラ
      const pair = fixedPairs[0].members;
      const others = selectedMembers.filter(m => !pair.includes(m));
      p1 = pair[0];
      p2 = pair[1];
      p3 = others[0];
      p4 = others[1];
    } else {
      // 全員バラ（従来ロジック）
      // 相性最適化
      const p = selectedMembers;
      const getC = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
      const costs = [
        { order: [0, 1, 2, 3], c: getC(p[0], p[1]) + getC(p[2], p[3]) },
        { order: [0, 2, 1, 3], c: getC(p[0], p[2]) + getC(p[1], p[3]) },
        { order: [0, 3, 1, 2], c: getC(p[0], p[3]) + getC(p[1], p[2]) }
      ].sort((a, b) => a.c - b.c || Math.random() - 0.5);
      const o = costs[0].order;
      p1 = p[o[0]]; p2 = p[o[1]]; p3 = p[o[2]]; p4 = p[o[3]];
    }

    // レベル判定（代表者）
    const matchLevel = p1.level;

    return { p1: p1.id, p2: p2.id, p3: p3.id, p4: p4.id, level: matchLevel };
  };

  const generateNextMatch = (courtId: number) => {
    const match = getMatchForCourt(courts, members);
    if (!match) return alert('待機メンバーが足りません（固定ペアやレベル制限により4名揃いません）');
    
    const ids = [match.p1, match.p2, match.p3, match.p4];
    const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
    setMatchHistory(prev => [{
      id: Date.now().toString() + courtId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      courtId, players: names, playerIds: ids, level: match.level
    }, ...prev]);

    applyMatchToMembers(ids);
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
        // メンバー状態のコピー（シミュレーション用）
        let tempMembers = JSON.parse(JSON.stringify(members)) as Member[];
        
        for (let i = 0; i < current.length; i++) {
          if (!current[i].match) {
            // tempMembersを使ってマッチング計算
            const match = getMatchForCourt(current, tempMembers);
            if (match) {
              const ids = [match.p1, match.p2, match.p3, match.p4];
              const names = ids.map(id => members.find(m => m.id === id)?.name || '?');
              
              setMatchHistory(prevH => [{
                id: Date.now().toString() + current[i].id,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                courtId: current[i].id, players: names, playerIds: ids, level: match.level
              }, ...prevH]);

              current[i] = { ...current[i], match };
              
              // tempMembersと本番stateの両方を更新（次のループのため）
              const now = Date.now();
              const updateLocal = (list: Member[]) => list.map(m => {
                if (!ids.includes(m.id)) return m;
                return { ...m, playCount: m.playCount + 1, lastPlayedTime: now };
              });
              tempMembers = updateLocal(tempMembers);
              applyMatchToMembers(ids);
            }
          }
        }
        return current;
      });
    }, 200);
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

  const getDynamicFontSize = (name: string = '') => {
    const len = name.length;
    if (len <= 2) return 'clamp(1.4rem, 9vw, 3.5rem)';
    if (len <= 4) return 'clamp(1.1rem, 7vw, 2.8rem)';
    if (len <= 6) return 'clamp(0.9rem, 5vw, 2rem)';
    if (len <= 8) return 'clamp(0.8rem, 4.5vw, 1.6rem)';
    return 'clamp(0.7rem, 4vw, 1.3rem)';
  };

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans overflow-x-hidden">
      <header className="bg-blue-800 text-white px-4 py-3 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} /> ダブルスメーカー</h1>
        {activeTab === 'dashboard' && (
          <button onClick={handleBulkAction} className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-md active:scale-95 transition-transform">
            一括更新
          </button>
        )}
      </header>

      <main className="p-2 w-full max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[160px]">
                <div className="bg-gray-50 px-4 py-1.5 border-b flex justify-between items-center shrink-0">
                  <span className="font-bold text-xs text-gray-500 uppercase tracking-widest">Court {court.id} {getLevelBadge(court.match?.level)}</span>
                </div>
                <div className="flex-1 p-3 flex flex-col justify-center">
                  {court.match ? (
                    <div className="flex items-center gap-2 h-full">
                      <div className="flex-1 grid grid-cols-2 gap-2 h-full">
                        <div className="bg-blue-50 rounded-lg flex flex-col justify-center items-center border border-blue-100 px-2 overflow-hidden py-1">
                          <div className="w-full text-center leading-tight mb-1 font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p1)?.name) }}>
                            {members.find(m => m.id === court.match?.p1)?.name}
                          </div>
                          <div className="w-full text-center leading-tight font-black text-blue-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p2)?.name) }}>
                            {members.find(m => m.id === court.match?.p2)?.name}
                          </div>
                        </div>
                        <div className="bg-red-50 rounded-lg flex flex-col justify-center items-center border border-red-100 px-2 overflow-hidden py-1">
                          <div className="w-full text-center leading-tight mb-1 font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p3)?.name) }}>
                            {members.find(m => m.id === court.match?.p3)?.name}
                          </div>
                          <div className="w-full text-center leading-tight font-black text-red-900 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: getDynamicFontSize(members.find(m => m.id === court.match?.p4)?.name) }}>
                            {members.find(m => m.id === court.match?.p4)?.name}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => finishMatch(court.id)} className="bg-gray-800 text-white px-5 h-full min-h-[80px] rounded-lg font-bold text-sm lg:text-lg shrink-0 flex items-center shadow-inner">終了</button>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="w-full min-h-[100px] border-2 border-dashed border-gray-300 text-gray-400 font-bold text-xl rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors">
                      <Play size={28} /> 割当
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="space-y-3 max-w-2xl mx-auto">
            <div className="flex justify-between items-center p-2">
              <h2 className="font-bold text-xl text-gray-700">名簿 ({members.length})</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1 shadow-lg"><Plus size={20} />選手追加</button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm divide-y overflow-hidden relative">
              {members.map(m => (
                <div key={m.id} className={`p-4 flex items-center gap-4 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1">
                    <input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-xl bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <button 
                        onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, level: toggleLevel(m.level) } : x))}
                        className={`text-xs font-bold rounded-md px-3 py-1 text-white transition-colors ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}
                      >
                        レベル{m.level}
                      </button>
                      
                      {/* ペア設定ボタン */}
                      <button 
                        onClick={() => setEditingPairMemberId(m.id)}
                        className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${m.fixedPairMemberId ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-gray-400 border-dashed border-gray-300'}`}
                      >
                        {m.fixedPairMemberId ? (
                          <>
                            <LinkIcon size={12} />
                            {members.find(x => x.id === m.fixedPairMemberId)?.name}とペア
                          </>
                        ) : (
                          <>
                            <Unlink size={12} />
                            ペアなし
                          </>
                        )}
                      </button>

                      <span className="text-xs text-gray-400 font-bold tracking-wider">試合数: {m.playCount}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-2 rounded-xl font-bold border-2 transition-all ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>
                    {m.isActive ? '参加' : '休み'}
                  </button>
                  <button onClick={() => {if(confirm(`${m.name}を削除？`)) setMembers(prev => prev.filter(x => x.id !== m.id))}} className="text-gray-200 hover:text-red-500 transition-colors px-2"><Trash2 size={24} /></button>
                </div>
              ))}

              {/* ペア選択モーダル */}
              {editingPairMemberId && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b">
                      <h3 className="font-bold text-lg">ペアを選択</h3>
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
                        .filter(m => m.id !== editingPairMemberId && m.isActive) // 自分以外かつ参加中の人のみ
                        .filter(m => !m.fixedPairMemberId || m.fixedPairMemberId === editingPairMemberId) // フリーの人か、既に自分と組んでる人のみ
                        .map(candidate => (
                          <button
                            key={candidate.id}
                            onClick={() => updateFixedPair(editingPairMemberId, candidate.id)}
                            className={`w-full text-left px-4 py-3 hover:bg-blue-50 font-bold border-b border-gray-100 flex items-center gap-2 ${members.find(x => x.id === editingPairMemberId)?.fixedPairMemberId === candidate.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                          >
                            <LinkIcon size={16} className="text-gray-400" />
                            {candidate.name}
                            <span className="text-xs text-gray-400 ml-auto font-normal">Level {candidate.level}</span>
                          </button>
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

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around pb-safe z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.03)]">
        {[
          { id: 'dashboard', icon: Play, label: '試合' },
          { id: 'members', icon: Users, label: '名簿' },
          { id: 'history', icon: History, label: '履歴' },
          { id: 'settings', icon: Settings, label: '設定' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-3 px-8 transition-colors ${activeTab === tab.id ? 'text-blue-600 scale-110' : 'text-gray-300'}`}>
            <tab.icon size={26} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold mt-1.5">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
