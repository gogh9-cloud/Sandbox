import { useState, useEffect } from 'react';
import { fetchAllSessions, updateSessionMessages, removeSession } from './lib/sessionsDb';
import { useAuth } from './lib/auth';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft, Users, MonitorPlay, MessageSquare, Clock, Trash2 } from 'lucide-react';
import './App.css';

const getNowTimestamp = () => Date.now();

function TeacherDashboard() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const navigate = useNavigate();
  const { isTeacher, loading: authLoading } = useAuth();

  useEffect(() => {
    if (isTeacher) {
      fetchSessions();
    }
  }, [isTeacher]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const fetched = await fetchAllSessions();
      setSessions(fetched);

      // Clean up selectedIds that are no longer in fetched list
      const fetchedIds = new Set(fetched.map(s => s.id));
      setSelectedIds(prev => prev.filter(id => fetchedIds.has(id)));
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
    }
    setLoading(false);
  }

  const handleBack = () => {
    navigate('/');
  };

  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  };

  const handleUnban = async (session) => {
    if (!window.confirm(`${session.student_name} 학생의 정지를 해제하시겠습니까?`)) return;

    // Filter out the metadata message if it exists
    const cleanMessages = (session.messages || []).filter(m => m.sender !== 'metadata');

    // Append AI unban notice message and the updated metadata
    const updatedMessages = [
      ...cleanMessages,
      {
        id: getNowTimestamp(),
        sender: 'ai',
        text: '선생님께서 대화를 다시 할 수 있도록 허락해주셨어요! 앞으로는 고운 말을 사용해 주세요. 😊'
      },
      {
        id: 'metadata',
        sender: 'metadata',
        isBanned: false,
        violationCount: 0,
        banmalCount: 0
      }
    ];

    try {
      await updateSessionMessages(session.id, updatedMessages);
      alert('정지가 성공적으로 해제되었습니다.');

      // Update selectedSession state immediately to reflect in UI
      const updatedSessionObj = {
        ...session,
        messages: updatedMessages,
        updated_at: new Date().toISOString()
      };
      setSelectedSession(updatedSessionObj);

      // Refresh session list
      fetchSessions();
    } catch (e) {
      console.error('Unban exception:', e);
      alert(`정지 해제에 실패했습니다. (에러: ${e.message})`);
    }
  };

  const handleDeleteSession = async (e, session) => {
    e.stopPropagation();
    if (!window.confirm(`${session.student_name} 학생의 '${session.title || '새 채팅'}' 세션을 삭제하시겠습니까?\n삭제 시 학생의 PC에서도 해당 세션이 삭제됩니다.`)) return;

    try {
      await removeSession(session.id);
      alert('세션이 성공적으로 삭제되었습니다.');
      if (selectedSession && selectedSession.id === session.id) {
        setSelectedSession(null);
      }
      // Remove from selectedIds state
      setSelectedIds(prev => prev.filter(id => id !== session.id));
      fetchSessions();
    } catch (e) {
      console.error('Delete session exception:', e);
      alert(`세션 삭제에 실패했습니다. (에러: ${e.message})`);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(sessions.map(s => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (e, sessionId) => {
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, sessionId]);
    } else {
      setSelectedIds(prev => prev.filter(id => id !== sessionId));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    
    if (!window.confirm(`선택한 ${selectedIds.length}개의 세션을 삭제하시겠습니까?\n삭제 시 해당 학생들의 PC에서도 세션이 삭제됩니다.`)) return;

    try {
      const results = await Promise.allSettled(selectedIds.map(id => removeSession(id)));
      const errors = results.filter(r => r.status === 'rejected');

      if (errors.length > 0) {
        console.error('Some bulk deletes failed:', errors);
        alert(`${errors.length}개의 세션 삭제에 실패했습니다.`);
        fetchSessions();
      } else {
        alert('선택한 세션이 성공적으로 삭제되었습니다.');
        if (selectedSession && selectedIds.includes(selectedSession.id)) {
          setSelectedSession(null);
        }
        setSelectedIds([]);
        fetchSessions();
      }
    } catch (e) {
      console.error('Bulk delete exception:', e);
      alert('세션 삭제 중 오류가 발생했습니다.');
    }
  };

  if (authLoading) {
    return (
      <div className="login-container">
        <div className="login-card glass">
          <Sparkles size={48} color="#c084fc" className="animate-spin" />
        </div>
      </div>
    );
  }

  if (!isTeacher) {
    return (
      <div className="login-container">
        <div className="login-card glass">
          <Sparkles size={48} color="#c084fc" style={{ marginBottom: '20px' }} />
          <h2>선생님 전용 화면이에요</h2>
          <p className="login-subtitle">교사 권한이 있는 계정으로 로그인해야 볼 수 있어요.</p>
          <button className="google-login-button" onClick={handleBack}>학생 화면으로 돌아가기</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-container">
        <div className="login-card glass">
          <Sparkles size={48} color="#c084fc" className="animate-spin" style={{ marginBottom: '20px' }} />
          <h2>데이터를 불러오는 중입니다...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container dashboard-container">
      <header className="header glass dashboard-header">
        <div className="header-left">
          <button className="toggle-panel-btn" onClick={handleBack} title="학생용 샌드박스로 돌아가기">
            <ArrowLeft size={24} />
          </button>
          <Sparkles size={28} color="#38bdf8" />
          <h1 className="header-title" style={{ background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text' }}>
            선생님 전용 모니터링 대시보드
          </h1>
        </div>
        <div className="header-right">
          <div className="stat-badge">
            <Users size={16} /> 총 세션 수: {sessions.length}
          </div>
        </div>
      </header>

      <main className="main-content dashboard-main">
        {/* 학생 목록 사이드바 */}
        <aside className="sidebar glass dashboard-sidebar" style={{ width: '300px' }}>
          <h3 className="sidebar-title" style={{ padding: '0 12px', color: 'var(--text-muted)' }}>학생 활동 내역</h3>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            padding: '0 12px 12px 12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '8px',
            gap: '8px'
          }}>
            <label style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer',
              fontSize: '0.85rem',
              color: 'var(--text-muted)'
            }}>
              <input 
                type="checkbox" 
                checked={sessions.length > 0 && selectedIds.length === sessions.length}
                onChange={handleSelectAll}
                style={{ cursor: 'pointer', accentColor: '#c084fc' }}
              />
              전체 선택
            </label>
            {selectedIds.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                style={{
                  padding: '4px 8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '6px',
                  color: '#fc8181',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#ef4444';
                  e.currentTarget.style.color = 'white';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.color = '#fc8181';
                }}
              >
                <Trash2 size={12} />
                선택 삭제 ({selectedIds.length})
              </button>
            )}
          </div>

          <div className="session-list">
            {sessions.map(session => {
              const metadata = session.messages?.find(m => m.sender === 'metadata');
              let isBanned = metadata ? metadata.isBanned : false;
              
              if (!metadata && session.messages && session.messages.length > 0) {
                const lastAiMessage = [...session.messages].reverse().find(m => m.sender === 'ai');
                if (lastAiMessage && (
                  lastAiMessage.text.includes('영구 중지') || 
                  lastAiMessage.text.includes('중지되었습니다') || 
                  lastAiMessage.text.includes('선생님께 문의')
                )) {
                  isBanned = true;
                }
              }
              return (
                <div 
                  key={session.id} 
                  className={`session-item ${selectedSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => setSelectedSession(session)}
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(session.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleSelectOne(e, session.id)}
                      style={{ cursor: 'pointer', accentColor: '#c084fc' }}
                    />
                    <img src={`https://ui-avatars.com/api/?name=${session.student_name}&background=random`} alt="avatar" style={{ width: 24, height: 24, borderRadius: '50%' }} />
                    <span className="session-title" style={{ fontWeight: 'bold', color: 'white' }}>{session.student_name}</span>
                    {isBanned && (
                      <span style={{ 
                        fontSize: '0.7rem', 
                        backgroundColor: '#ef4444', 
                        color: 'white', 
                        padding: '2px 6px', 
                        borderRadius: '4px', 
                        marginLeft: '4px',
                        fontWeight: 'bold'
                      }}>정지됨</span>
                    )}
                    <button
                      onClick={(e) => handleDeleteSession(e, session)}
                      title="세션 삭제"
                      style={{
                        marginLeft: 'auto',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#ef4444'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <MessageSquare size={12} /> {session.title || '새 채팅'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'gray' }}>
                    <Clock size={12} /> {formatDate(session.updated_at)}
                  </div>
                </div>
              );
            })}
            {sessions.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'gray' }}>
                아직 기록된 학생 데이터가 없습니다.
              </div>
            )}
          </div>
        </aside>

        {/* 선택된 학생 모니터링 패널 */}
        <section className="preview-panel glass dashboard-viewer" style={{ flex: 1, flexDirection: 'row' }}>
          {selectedSession ? (
            <>
              <div className="chat-panel" style={{ flex: 1, borderRight: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)' }}>
                {(() => {
                  const selectedMetadata = selectedSession.messages?.find(m => m.sender === 'metadata');
                  let isSelectedBanned = selectedMetadata ? selectedMetadata.isBanned : false;
                  
                  if (!selectedMetadata && selectedSession.messages && selectedSession.messages.length > 0) {
                    const lastAiMessage = [...selectedSession.messages].reverse().find(m => m.sender === 'ai');
                    if (lastAiMessage && (
                      lastAiMessage.text.includes('영구 중지') || 
                      lastAiMessage.text.includes('중지되었습니다') || 
                      lastAiMessage.text.includes('선생님께 문의')
                    )) {
                      isSelectedBanned = true;
                    }
                  }
                  return (
                    <>
                      <div className="preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <h3 style={{ fontSize: '1rem', color: 'white', margin: 0 }}>
                          대화 내역 ({selectedSession.student_name})
                        </h3>
                        {isSelectedBanned && (
                          <button 
                            onClick={() => handleUnban(selectedSession)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              transition: 'background-color 0.2s',
                            }}
                            onMouseOver={(e) => e.target.style.backgroundColor = '#dc2626'}
                            onMouseOut={(e) => e.target.style.backgroundColor = '#ef4444'}
                          >
                            정지 해제
                          </button>
                        )}
                      </div>
                      {isSelectedBanned && (
                        <div style={{
                          padding: '10px 16px',
                          backgroundColor: 'rgba(239, 68, 68, 0.15)',
                          borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#fca5a5',
                          fontSize: '0.85rem'
                        }}>
                          ⚠️ 이 학생은 비속어 반복 사용으로 인해 대화가 정지되었습니다.
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="message-list">
                  {selectedSession.messages && selectedSession.messages
                    .filter(msg => msg.sender !== 'metadata')
                    .map((msg, idx) => (
                      <div key={idx} className={`message ${msg.sender}`}>
                        {msg.text}
                      </div>
                    ))
                  }
                </div>
              </div>
              <div className="iframe-container" style={{ flex: 1.5 }}>
                <div className="preview-header">
                  <h3 style={{ fontSize: '1rem', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MonitorPlay size={16} /> 결과물(코드) 미리보기
                  </h3>
                </div>
                {selectedSession.html_code ? (
                  <iframe 
                    title="sandbox-preview"
                    srcDoc={selectedSession.html_code}
                    sandbox="allow-scripts"
                    style={{ width: '100%', height: 'calc(100% - 48px)', border: 'none' }}
                  />
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'gray' }}>코드가 없습니다.</div>
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'gray', flexDirection: 'column', gap: '16px' }}>
              <MonitorPlay size={48} opacity={0.5} />
              <p>왼쪽 목록에서 학생을 선택하면 상세 내용을 볼 수 있습니다.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default TeacherDashboard;
