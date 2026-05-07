import React, { useEffect, useRef, useState } from "react";

function extractYouTubeId(text) {
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?&\s]+)/,
    /youtube\.com\/embed\/([^?&\s]+)/,
    /youtube\.com\/shorts\/([^?&\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }

  return null;
}

function createId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function makeSongFromRequest(raw, nickname) {
  const clean = raw.replace(/^!sr\s*/i, "").trim();
  const videoId = extractYouTubeId(clean);

  return {
    id: createId(),
    title: videoId ? `YouTube 영상 ${videoId}` : clean,
    query: clean,
    videoId,
    requestedBy: nickname || "익명",
    createdAt: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default function SongRequestSiteMVP() {
  const [tab, setTab] = useState("chat");
  const [nickname, setNickname] = useState("경모");
  const [message, setMessage] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [chat, setChat] = useState([
    {
      id: "hello",
      user: "SYSTEM",
      text: "유튜브 링크나 노래이름만 입력해도 예약됩니다. 누군가 링크를 예약하면 바로 재생됩니다.",
    },
  ]);
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerState, setPlayerState] = useState("대기 중");

  const playerDivRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  const inviteUrl = typeof window !== "undefined" ? window.location.href : "https://songroom.example.com";

  const addBotMessage = (text) => {
    setChat((prev) => [
      ...prev,
      {
        id: createId(),
        user: "BOT",
        text,
      },
    ]);
  };

  const playSong = (song) => {
    setCurrent(song);
    setCurrentTime(0);
    setDuration(0);
    setPlayerState(song.videoId ? "불러오는 중" : "제목 검색 대기");
    setTab("player");
  };

  const nextSong = () => {
    setQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        setCurrent(null);
        setCurrentTime(0);
        setDuration(0);
        setPlayerState("대기 중");
        return [];
      }

      const [next, ...rest] = prevQueue;
      playSong(next);
      return rest;
    });
  };

  const addSongRequest = (text, user) => {
    const song = makeSongFromRequest(text, user);

    if (!current && song.videoId) {
      playSong(song);
      addBotMessage(`바로 재생합니다: ${song.title}`);
      return;
    }

    setQueue((prev) => [...prev, song]);
    addBotMessage(`예약 완료: ${song.title}`);
  };

  const sendChat = (text, user) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    setChat((prev) => [
      ...prev,
      {
        id: createId(),
        user: user || "익명",
        text: cleanText,
      },
    ]);

    if (cleanText.toLowerCase() === "!list") {
      const list = queue.length
        ? queue.map((song, index) => `${index + 1}. ${song.title}`).join(" / ")
        : "예약된 노래가 없습니다.";
      addBotMessage(list);
      return;
    }

    if (cleanText.toLowerCase() === "!skip") {
      addBotMessage("다음 곡으로 넘깁니다.");
      nextSong();
      return;
    }

    addSongRequest(cleanText, user);
  };

  const submitMessage = () => {
    sendChat(message, nickname);
    setMessage("");
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1600);
    } catch {
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 1600);
    }
  };

  const loadYouTubePlayer = () => {
    setYoutubeEnabled(true);

    if (window.YT && window.YT.Player) {
      setPlayerReady(true);
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      setPlayerReady(true);
    };

    const existingScript = document.querySelector("script[src='https://www.youtube.com/iframe_api']");
    if (!existingScript) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  };

  useEffect(() => {
    if (!youtubeEnabled || !playerReady || !current || !current.videoId || !playerDivRef.current) return;

    if (playerRef.current && playerRef.current.destroy) {
      playerRef.current.destroy();
    }

    playerRef.current = new window.YT.Player(playerDivRef.current, {
      videoId: current.videoId,
      playerVars: {
        autoplay: 1,
        playsinline: 1,
      },
      events: {
        onReady: (event) => {
          setDuration(event.target.getDuration() || 0);
          setPlayerState("재생 준비 완료");
          event.target.playVideo();
        },
        onStateChange: (event) => {
          const YTState = window.YT.PlayerState;
          if (event.data === YTState.PLAYING) setPlayerState("재생 중");
          if (event.data === YTState.PAUSED) setPlayerState("일시정지");
          if (event.data === YTState.BUFFERING) setPlayerState("버퍼링 중");
          if (event.data === YTState.ENDED) {
            setPlayerState("재생 완료");
            setTimeout(nextSong, 500);
          }
        },
      },
    });

    return () => {
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [youtubeEnabled, playerReady, current?.id]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (playerRef.current && playerRef.current.getCurrentTime) {
        const now = playerRef.current.getCurrentTime() || 0;
        const total = playerRef.current.getDuration() || 0;
        setCurrentTime(now);
        setDuration(total);
      }
    }, 500);

    return () => clearInterval(intervalRef.current);
  }, []);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#09090b",
      color: "white",
      padding: 24,
      fontFamily:
        "Pretendard, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    },
    wrap: {
      maxWidth: 1180,
      margin: "0 auto",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      gap: 16,
      alignItems: "center",
      marginBottom: 24,
      flexWrap: "wrap",
    },
    title: {
      fontSize: 36,
      fontWeight: 800,
      margin: 0,
    },
    desc: {
      color: "#a1a1aa",
      marginTop: 8,
    },
    tabs: {
      display: "flex",
      gap: 8,
      background: "#18181b",
      padding: 6,
      borderRadius: 18,
    },
    tabButton: {
      border: 0,
      borderRadius: 14,
      padding: "10px 16px",
      color: "white",
      cursor: "pointer",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.5fr) minmax(300px, 1fr)",
      gap: 24,
    },
    card: {
      background: "#18181b",
      border: "1px solid #27272a",
      borderRadius: 24,
      padding: 20,
      boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    },
    inputRow: {
      display: "flex",
      gap: 10,
      marginBottom: 16,
      flexWrap: "wrap",
    },
    input: {
      width: "100%",
      border: "1px solid #3f3f46",
      background: "#09090b",
      color: "white",
      borderRadius: 12,
      padding: "12px 14px",
      outline: "none",
    },
    button: {
      border: 0,
      borderRadius: 12,
      background: "#d946ef",
      color: "white",
      padding: "12px 16px",
      cursor: "pointer",
      fontWeight: 700,
    },
    secondaryButton: {
      border: "1px solid #3f3f46",
      borderRadius: 12,
      background: "#09090b",
      color: "white",
      padding: "12px 16px",
      cursor: "pointer",
      fontWeight: 700,
    },
    chatBox: {
      height: 460,
      overflowY: "auto",
      background: "#09090b",
      border: "1px solid #27272a",
      borderRadius: 18,
      padding: 16,
    },
    chatItem: {
      background: "#18181b",
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
    },
    name: {
      color: "#f0abfc",
      fontWeight: 800,
      fontSize: 14,
      marginBottom: 4,
    },
    video: {
      aspectRatio: "16 / 9",
      background: "black",
      borderRadius: 20,
      overflow: "hidden",
      border: "1px solid #27272a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#71717a",
    },
    progressWrap: {
      marginTop: 14,
      background: "#09090b",
      border: "1px solid #27272a",
      borderRadius: 16,
      padding: 14,
    },
    progressBar: {
      height: 10,
      background: "#27272a",
      borderRadius: 999,
      overflow: "hidden",
      marginTop: 10,
    },
    progressFill: {
      height: "100%",
      width: `${progress}%`,
      background: "#d946ef",
      borderRadius: 999,
      transition: "width 0.25s linear",
    },
    songItem: {
      background: "#09090b",
      borderRadius: 16,
      padding: 14,
      marginTop: 10,
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "center",
    },
    small: {
      color: "#a1a1aa",
      fontSize: 14,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>능능 SongRoom</h1>
            <div style={styles.desc}>초대 링크로 참여하고, 누군가 예약하면 바로 재생되는 노래 신청 사이트</div>
          </div>

          <div style={styles.tabs}>
            {["chat", "player"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  ...styles.tabButton,
                  background: tab === key ? "#d946ef" : "transparent",
                }}
              >
                {key === "chat" ? "채팅" : "플레이어"}
              </button>
            ))}
          </div>
        </header>

        <div style={styles.grid}>
          <main>
            {tab === "chat" && (
              <section style={styles.card}>
                <div style={{ ...styles.songItem, display: "block", marginTop: 0, marginBottom: 16 }}>
                  <div style={styles.small}>초대 링크</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    <input value={inviteUrl} readOnly style={{ ...styles.input, flex: 1, minWidth: 240 }} />
                    <button type="button" onClick={copyInvite} style={styles.secondaryButton}>
                      {inviteCopied ? "복사됨" : "초대 링크 복사"}
                    </button>
                  </div>
                </div>

                <div style={styles.inputRow}>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="닉네임"
                    style={{ ...styles.input, maxWidth: 140 }}
                  />
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitMessage();
                    }}
                    placeholder="유튜브 링크 또는 노래이름 입력"
                    style={{ ...styles.input, flex: 1, minWidth: 260 }}
                  />
                  <button type="button" onClick={submitMessage} style={styles.button}>
                    신청
                  </button>
                </div>

                <div style={styles.chatBox}>
                  {chat.map((item) => (
                    <div key={item.id} style={styles.chatItem}>
                      <div style={styles.name}>{item.user}</div>
                      <div>{item.text}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === "player" && (
              <section style={styles.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 28 }}>현재 재생</h2>
                    <p style={styles.small}>누군가 유튜브 링크를 신청하면 이 화면에서 바로 재생됩니다.</p>
                  </div>
                  <button type="button" onClick={nextSong} style={styles.button}>
                    다음 곡
                  </button>
                </div>

                <div style={styles.video}>
                  {current && current.videoId ? (
                    youtubeEnabled ? (
                      <div ref={playerDivRef} style={{ width: "100%", height: "100%" }} />
                    ) : (
                      <div style={{ padding: 24, textAlign: "center" }}>
                        <strong>미리보기 모드</strong>
                        <br />
                        YouTube 외부 네트워크를 자동으로 불러오지 않도록 막아두었습니다.
                        <br />
                        <br />
                        <button type="button" onClick={loadYouTubePlayer} style={styles.button}>
                          YouTube 플레이어 켜기
                        </button>
                      </div>
                    )
                  ) : current && !current.videoId ? (
                    <div style={{ padding: 24, textAlign: "center" }}>
                      <strong>노래 제목 검색 예약:</strong>
                      <br />
                      {current.title}
                      <br />
                      <br />
                      <span style={styles.small}>
                        제목 검색곡은 YouTube Data API 연결 후 실제 영상으로 자동 변환됩니다. 지금은 유튜브 링크를 넣으면 바로 재생됩니다.
                      </span>
                    </div>
                  ) : (
                    <div>재생할 곡이 없습니다. 누군가 유튜브 링크를 신청하면 바로 재생됩니다.</div>
                  )}
                </div>

                <div style={styles.progressWrap}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{playerState}</strong>
                    <span style={styles.small}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={styles.progressFill} />
                  </div>
                </div>

                <div style={{ ...styles.songItem, display: "block" }}>
                  <div style={styles.small}>곡 정보</div>
                  <h3 style={{ margin: "6px 0", fontSize: 22 }}>{current ? current.title : "대기 중"}</h3>
                  <div style={styles.small}>신청자: {current ? current.requestedBy : "-"}</div>
                </div>
              </section>
            )}
          </main>

          <aside>
            <section style={styles.card}>
              <h2 style={{ marginTop: 0 }}>예약 리스트</h2>
              {queue.length === 0 ? (
                <p style={styles.small}>아직 예약된 곡이 없습니다.</p>
              ) : (
                queue.map((song, index) => (
                  <div key={song.id} style={{ ...styles.songItem, display: "block" }}>
                    <strong>{index + 1}. {song.title}</strong>
                    <div style={styles.small}>by {song.requestedBy}</div>
                  </div>
                ))
              )}
            </section>

            <section style={{ ...styles.card, marginTop: 24 }}>
              <h2 style={{ marginTop: 0 }}>사용법</h2>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>https://youtu.be/영상ID</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>아이유 좋은날</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>!list</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>!skip</div>
              <p style={styles.small}>
                지금 버전은 프론트 미리보기용입니다. 진짜 여러 사람이 각자 접속하려면 서버와 Socket.IO를 연결해야 합니다.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
