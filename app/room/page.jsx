"use client";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);
  const evtRef = useRef(null);

  const [expression, setExpression] = useState("平常");
  const [members, setMembers] = useState([]);
  const [alreadyTroubled, setAlreadyTroubled] = useState(false);
  const [expressionHistory, setExpressionHistory] = useState([]);

  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];
  // ここを cloudflared が出した URL に変更してください
  const API_BASE = "https://classification-evolution-requirements-advocacy.trycloudflare.com";

  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  // SSE 接続（/events/{room}/{user}）
  useEffect(() => {
    if (!username || !room) return;
    const url = `${API_BASE}/events/${encodeURIComponent(room)}/${encodeURIComponent(username)}`;
    const es = new EventSource(url);
    evtRef.current = es;

    es.onopen = () => console.log("SSE connected");
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        handleServerEvent(payload);
      } catch (err) {
        console.warn("invalid payload", e.data);
      }
    };
    es.addEventListener("ping", (e) => {
      // keepalive
      // console.log("ping", e.data);
    });
    es.onerror = (err) => {
      console.error("SSE error", err);
    };

    // leave on unload
    const onUnload = () => {
      try {
        navigator.sendBeacon && navigator.sendBeacon(`${API_BASE}/leave`, JSON.stringify({ room, user: username }));
      } catch (e) {
        // fallback
        fetch(`${API_BASE}/leave`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ room, user: username }) }).catch(()=>{});
      }
      es.close();
    };
    window.addEventListener("beforeunload", onUnload);

    return () => {
      window.removeEventListener("beforeunload", onUnload);
      if (es) es.close();
    };
  }, [username, room]);

  function handleServerEvent(payload) {
    if (!payload || !payload.type) return;
    if (payload.type === "members") {
      setMembers(payload.users || []);
    } else if (payload.type === "join") {
      console.log(`${payload.user} joined`);
    } else if (payload.type === "leave") {
      console.log(`${payload.user} left`);
    } else if (payload.type === "trouble") {
      alert(`${payload.user} さんが困っています！`);
    } else if (payload.type === "resolved") {
      // optional
      console.log(`${payload.user} resolved`);
    }
  }

  // カメラ準備
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }).catch((err) => console.error("camera error", err));

    return () => {
      try {
        const s = videoRef.current?.srcObject;
        s && s.getTracks && s.getTracks().forEach(t => t.stop());
      } catch (e) {}
    };
  }, []);

  // 表情認識ループ（predictはそのまま）
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
              const stable = Object.keys(counts).reduce((a,b) => counts[a] > counts[b] ? a : b);

              setExpression(stable);

              // troubled 判定（同じロジック）
              if (TROUBLED_EXPRESSIONS.includes(stable)) {
                if (!troubledTimerRef.current && !alreadyTroubled) {
                  troubledTimerRef.current = setTimeout(() => {
                    // POST /trouble
                    fetch(`${API_BASE}/trouble`, {
                      method: "POST",
                      headers: {"Content-Type":"application/json"},
                      body: JSON.stringify({ room, user: username })
                    }).catch(console.error);
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
  }, [alreadyTroubled]);

  const handleResolved = () => {
    fetch(`${API_BASE}/resolved`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ room, user: username })
    }).catch(console.error);
    setAlreadyTroubled(false);
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
        <div key={idx} style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: m.user === username ? "bold" : "normal" }}>{m.user}</span>
          {m.troubled && <span style={{ color: "red", marginLeft: 8 }}>⚠️困っている</span>}
          {m.troubled && m.user === username && (
            <button onClick={handleResolved} style={{ marginLeft: 10 }}>解決</button>
          )}
        </div>
      ))}
    </div>
  );
}
