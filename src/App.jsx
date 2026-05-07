import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = "https://noonbi-song-server.onrender.com";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function getIsMobile() {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  const touch = navigator.maxTouchPoints > 1;

  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || touch;
}

export default function App() {
  const [tab, setTab] = useState("chat");
  const [nickname, setNickname] = useState("경모");
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [connected, setConnected] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerState, setPlayerState] = useState("대기 중");

  const socketRef = useRef(null);
  const playerDivRef = useRef(null);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const suppressEventRef = useRef(false);
  const ignorePauseRef = useRef(false);
  const isMobileRef = useRef(getIsMobile());

  const inviteUrl = typeof window !== "undefined" ? window.location.href : "";
  const isMobile = typeof window !== "undefined" ? window.innerWidth <= 768 : false;

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    socket.on("state", (state) => {
      setQueue(state.queue || []);
      setHistory(state.history || []);
      setCurrentSong(state.currentSong || null);
      setChat(state.chat || []);
    });

    socket.on("forcePause", ({ currentTime }) => {
      try {
        if (playerRef.current) {
          suppressEventRef.current = true;
          playerRef.current.seekTo(currentTime || 0, true);
          playerRef.current.pauseVideo();
          setTimeout(() => {
            suppressEventRef.current = false;
          }, 1000);
        }
      } catch {}
    });

    socket.on("forcePlay", ({ currentTime }) => {
      try {
        if (playerRef.current) {
          suppressEventRef.current = true;
          playerRef.current.seekTo(currentTime || 0, true);
          playerRef.current.playVideo();
          setTimeout(() => {
            suppressEventRef.current = false;
          }, 1000);
        }
      } catch {}
    });

    socket.on("forceSeek", ({ currentTime }) => {
      try {
        if (playerRef.current) {
          suppressEventRef.current = true;
          playerRef.current.seekTo(currentTime || 0, true);
          setTimeout(() => {
            suppressEventRef.current = false;
          }, 1000);
        }
      } catch {}
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      ignorePauseRef.current = document.hidden;
    };

    const handlePageHide = () => {
      ignorePauseRef.current = true;
    };

    const handlePageShow = () => {
      ignorePauseRef.current = false;
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const sendMessage = () => {
    const text = message.trim();
    if (!text || !socketRef.current) return;

    socketRef.current.emit("sendMessage", {
      nickname,
      text,
    });

    setMessage("");
  };

  const skipSong = () => {
    if (!socketRef.current) return;
    socketRef.current.emit("sendMessage", {
      nickname,
      text: "!skip",
    });
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
    if (!youtubeEnabled || !playerReady || !currentSong || !currentSong.videoId || !playerDivRef.current) {
      return;
    }

    if (playerRef.current && currentSong.videoId) {
      const currentVideoData = playerRef.current.getVideoData?.();
      const currentVideoId = currentVideoData?.video_id;

      if (currentVideoId !== currentSong.videoId) {
        playerRef.current.loadVideoById(currentSong.videoId);
      }

      if (currentSong.startedAt) {
        const elapsed = (Date.now() - currentSong.startedAt) / 1000;

        setTimeout(() => {
          try {
            const now = playerRef.current.getCurrentTime?.() || 0;
            const diff = Math.abs(now - elapsed);

            if (diff > 2) {
              playerRef.current.seekTo(elapsed, true);
            }

            playerRef.current.playVideo();
          } catch {}
        }, 500);
      }

      return;
    }

    playerRef.current = new window.YT.Player(playerDivRef.current, {
      videoId: currentSong.videoId,
      playerVars: {
        autoplay: 1,
        playsinline: 1,
      },
      events: {
        onReady: (event) => {
          const total = event.target.getDuration() || 0;

          setDuration(total);
          setPlayerState("재생 준비 완료");

          if (currentSong.startedAt) {
            const elapsed = (Date.now() - currentSong.startedAt) / 1000;

            if (elapsed > 0 && elapsed < total) {
              event.target.seekTo(elapsed, true);
            }
          }

          event.target.playVideo();
        },

        onStateChange: (event) => {
          const YTState = window.YT.PlayerState;

          if (event.data === YTState.PLAYING) {
            setPlayerState("재생 중");

            if (!isMobileRef.current && !suppressEventRef.current && socketRef.current) {
              socketRef.current.emit("resumeSong", {
                currentTime: event.target.getCurrentTime(),
              });
            }
          }

          if (event.data === YTState.PAUSED) {
            setPlayerState("일시정지");

            if (
              !isMobileRef.current &&
              !ignorePauseRef.current &&
              !document.hidden &&
              !suppressEventRef.current &&
              socketRef.current
            ) {
              socketRef.current.emit("pauseSong", {
                currentTime: event.target.getCurrentTime(),
              });
            }
          }

          if (event.data === YTState.BUFFERING) {
            setPlayerState("버퍼링 중");
          }

          if (event.data === YTState.ENDED) {
            setPlayerState("재생 완료");

            if (!isMobileRef.current && socketRef.current) {
              socketRef.current.emit("songEnded");
            }
          }
        },
      },
    });

    setCurrentTime(0);
    setDuration(0);
  }, [youtubeEnabled, playerReady, currentSong?.id]);

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

  useEffect(() => {
    if (currentSong) {
      setTab("player");
    }
  }, [currentSong?.id]);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const styles = {
    page: {
      minHeight: "100vh",
      background: "#09090b",
      color: "white",
      padding: isMobile ? 12 : 24,
      fontFamily: "Pretendard, Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    },
    wrap: { maxWidth: 1180, margin: "0 auto" },
    header: {
      display: "flex",
      justifyContent: "space-between",
      gap: 16,
      alignItems: isMobile ? "stretch" : "center",
      marginBottom: 24,
      flexWrap: "wrap",
      flexDirection: isMobile ? "column" : "row",
    },
    title: { fontSize: isMobile ? 28 : 36, fontWeight: 800, margin: 0 },
    desc: { color: "#a1a1aa", marginTop: 8 },
    tabs: {
      display: "flex",
      gap: 8,
      background: "#18181b",
      padding: 6,
      borderRadius: 18,
      width: isMobile ? "100%" : "auto",
      justifyContent: isMobile ? "center" : "flex-start",
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
      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.5fr) minmax(300px, 1fr)",
      gap: isMobile ? 14 : 24,
    },
    card: {
      background: "#18181b",
      border: "1px solid #27272a",
      borderRadius: isMobile ? 18 : 24,
      padding: isMobile ? 14 : 20,
      boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
    },
    inputRow: {
      display: "flex",
      gap: 10,
      marginBottom: 16,
      flexWrap: "wrap",
      flexDirection: isMobile ? "column" : "row",
    },
    input: {
      width: "100%",
      border: "1px solid #3f3f46",
      background: "#09090b",
      color: "white",
      borderRadius: 12,
      padding: "12px 14px",
      outline: "none",
      boxSizing: "border-box",
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
      height: isMobile ? 360 : 460,
      overflowY: "auto",
      background: "#09090b",
      border: "1px solid #27272a",
      borderRadius: 18,
      padding: isMobile ? 10 : 16,
    },
    chatItem: {
      background: "#18181b",
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      wordBreak: "break-word",
    },
    name: { color: "#f0abfc", fontWeight: 800, fontSize: 14, marginBottom: 4 },
    video: {
      aspectRatio: "16 / 9",
      width: "100%",
      minHeight: isMobile ? 190 : 320,
      background: "black",
      borderRadius: isMobile ? 16 : 20,
      overflow: "hidden",
      border: "1px solid #27272a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#71717a",
      textAlign: "center",
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
      padding: isMobile ? 12 : 14,
      marginTop: 10,
      display: "flex",
      justifyContent: "space-between",
      gap: 12,
      alignItems: "center",
      flexWrap: "wrap",
      wordBreak: "break-word",
    },
    small: { color: "#a1a1aa", fontSize: 14 },
    badge: {
      display: "inline-block",
      borderRadius: 999,
      padding: "5px 9px",
      fontSize: 13,
      background: connected ? "#14532d" : "#7f1d1d",
      color: connected ? "#bbf7d0" : "#fecaca",
    },
    thumb: {
      width: isMobile ? 64 : 72,
      height: isMobile ? 48 : 54,
      objectFit: "cover",
      borderRadius: 10,
      background: "#27272a",
      flexShrink: 0,
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>능능 SongRoom</h1>
            <div style={styles.desc}>
              검색어를 입력하면 유튜브 최상단 영상을 예약하고, 모두에게 실시간 동기화됩니다.
            </div>
            <div style={{ marginTop: 10 }}>
              <span style={styles.badge}>{connected ? "서버 연결됨" : "서버 연결 안 됨"}</span>
            </div>
          </div>

          <div style={styles.tabs}>
            {["chat", "player"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  ...styles.tabButton,
                  flex: isMobile ? 1 : "initial",
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
            <section style={{ ...styles.card, display: tab === "chat" ? "block" : "none" }}>
              <div style={{ ...styles.songItem, display: "block", marginTop: 0, marginBottom: 16 }}>
                <div style={styles.small}>초대 링크</div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    marginTop: 8,
                    flexWrap: "wrap",
                    flexDirection: isMobile ? "column" : "row",
                  }}
                >
                  <input
                    value={inviteUrl}
                    readOnly
                    style={{ ...styles.input, flex: 1, minWidth: isMobile ? "100%" : 240 }}
                  />
                  <button
                    type="button"
                    onClick={copyInvite}
                    style={{ ...styles.secondaryButton, width: isMobile ? "100%" : "auto" }}
                  >
                    {inviteCopied ? "복사됨" : "초대 링크 복사"}
                  </button>
                </div>
              </div>

              <div style={styles.inputRow}>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="닉네임"
                  style={{ ...styles.input, maxWidth: isMobile ? "100%" : 140 }}
                />
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                  placeholder="유튜브 링크 또는 검색어 입력 예: 연예인"
                  style={{ ...styles.input, flex: 1, minWidth: isMobile ? "100%" : 260 }}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  style={{ ...styles.button, width: isMobile ? "100%" : "auto" }}
                >
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

            <section style={{ ...styles.card, display: tab === "player" ? "block" : "none" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 16,
                  flexDirection: isMobile ? "column" : "row",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 28 }}>현재 재생</h2>
                  <p style={styles.small}>영상이 끝나면 다음 예약곡으로 넘어갑니다.</p>
                </div>
                <button
                  type="button"
                  onClick={skipSong}
                  style={{ ...styles.button, width: isMobile ? "100%" : "auto" }}
                >
                  다음 곡
                </button>
              </div>

              <div style={styles.video}>
                {currentSong && currentSong.videoId ? (
                  youtubeEnabled ? (
                    <div ref={playerDivRef} style={{ width: "100%", height: "100%" }} />
                  ) : (
                    <div style={{ padding: 24, textAlign: "center" }}>
                      <strong>YouTube 플레이어가 꺼져 있습니다.</strong>
                      <br />
                      처음 한 번만 버튼을 눌러 켜주세요.
                      <br />
                      <br />
                      <button type="button" onClick={loadYouTubePlayer} style={styles.button}>
                        YouTube 플레이어 켜기
                      </button>
                    </div>
                  )
                ) : (
                  <div style={{ padding: 16 }}>재생할 곡이 없습니다. 채팅에서 검색어나 유튜브 링크를 신청하세요.</div>
                )}
              </div>

              <div style={styles.progressWrap}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
                <h3 style={{ margin: "6px 0", fontSize: isMobile ? 18 : 22, wordBreak: "keep-all" }}>
                  {currentSong ? currentSong.title : "대기 중"}
                </h3>
                <div style={styles.small}>신청자: {currentSong ? currentSong.requestedBy : "-"}</div>
                {currentSong?.channelTitle && <div style={styles.small}>채널: {currentSong.channelTitle}</div>}
                {isMobileRef.current && (
                  <div style={{ ...styles.small, marginTop: 8 }}>
                    모바일에서는 일시정지/슬립이 전체 방 재생에 영향을 주지 않습니다.
                  </div>
                )}
              </div>
            </section>
          </main>

          <aside>
            <section style={styles.card}>
              <h2 style={{ marginTop: 0 }}>예약 리스트</h2>
              {queue.length === 0 ? (
                <p style={styles.small}>아직 예약된 곡이 없습니다.</p>
              ) : (
                queue.map((song, index) => (
                  <div key={song.id} style={styles.songItem}>
                    {song.thumbnail && <img src={song.thumbnail} alt="" style={styles.thumb} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>
                        {index + 1}. {song.title}
                      </strong>
                      <div style={styles.small}>by {song.requestedBy}</div>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section style={{ ...styles.card, marginTop: 24 }}>
              <h2 style={{ marginTop: 0 }}>예약 히스토리</h2>
              {history.length === 0 ? (
                <p style={styles.small}>아직 재생 기록이 없습니다.</p>
              ) : (
                history.slice(0, 10).map((song, index) => (
                  <div key={`${song.id}-${index}`} style={{ ...styles.songItem, display: "block" }}>
                    <strong>{song.title}</strong>
                    <div style={styles.small}>신청자: {song.requestedBy}</div>
                    {song.skipped && <div style={styles.small}>스킵됨</div>}
                  </div>
                ))
              )}
            </section>

            <section style={{ ...styles.card, marginTop: 24 }}>
              <h2 style={{ marginTop: 0 }}>사용법</h2>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>연예인</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>https://youtu.be/영상ID</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>!list</div>
              <div style={{ ...styles.songItem, display: "block", fontFamily: "monospace" }}>!skip</div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
