'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  Settings, 
  History, 
  Play, 
  Plus, 
  Trash2, 
  RefreshCw,
  Trophy,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

// --- 型定義 ---

type Level = 1 | 2 | 3;

interface Member {
  id: number;
  name: string;
  level: Level;
  isActive: boolean;
  playCount: number;
  matchHistory: Record<number, number>; // { memberId: timesPlayedTogether }
}

interface Court {
  id: number;
  match: {
    p1: number;
    p2: number;
    p3: number;
    p4: number;
  } | null;
}

interface MatchRecord {
  id: string;
  timestamp: string;
  courtId: number;
  players: string[]; // Names
  playerIds: number[];
}

interface AppConfig {
  courtCount: number;
  levelStrict: boolean;
  initialRandom: boolean;
}

// --- メインコンポーネント ---

export default function DoublesMatchupApp() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'history' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchRecord[]>([]);
  const [config, setConfig] = useState<AppConfig>({
    courtCount: 2,
    levelStrict: false,
    initialRandom: false,
  });
  const [nextMemberId, setNextMemberId] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  // --- 初期化 & LocalStorage 読み込み ---
  useEffect(() => {
    const savedData = localStorage.getItem('doubles-app-data');
    if (savedData) {
      const data = JSON.parse(savedData);
      setMembers(data.members || []);
      setCourts(data.courts || []);
      setMatchHistory(data.matchHistory || []);
      setConfig(data.config || { courtCount: 2, levelStrict: false, initialRandom: false });
      setNextMemberId(data.nextMemberId || 1);
    } else {
      // 初回起動時のダミーデータなど（必要なら）
      initializeCourts(2);
    }
    setIsInitialized(true);
  }, []);

  // --- データ保存 ---
  useEffect(() => {
    if (!isInitialized) return;
    const data = {
      members,
      courts,
      matchHistory,
      config,
      nextMemberId
    };
    localStorage.setItem('doubles-app-data', JSON.stringify(data));
  }, [members, courts, matchHistory, config, nextMemberId, isInitialized]);

  // --- ロジック関数 ---

  const initializeCourts = (count: number) => {
    const newCourts: Court[] = [];
    for (let i = 1; i <= count; i++) {
      newCourts.push({ id: i, match: null });
    }
    setCourts(newCourts);
  };

  // コート数変更時の処理
  const handleCourtCountChange = (count: number) => {
    setConfig(prev => ({ ...prev, courtCount: count }));
    // 既存のコート状態を維持しつつ増減
    setCourts(prev => {
      if (count > prev.length) {
        const added: Court[] = [];
        for (let i = prev.length + 1; i <= count; i++) {
          added.push({ id: i, match: null });
        }
        return [...prev, ...added];
      } else {
        return prev.slice(0, count);
      }
    });
  };

  // メンバー追加（途中参加対応：平均回数を付与）
  const addMember = () => {
    const activeMembers = members.filter(m => m.isActive);
    let initialPlayCount = 0;
    if (activeMembers.length > 0) {
      const totalPlays = activeMembers.reduce((sum, m) => sum + m.playCount, 0);
      initialPlayCount = Math.floor(totalPlays / activeMembers.length);
    }

    const newMember: Member = {
      id: nextMemberId,
      name: `メンバー ${nextMemberId}`,
      level: 2, // Default Middle
      isActive: true,
      playCount: initialPlayCount,
      matchHistory: {}
    };
    setMembers([...members, newMember]);
    setNextMemberId(prev => prev + 1);
  };

  // 試合生成アルゴリズム
  const generateNextMatch = (courtId: number) => {
    // 1. 試合中でない、かつActiveなメンバーを取得
    const playingMemberIds = new Set<number>();
    courts.forEach(c => {
      if (c.match) {
        playingMemberIds.add(c.match.p1);
        playingMemberIds.add(c.match.p2);
        playingMemberIds.add(c.match.p3);
        playingMemberIds.add(c.match.p4);
      }
    });

    const candidates = members.filter(m => m.isActive && !playingMemberIds.has(m.id));

    if (candidates.length < 4) {
      alert('待機中のメンバーが4名未満のため、試合を組めません。');
      return;
    }

    // 2. 候補選定（優先順位づけ）
    // 優先度: 試合回数(昇順) > ID(ランダム性を持たせるためシャッフルしても良いが、今回は公平性重視)
    // ※ 完全にランダムにするか、順番にするかはConfig次第だが、基本は「回数平等」
    
    // 候補リストをシャッフル（同率の場合のバラつきのため）
    const shuffledCandidates = [...candidates].sort(() => Math.random() - 0.5);

    // 試合回数でソート
    shuffledCandidates.sort((a, b) => a.playCount - b.playCount);

    let selectedPlayers: Member[] = [];

    if (config.levelStrict) {
      // レベル厳格モード：同じレベルで4人揃うグループを優先的に探す
      // 待機優先度が高い人から順に、その人のレベルで4人揃うか確認する
      for (const candidate of shuffledCandidates) {
        const sameLevelGroup = shuffledCandidates.filter(m => m.level === candidate.level);
        if (sameLevelGroup.length >= 4) {
          // このレベルグループから、優先度が高い順（shuffledCandidatesの順序はPlayCount順）に4人選出
          selectedPlayers = sameLevelGroup.slice(0, 4);
          break;
        }
      }
      if (selectedPlayers.length < 4) {
        alert('同一レベル設定が有効ですが、同じレベルで4名揃う待機メンバーがいません。');
        return;
      }
    } else {
      // 通常モード：単に優先度が高い4人を選ぶ
      selectedPlayers = shuffledCandidates.slice(0, 4);
    }

    // 3. 組み合わせ最適化（バラバラにする）
    // 4人の中で、過去の対戦回数の総和が最も少なくなるペアリングを探す
    // パターンA: (0,1) vs (2,3)
    // パターンB: (0,2) vs (1,3)
    // パターンC: (0,3) vs (1,2)
    
    const p = selectedPlayers;
    const calcCost = (p1: Member, p2: Member, p3: Member, p4: Member) => {
      // 同じコートに立った回数を取得
      const getCount = (m1: Member, m2: Member) => m1.matchHistory[m2.id] || 0;
      // この組み合わせの「飽き」コスト
      return getCount(p1, p2) + getCount(p1, p3) + getCount(p1, p4) +
             getCount(p2, p3) + getCount(p2, p4) +
             getCount(p3, p4);
    };

    const costA = calcCost(p[0], p[1], p[2], p[3]);
    const costB = calcCost(p[0], p[2], p[1], p[3]);
    const costC = calcCost(p[0], p[3], p[1], p[2]);

    let finalOrder = [0, 1, 2, 3]; // Default A
    if (costB < costA && costB <= costC) finalOrder = [0, 2, 1, 3];
    if (costC < costA && costC < costB) finalOrder = [0, 3, 1, 2];

    const matchPlayers = {
      p1: p[finalOrder[0]].id,
      p2: p[finalOrder[1]].id,
      p3: p[finalOrder[2]].id,
      p4: p[finalOrder[3]].id,
    };

    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: matchPlayers } : c));
  };

  // 試合終了処理
  const finishMatch = (courtId: number) => {
    const court = courts.find(c => c.id === courtId);
    if (!court || !court.match) return;

    const { p1, p2, p3, p4 } = court.match;
    const playerIds = [p1, p2, p3, p4];
    
    // 履歴保存用データ作成
    const playerNames = playerIds.map(id => members.find(m => m.id === id)?.name || '不明');
    const newRecord: MatchRecord = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      courtId,
      players: playerNames,
      playerIds
    };

    setMatchHistory(prev => [newRecord, ...prev]);

    // メンバー情報更新（プレイ回数増加 & 対戦履歴更新）
    setMembers(prev => prev.map(m => {
      if (playerIds.includes(m.id)) {
        const newHistory = { ...m.matchHistory };
        playerIds.forEach(otherId => {
          if (m.id !== otherId) {
            newHistory[otherId] = (newHistory[otherId] || 0) + 1;
          }
        });
        return {
          ...m,
          playCount: m.playCount + 1,
          matchHistory: newHistory
        };
      }
      return m;
    }));

    // コートを空にする
    setCourts(prev => prev.map(c => c.id === courtId ? { ...c, match: null } : c));
  };

  // データリセット
  const resetAll = () => {
    if(!confirm('全てのデータを削除して初期状態に戻しますか？')) return;
    setMembers([]);
    setMatchHistory([]);
    setNextMemberId(1);
    initializeCourts(config.courtCount);
    localStorage.removeItem('doubles-app-data');
  };

  // --- UIサブルーチン ---

  const getMemberName = (id: number) => members.find(m => m.id === id)?.name || `ID:${id}`;
  
  const getLevelBadge = (level: Level) => {
    const colors = { 1: 'bg-green-100 text-green-800', 2: 'bg-yellow-100 text-yellow-800', 3: 'bg-red-100 text-red-800' };
    const labels = { 1: '初級', 2: '中級', 3: '上級' };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level]}`}>{labels[level]}</span>;
  };

  // --- 画面レンダリング ---

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-20 font-sans">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy size={20} />
          ダブルスメーカー
        </h1>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-3xl mx-auto">
        
        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-700">コート状況</h2>
              <div className="text-sm text-gray-500">
                待機: {members.filter(m => m.isActive).length}名
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {courts.map(court => (
                <div key={court.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                  <div className="bg-gray-100 p-2 border-b border-gray-200 flex justify-between items-center">
                    <span className="font-bold text-gray-700">コート {court.id}</span>
                    {court.match ? (
                      <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full animate-pulse">試合中</span>
                    ) : (
                      <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded-full">空き</span>
                    )}
                  </div>
                  
                  <div className="p-4">
                    {court.match ? (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center bg-blue-50 p-2 rounded">
                          <div className="flex-1 text-center font-medium">{getMemberName(court.match.p1)}</div>
                          <div className="text-xs text-gray-400 px-1">&</div>
                          <div className="flex-1 text-center font-medium">{getMemberName(court.match.p2)}</div>
                        </div>
                        <div className="text-center text-xs text-gray-400 font-bold">VS</div>
                        <div className="flex justify-between items-center bg-red-50 p-2 rounded">
                          <div className="flex-1 text-center font-medium">{getMemberName(court.match.p3)}</div>
                          <div className="text-xs text-gray-400 px-1">&</div>
                          <div className="flex-1 text-center font-medium">{getMemberName(court.match.p4)}</div>
                        </div>
                        <button 
                          onClick={() => finishMatch(court.id)}
                          className="w-full mt-2 bg-gray-800 text-white py-2 rounded shadow hover:bg-gray-700 transition flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={16} /> 試合終了
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <p className="text-gray-400 text-sm mb-4">試合が組まれていません</p>
                        <button 
                          onClick={() => generateNextMatch(court.id)}
                          className="bg-blue-600 text-white px-6 py-2 rounded-full shadow hover:bg-blue-700 transition font-bold flex items-center justify-center gap-2 mx-auto"
                        >
                          <Play size={18} /> 次の試合を組む
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Next Candidates Preview (簡易表示) */}
            <div className="mt-8">
              <h3 className="text-sm font-bold text-gray-500 mb-2">次に優先されるメンバー（目安）</h3>
              <div className="bg-white rounded-lg shadow p-3 overflow-x-auto whitespace-nowrap">
                {members
                  .filter(m => m.isActive && !courts.some(c => c.match && [c.match.p1, c.match.p2, c.match.p3, c.match.p4].includes(m.id)))
                  .sort((a, b) => a.playCount - b.playCount) // 単純な回数順表示
                  .slice(0, 8)
                  .map(m => (
                    <div key={m.id} className="inline-block mr-3 text-center bg-gray-50 p-2 rounded min-w-[80px]">
                      <div className="text-xs font-bold text-gray-700 truncate max-w-[80px]">{m.name}</div>
                      <div className="text-[10px] text-gray-500">回数: {m.playCount}</div>
                      <div className="mt-1">{getLevelBadge(m.level)}</div>
                    </div>
                  ))}
                 {members.filter(m => m.isActive).length === 0 && <span className="text-sm text-gray-400">待機メンバーなし</span>}
              </div>
            </div>
          </div>
        )}

        {/* MEMBERS */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-700">メンバー管理 ({members.length}名)</h2>
              <button onClick={addMember} className="bg-green-600 text-white px-3 py-1.5 rounded shadow text-sm flex items-center gap-1">
                <Plus size={16} /> 追加
              </button>
            </div>
            
            <div className="bg-white rounded-lg shadow divide-y divide-gray-100">
              {members.map((member, index) => (
                <div key={member.id} className={`p-3 flex items-center gap-3 ${!member.isActive ? 'bg-gray-50 opacity-60' : ''}`}>
                  <div className="flex flex-col items-center justify-center w-8">
                    <span className="text-xs text-gray-400 font-mono">#{member.id}</span>
                  </div>
                  
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={member.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setMembers(prev => prev.map(m => m.id === member.id ? { ...m, name: newName } : m));
                      }}
                      className="w-full border-b border-transparent focus:border-blue-500 outline-none bg-transparent font-medium"
                      placeholder="名前を入力"
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <select 
                        value={member.level}
                        onChange={(e) => {
                          const newLevel = parseInt(e.target.value) as Level;
                          setMembers(prev => prev.map(m => m.id === member.id ? { ...m, level: newLevel } : m));
                        }}
                        className="text-xs bg-gray-100 rounded border-none py-0.5 pl-1 pr-6"
                      >
                        <option value={1}>初級</option>
                        <option value={2}>中級</option>
                        <option value={3}>上級</option>
                      </select>
                      <span className="text-xs text-gray-500">試合数: {member.playCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setMembers(prev => prev.map(m => m.id === member.id ? { ...m, isActive: !m.isActive } : m))}
                      className={`text-xs px-2 py-1 rounded font-bold border ${member.isActive ? 'border-blue-500 text-blue-600' : 'border-gray-300 text-gray-400'}`}
                    >
                      {member.isActive ? '参加' : '休憩'}
                    </button>
                    <button 
                      onClick={() => {
                        if(confirm('このメンバーを削除しますか？')) {
                          setMembers(prev => prev.filter(m => m.id !== member.id));
                        }
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {members.length === 0 && (
                <div className="p-8 text-center text-gray-400">
                  右上の「追加」ボタンからメンバーを追加してください
                </div>
              )}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-700">対戦履歴</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 text-gray-600 font-medium">
                  <tr>
                    <th className="p-3">時間</th>
                    <th className="p-3">コート</th>
                    <th className="p-3">メンバー</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {matchHistory.map((record) => (
                    <tr key={record.id}>
                      <td className="p-3 text-gray-500">{record.timestamp}</td>
                      <td className="p-3 text-center">{record.courtId}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {record.players.map((p, i) => (
                            <span key={i} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{p}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {matchHistory.length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-6 text-center text-gray-400">履歴はまだありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-700">設定</h2>
            
            <div className="bg-white rounded-lg shadow p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">コート数 (1-8)</label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1" 
                    max="8" 
                    value={config.courtCount}
                    onChange={(e) => handleCourtCountChange(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xl font-bold text-blue-600 w-8 text-center">{config.courtCount}</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-2 border-t border-gray-100">
                <div>
                  <div className="font-medium text-gray-700">レベル厳格モード</div>
                  <div className="text-xs text-gray-500">同じレベルのメンバー同士のみマッチングします</div>
                </div>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, levelStrict: !prev.levelStrict }))}
                  className={`w-12 h-6 rounded-full transition-colors relative ${config.levelStrict ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${config.levelStrict ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button 
                  onClick={resetAll}
                  className="w-full py-2 border border-red-500 text-red-500 rounded hover:bg-red-50 transition flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} /> データを全てリセット
                </button>
                <p className="text-xs text-center text-gray-400 mt-2">メンバー、履歴、設定が全て消去されます</p>
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <div className="flex items-start gap-2">
                <AlertCircle size={20} className="text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-bold mb-1">使い方</p>
                  <ul className="list-disc pl-4 space-y-1 opacity-80">
                    <li>メンバータブで参加者を登録・レベル設定します。</li>
                    <li>ダッシュボードで「次の試合を組む」を押すと、試合数が少ない人を優先して自動マッチングします。</li>
                    <li>試合が終わったら「試合終了」を押してください。</li>
                    <li>データはブラウザに自動保存されます。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around p-2 pb-safe z-20">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 rounded-lg ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Play size={24} />
          <span className="text-[10px] font-bold mt-1">試合</span>
        </button>
        <button onClick={() => setActiveTab('members')} className={`flex flex-col items-center p-2 rounded-lg ${activeTab === 'members' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Users size={24} />
          <span className="text-[10px] font-bold mt-1">メンバー</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 rounded-lg ${activeTab === 'history' ? 'text-blue-600' : 'text-gray-400'}`}>
          <History size={24} />
          <span className="text-[10px] font-bold mt-1">履歴</span>
        </button>
        <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center p-2 rounded-lg ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}>
          <Settings size={24} />
          <span className="text-[10px] font-bold mt-1">設定</span>
        </button>
      </nav>
    </div>
  );
}
