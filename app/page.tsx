'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, Settings, History, Play, Plus, Trash2, RefreshCw,
  Trophy, FastForward, RotateCcw, Link as LinkIcon, Unlink, 
  X, ZoomIn, ZoomOut, Type, CheckCircle2
} from 'lucide-react';

type Level = 'A' | 'B' | 'C';

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  imputedPlayCount: number; // 休み中に加算された「みなし試合数」
  lastPlayedTime: number;
  matchHistory: Record<number, number>;
  pairHistory: Record<number, number>;
  fixedPairMemberId: number | null;
}

interface Court {
  id: number;
  match: { p1: number; p2: number; p3: number; p4: number; level?: Level; } | null;
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
  fontScale: number;
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
    fontScale: 1.0,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [editingPairMemberId, setEditingPairMemberId] = useState<number | null>(null);

  // --- 1. 全バージョン対応のデータ読み込み (v1〜v16を走査) ---
  useEffect(() => {
    const currentKey = 'doubles-app-data-v17';
    const savedDataV17 = localStorage.getItem(currentKey);
    
    if (savedDataV17) {
      const data = JSON.parse(savedDataV17);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(prev => ({ ...prev, ...(data.config || {}) }));
      setNextMemberId(data.nextMemberId || 1);
    } else {
      // 過去のすべてのキー(v16からv1まで)を遡って探す
      let oldDataRaw = null;
      for (let v = 16; v >= 1; v--) {
        const found = localStorage.getItem(`doubles-app-data-v${v}`);
        if (found) {
          oldDataRaw = found;
          break;
        }
      }

      if (oldDataRaw) {
        try {
          const oldData = JSON.parse(oldDataRaw);
          const migratedMembers = (oldData.members || []).map((m: any) => ({
            id: m.id,
            name: m.name || `${m.id}`,
            level: m.level || 'A',
            isActive: m.isActive !== undefined ? m.isActive : true,
            playCount: m.playCount || 0,
            imputedPlayCount: m.imputedPlayCount || 0,
            lastPlayedTime: m.lastPlayedTime || 0,
            matchHistory: m.matchHistory || {},
            pairHistory: m.pairHistory || {},
            fixedPairMemberId: m.fixedPairMemberId || null,
          }));
          
          setMembers(migratedMembers);
          if (oldData.config) {
            setConfig(prev => ({ 
              ...prev, 
              courtCount: oldData.config.courtCount || 4, 
              levelStrict: oldData.config.levelStrict || false 
            }));
          }
          setNextMemberId(oldData.nextMemberId || (migratedMembers.length + 1));
          setCourts(Array.from({ length: oldData.config?.courtCount || 4 }, (_, i) => ({ id: i + 1, match: null })));
        } catch (e) {
          setCourts(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
        }
      } else {
        setCourts(Array.from({ length: 4 }, (_, i) => ({ id: i + 1, match: null })));
      }
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const data = { members, courts, matchHistory, config, nextMemberId };
    localStorage.setItem('doubles-app-data-v17', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  // --- 2. 未来予測 & 組み合わせロジック (v15 核心部分) ---
  const getMatchForCourt = (currentCourts: Court[], currentMembers: Member[]) => {
    const playingIds = new Set<number>();
    currentCourts.forEach(c => { if (c.match) [c.match.p1, c.match.p2, c.match.p3, c.match.p4].forEach(id => playingIds.add(id)); });
    
    const candidates = currentMembers.filter(m => m.isActive && !playingIds.has(m.id));
    if (candidates.length < 4) return null;

    // 優先度：試合数(実試合+みなし)が少ない順、次に待ち時間が長い順
    const sortedCandidates = [...candidates].sort((a, b) => {
      const aTotal = a.playCount + a.imputedPlayCount;
      const bTotal = b.playCount + b.imputedPlayCount;
      if (aTotal !== bTotal) return aTotal - bTotal;
      return a.lastPlayedTime - b.lastPlayedTime;
    });

    let selected: Member[] = [];
    if (config.levelStrict) {
      // 最も長く待っている人のレベルを基準にする
      const targetLevel = sortedCandidates[0].level;
      const sameLevel = sortedCandidates.filter(c => c.level === targetLevel);
      if (sameLevel.length < 4) return null;
      selected = sameLevel.slice(0, 4);
    } else {
      selected = sortedCandidates.slice(0, 4);
    }

    if (selected.length < 4) return null;

    // 3パターンの組み合わせシミュレーション (未来予測)
    const p = selected;
    const combinations = [
      { t1: [p[0], p[1]], t2: [p[2], p[3]] },
      { t1: [p[0], p[2]], t2: [p[1], p[3]] },
      { t1: [p[0], p[3]], t2: [p[1], p[2]] }
    ];

    const scored = combinations.map(combo => {
      const [a, b] = combo.t1;
      const [c, d] = combo.t2;
      
      let score = 0;
      // ペア履歴 (重み 3)
      score += ((a.pairHistory[b.id] || 0) + (c.pairHistory[d.id] || 0)) * 3;
      // 対戦履歴 (重み 1)
      score += (a.matchHistory[c.id] || 0) + (a.matchHistory[d.id] || 0) + 
               (b.matchHistory[c.id] || 0) + (b.matchHistory[d.id] || 0);

      // 固定ペアの強制適用
      if (a.fixedPairMemberId === b.id) score -= 1000;
      if (c.fixedPairMemberId === d.id) score -= 1000;
      
      return { combo, score };
    });

    const best = scored.sort((a, b) => a.score - b.score)[0].combo;
    return { 
      p1: best.t1[0].id, p2: best.t1[1].id, 
      p3: best.t2[0].id, p4: best.t2[1].id, 
      level: config.levelStrict ? best.t1[0].level : undefined 
    };
  };

  // --- 3. 試合結果適用 & みなし試合数計算 ---
  const applyMatch = (p1: number, p2: number, p3: number, p4: number) => {
    const now = Date.now();
    const ids = [p1, p2, p3, p4];
    
    setMembers(prev => {
      const updated = prev.map(m => {
        if (!ids.includes(m.id)) return m;
        const nmh = { ...m.matchHistory };
        const nph = { ...m.pairHistory };
        let partner = 0, opps: number[] = [];
        if (m.id === p1) { partner = p2; opps = [p3, p4]; }
        else if (m.id === p2) { partner = p1; opps = [p3, p4]; }
        else if (m.id === p3) { partner = p4; opps = [p1, p2]; }
        else if (m.id === p4) { partner = p3; opps = [p1, p2]; }
        nph[partner] = (nph[partner] || 0) + 1;
        opps.forEach(o => nmh[o] = (nmh[o] || 0) + 1);
        return { ...m, playCount: m.playCount + 1, lastPlayedTime: now, matchHistory: nmh, pairHistory: nph };
      });

      // 休み中の人に「平均試合数」までの差分をみなしとして付与
      const actives = updated.filter(x => x.isActive);
      if (actives.length === 0) return updated;
      const avg = Math.floor(actives.reduce((s, x) => s + x.playCount + x.imputedPlayCount, 0) / actives.length);

      return updated.map(m => {
        const total = m.playCount + m.imputedPlayCount;
        if (!m.isActive && total < avg) {
          return { ...m, imputedPlayCount: m.imputedPlayCount + (avg - total) };
        }
        return m;
      });
    });
  };

  const generateNextMatch = (courtId: number) => {
    const m = getMatchForCourt(courts, members);
    if (!m) return alert('条件に合うメンバーが足りません');
    const names = [m.p1, m.p2, m.p3, m.p4].map(id => members.find(x => x.id === id)?.name || '?');
    setMatchHistory(prev => [{ id: Date.now().toString(), timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId, players: names, playerIds: [m.p1, m.p2, m.p3, m.p4], level: m.level }, ...prev]);
    applyMatch(m.p1, m.p2, m.p3, m.p4);
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: m } : c));
  };

  const handleBulkAction = () => {
    setCourts(prev => prev.map(c => ({ ...c, match: null })));
    setTimeout(() => {
      setCourts(prev => {
        let current = [...prev];
        for (let i = 0; i < current.length; i++) {
          const m = getMatchForCourt(current, members);
          if (m) {
            const names = [m.p1, m.p2, m.p3, m.p4].map(id => members.find(x => x.id === id)?.name || '?');
            setMatchHistory(ph => [{ id: Date.now().toString() + i, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), courtId: current[i].id, players: names, playerIds: [m.p1, m.p2, m.p3, m.p4], level: m.level }, ...ph]);
            current[i] = { ...current[i], match: m };
            applyMatch(m.p1, m.p2, m.p3, m.p4);
          }
        }
        return current;
      });
    }, 150);
  };

  const unifiedBaseSize = (() => {
    const names = members.filter(m => m.isActive).map(m => m.name);
    if (names.length === 0) return '2.5rem';
    const maxL = Math.max(...names.map(n => /^[\x20-\x7E]*$/.test(n) ? n.length * 0.6 : n.length));
    return `${Math.max(0.8, Math.min(3.5, 2.5 * (3.5 / (maxL + 1.5))))}rem`;
  })();

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-20 font-sans">
      <header className="bg-blue-800 text-white px-4 py-2 shadow flex justify-between items-center sticky top-0 z-20">
        <h1 className="text-lg font-bold flex items-center gap-2"><Trophy size={18} /> ダブルスメーカー v17</h1>
        <div className="flex items-center gap-2">
          {activeTab === 'dashboard' && (
            <>
              <div className="flex bg-blue-900/50 rounded-lg p-0.5">
                <button onClick={() => setConfig(p => ({ ...p, fontScale: Math.max(0.5, p.fontScale - 0.1) }))} className="w-8 h-8 flex items-center justify-center">-</button>
                <button onClick={() => setConfig(p => ({ ...p, fontScale: Math.min(2.0, p.fontScale + 0.1) }))} className="w-8 h-8 flex items-center justify-center">+</button>
              </div>
              <button onClick={handleBulkAction} className="bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md">一括更新</button>
            </>
          )}
        </div>
      </header>

      <main className="p-2 max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 landscape:grid-cols-2 lg:grid-cols-2 gap-2">
            {courts.map(court => (
              <div key={court.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col" style={{ height: `${200 * config.zoomLevel}px` }}>
                <div className="bg-gray-100 px-3 h-8 border-b flex justify-between items-center shrink-0">
                  <span className="font-bold text-xs text-gray-500 uppercase">Court {court.id} {court.match?.level && <span className="bg-blue-600 text-white px-1.5 rounded ml-2">{court.match.level}</span>}</span>
                  {court.match && <button onClick={() => setCourts(prev => prev.map(c => c.id === court.id ? { ...c, match: null } : c))} className="text-gray-600 flex items-center gap-1 text-xs font-bold"><CheckCircle2 size={14}/>終了</button>}
                </div>
                <div className="flex-1 p-1">
                  {court.match ? (
                    <div className="flex h-full w-full gap-1">
                      <div className="flex-1 flex flex-col bg-blue-50/50 rounded-l overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-blue-100/50 p-1"><div className="font-black text-blue-900 text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p1)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-blue-900 text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p2)?.name}</div></div>
                      </div>
                      <div className="w-6 flex items-center justify-center relative"><div className="absolute inset-y-2 left-1/2 w-px bg-gray-200 -translate-x-1/2"></div><div className="bg-white z-10 px-1 py-0.5 text-[9px] font-bold text-gray-400 border rounded">VS</div></div>
                      <div className="flex-1 flex flex-col bg-red-50/50 rounded-r overflow-hidden">
                        <div className="flex-1 flex items-center justify-center border-b border-red-100/50 p-1"><div className="font-black text-red-900 text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p3)?.name}</div></div>
                        <div className="flex-1 flex items-center justify-center p-1"><div className="font-black text-red-900 text-center break-words w-full" style={{ fontSize: `calc(${unifiedBaseSize} * ${config.fontScale})` }}>{members.find(m => m.id === court.match?.p4)?.name}</div></div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => generateNextMatch(court.id)} className="w-full h-full flex flex-col items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors border-2 border-dashed border-gray-200 rounded-lg"><Play size={40}/><span className="text-xs font-bold mt-2">試合を組む</span></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'members' && (
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="flex justify-between items-center py-2 px-1"><h2 className="font-bold">名簿 ({members.length})</h2><button onClick={() => { setMembers([...members, { id: nextMemberId, name: `${nextMemberId}`, level: 'A', isActive: true, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {}, fixedPairMemberId: null }]); setNextMemberId(n => n + 1); }} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1"><Plus size={18}/>選手追加</button></div>
            <div className="bg-white rounded-xl shadow-sm divide-y overflow-hidden">
              {members.map(m => (
                <div key={m.id} className={`p-3 flex items-center gap-3 ${!m.isActive ? 'bg-gray-50 opacity-40' : ''}`}>
                  <div className="flex-1"><input value={m.name} onChange={e => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} className="w-full font-bold text-lg bg-transparent outline-none focus:text-blue-600" />
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, level: x.level === 'A' ? 'B' : x.level === 'B' ? 'C' : 'A' } : x))} className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${m.level === 'A' ? 'bg-blue-600' : m.level === 'B' ? 'bg-yellow-500' : 'bg-red-500'}`}>Lv{m.level}</button>
                      <button onClick={() => setEditingPairMemberId(m.id)} className="text-[10px] font-bold px-2 py-0.5 rounded border border-gray-300 text-gray-500 flex items-center gap-1">{m.fixedPairMemberId ? <LinkIcon size={10}/> : <Unlink size={10}/>}ペア</button>
                      <span className="text-[10px] text-gray-400 font-mono">Count: {m.playCount}{m.imputedPlayCount > 0 && `(+${m.imputedPlayCount})`}</span>
                    </div>
                  </div>
                  <button onClick={() => setMembers(prev => prev.map(x => x.id === m.id ? { ...x, isActive: !x.isActive } : x))} className={`px-4 py-1.5 rounded-lg font-bold text-sm border-2 ${m.isActive ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-gray-200 text-gray-300'}`}>{m.isActive ? '参加' : '休み'}</button>
                  <button onClick={() => setMembers(prev => prev.filter(x => x.id !== m.id))} className="text-gray-200 hover:text-red-500"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingPairMemberId && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingPairMemberId(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-gray-100 px-4 py-3 flex justify-between items-center border-b"><h3 className="font-bold">固定ペア設定</h3><button onClick={() => setEditingPairMemberId(null)}><X size={20}/></button></div>
              <div className="p-2 space-y-1">
                <button onClick={() => {
                  setMembers(prev => prev.map(m => {
                    if (m.id === editingPairMemberId) return { ...m, fixedPairMemberId: null };
                    if (m.fixedPairMemberId === editingPairMemberId) return { ...m, fixedPairMemberId: null };
                    return m;
                  }));
                  setEditingPairMemberId(null);
                }} className="w-full text-left p-3 hover:bg-red-50 text-red-600 font-bold border-b">ペアを解消</button>
                {members.filter(m => m.id !== editingPairMemberId && m.isActive).map(m => (
                  <button key={m.id} onClick={() => {
                    setMembers(prev => prev.map(x => {
                      if (x.id === editingPairMemberId) return { ...x, fixedPairMemberId: m.id };
                      if (x.id === m.id) return { ...x, fixedPairMemberId: editingPairMemberId };
                      if (x.fixedPairMemberId === editingPairMemberId || x.fixedPairMemberId === m.id) return { ...x, fixedPairMemberId: null };
                      return x;
                    }));
                    setEditingPairMemberId(null);
                  }} className="w-full text-left p-3 hover:bg-blue-50 border-b flex items-center justify-between"><span>{m.name}</span><span className={`text-[10px] px-2 rounded text-white ${m.level === 'A' ? 'bg-blue-500' : 'bg-gray-400'}`}>{m.level}</span></button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden max-w-2xl mx-auto mt-2">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-400 font-bold uppercase text-[10px]"><tr><th className="p-3">時刻</th><th className="p-3">対戦</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {matchHistory.map(h => (
                  <tr key={h.id}><td className="p-3 text-gray-400 font-mono text-xs">{h.timestamp}</td><td className="p-3 font-bold">{h.level && <span className="bg-gray-200 text-gray-600 px-1 rounded text-[10px] mr-2">Lv{h.level}</span>}{h.players[0]} & {h.players[1]} <span className="text-gray-300 mx-1">vs</span> {h.players[2]} & {h.players[3]}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6 max-w-2xl mx-auto mt-2">
            <div><label className="block text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">コート数: <span className="text-blue-600 text-xl ml-2">{config.courtCount}</span></label><input type="range" min="1" max="8" value={config.courtCount} onChange={e => { const c = parseInt(e.target.value); setConfig(p => ({ ...p, courtCount: c })); setCourts(Array.from({ length: c }, (_, i) => ({ id: i + 1, match: null }))); }} className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div>
            <div className="flex items-center justify-between py-4 border-y border-gray-50"><span className="font-bold text-gray-700">レベル厳格モード</span><button onClick={() => setConfig(p => ({ ...p, levelStrict: !p.levelStrict }))} className={`w-12 h-6 rounded-full transition-colors ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-200'} relative`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${config.levelStrict ? 'left-7' : 'left-1'}`} /></button></div>
            <div className="space-y-3"><button onClick={() => { if(confirm('試合数と履歴を消去しますか？')) { setMembers(m => m.map(x => ({ ...x, playCount: 0, imputedPlayCount: 0, lastPlayedTime: 0, matchHistory: {}, pairHistory: {} }))); setMatchHistory([]); } }} className="w-full py-3 bg-gray-50 text-gray-600 rounded-lg font-bold border flex items-center justify-center gap-2"><RotateCcw size={18}/> 試合数リセット</button><button onClick={() => { if(confirm('全データを削除しますか？')) { localStorage.clear(); location.reload(); } }} className="w-full py-3 bg-red-50 text-red-500 rounded-lg font-bold border border-red-100">完全消去</button></div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex justify-around pb-safe z-30 shadow-lg">
        {[ { id: 'dashboard', icon: Play, label: '試合' }, { id: 'members', icon: Users, label: '名簿' }, { id: 'history', icon: History, label: '履歴' }, { id: 'settings', icon: Settings, label: '設定' } ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex flex-col items-center py-2 px-6 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-300'}`}><tab.icon size={24} /><span className="text-[10px] font-bold mt-1">{tab.label}</span></button>
        ))}
      </nav>
    </div>
  );
}
