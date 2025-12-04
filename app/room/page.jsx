"use client";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);
  const evtSourceRef = useRef(null);

  const [expression, setExpression] = useState("平常");
  const [members, setMembers] = useState([]);
  const [alreadyTroubled, setAlreadyTroubled] = useState(false);
  const [expressionHistory, setExpressionHistory] = useState([]);
  const [sid, setSid] = useState(null);

  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];
  // ← ここを cloudflared が生成した URL に置き換えてください
  const API_BASE = "https://dimension-shade-hide-keen.trycloudflare.com";

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  // join & SSE setup
  useEffect(() => {
    if (!username || !room) return;
    let mounted = true;

    async function joinAndListen() {
      try {
        const res = await fetch(`${API_BASE}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, user: username }),
        });
        const data = await res.json();
        if (!mounted) return;
        setSid(data.sid);

        // connect to SSE (include sid for debug/resilience)
        const evt = new EventSource(`${API_BASE}/events?room=${encodeURIComponent(room)}&sid=${encodeURIComponent(data.sid)}`);
        evtSourceRef.current = evt;

        evt.onopen = () => console.log("SSE connected");
        evt.onmessage = (e) => {
          // generic message event (we always send JSON in data)
          try {
            const payload = JSON.parse(e.data);
            handleServerEvent(payload);
          } catch (err) {
            console.warn("invalid SSE payload", e.data);
          }
        };
        // ping event (keepalive)
        evt.addEventListener("ping", (e) => {
          // optional: console.log("ping", e.data);
        });
        evt.onerror = (err) => {
          console.error("SSE error", err);
        };
      } catch (err) {
        console.error("join failed", err);
      }
    }

    joinAndListen();

    return () => {
      mounted = false;
      if (evtSourceRef.current) {
        evtSourceRef.current.close();
        evtSourceRef.current = null;
      }
      // optionally tell server /leave (not required but polite)
      if (sid) {
        fetch(`${API_BASE}/leave`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, sid }),
        }).catch(() => {});
      }
    };
  }, [username, room]);

  // SSE event handler
  function handleServerEvent(payload) {
    if (!payload || !payload.type) return;
    if (payload.type === "members") {
      setMembers(payload.users || []);
    } else if (payload.type === "join") {
      // optional notification
      console.log(`${payload.user} joined`);
    } else if (payload.type === "leave") {
      console.log(`${payload.user} left`);
    } else if (payload.type === "trouble") {
      alert(`${payload.user} さんが困っています！`);
    } else {
      console.log("SSE event", payload);
    }
  }

  // camera setup (same as before)
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }).catch(console.error);
    return () => {
      try {
        const s = videoRef.current?.srcObject;
        s && s.getTracks && s.getTracks().forEach(t => t.stop());
      } catch (e) {}
    };
  }, []);

  // expression detection logic (unchanged)
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        const form = new FormData();
        form.append("file", blob, "frame.jpg");

        fetch(`${API_BASE}/predict`, { method: "POST", body: form })
          .then(res => res.json())
          .then(data => {
            setExpressionHistory(prev => {
              const updated = [...prev, data.expression];
              if (updated.length > 5) updated.shift();

              const counts = {};
              updated.forEach(e => counts[e] = (counts[e] || 0) + 1);
              const stable = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

              setExpression(stable);

              if (TROUBLED_EXPRESSIONS.includes(stable)) {
                if (!troubledTimerRef.current && !alreadyTroubled) {
                  troubledTimerRef.current = setTimeout(() => {
                    if (sid) {
                      fetch(`${API_BASE}/trouble`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ room, sid }),
                      }).catch(console.error);
                    } else {
                      setTimeout(() => {
                        if (sid) {
                          fetch(`${API_BASE}/trouble`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ room, sid }),
                          }).catch(console.error);
                        }
                      }, 500);
                    }
                    setAlreadyTroubled(true);
                    troubledTimerRef.current = null;
                  }, 2000);
                }
              } else {
                if (troubledTimerRef.current) {
                  clearTimeout(troubledTimerRef.current);
                  troubledTimerRef.current = null;
                }
              }

              return updated;
            });
          }).catch(console.error);
      }, "image/jpeg");
    }, 2000);

    return () => clearInterval(interval);
  }, [sid, alreadyTroubled]);

  // resolved handler
  const handleResolved = async () => {
    if (!sid) return;
    try {
      await fetch(`${API_BASE}/resolved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, sid }),
      });
      setAlreadyTroubled(false);
    } catch (e) {
      console.error("resolved failed", e);
    }
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h1>ルーム：{room}</h1>
      <h2>名前：{username}</h2>

      <video ref={videoRef} style={{ width: 640, height: 480 }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <p>現在の表情：{expression}</p>

      <h3>この部屋にいる人：</h3>
      {members.map((m, idx) => (
        <div key={idx} style={{ marginBottom: "8px" }}>
          <span>{m.user}</span>
          {m.troubled && <span style={{ color: "red" }}> ⚠️困っている</span>}
          {m.troubled && m.user === username && (
            <button onClick={handleResolved} style={{ marginLeft: 10 }}>解決</button>
          )}
        </div>
      ))}
    </div>
  );
}
