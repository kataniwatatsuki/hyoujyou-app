"use client";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);

  const [expression, setExpression] = useState("平常");
  const [members, setMembers] = useState([]);
  const [alreadyTroubled, setAlreadyTroubled] = useState(false);
  const [expressionHistory, setExpressionHistory] = useState([]);

  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];

  const API_BASE = "https://ai-backend-izj9.onrender.com";

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  // -------------------------
  // 🔵 部屋参加（REST）
  // -------------------------
  useEffect(() => {
    if (!username || !room) return;
    fetch(`${API_BASE}/join/${room}/${username}`, { method: "POST" });
  }, [username, room]);

  // -------------------------
  // 🔵 SSE（サーバー → クライアント）
  // -------------------------
  useEffect(() => {
    if (!room) return;

    const es = new EventSource(`${API_BASE}/stream/${room}`);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "members") setMembers(data.users);

      if (data.type === "trouble") {
        alert(`${data.user} さんが困っています！`);
      }
    };

    return () => es.close();
  }, [room]);

  // -------------------------
  // カメラ準備
  // -------------------------
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      })
      .catch((err) => console.error("カメラ取得失敗:", err));
  }, []);

  // -------------------------
  // 表情認識ループ
  // -------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || !video.videoWidth) return;

      const ctx = canvas.getContext("2d");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const form = new FormData();
          form.append("file", blob, "frame.jpg");

          fetch(`${API_BASE}/predict`, {
            method: "POST",
            body: form,
          })
            .then((res) => res.json())
            .then((data) => {
              setExpressionHistory((prev) => {
                const updated = [...prev, data.expression];
                if (updated.length > 3) updated.shift();

                // 多数決
                const counts = {};
                updated.forEach((e) => (counts[e] = (counts[e] || 0) + 1));
                const stable = Object.keys(counts).reduce((a, b) =>
                  counts[a] > counts[b] ? a : b
                );
                setExpression(stable);

                // 困り判定
                if (TROUBLED_EXPRESSIONS.includes(stable)) {
                  if (!troubledTimerRef.current && !alreadyTroubled) {
                    troubledTimerRef.current = setTimeout(() => {
                      fetch(`${API_BASE}/trouble/${room}/${username}`, {
                        method: "POST",
                      });
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
            })
            .catch((err) => console.error(err));
        },
        "image/jpeg"
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [alreadyTroubled, room, username]);

  // -------------------------
  // 解決ボタン
  // -------------------------
  const handleResolve = () => {
    fetch(`${API_BASE}/resolve/${room}/${username}`, { method: "POST" });
    setAlreadyTroubled(false);
  };

  // -------------------------
  // UI
  // -------------------------
  return (
    <div style={{ textAlign: "center" }}>
      <h1>ルーム：{room}</h1>
      <h2>名前：{username}</h2>

      <video
        ref={videoRef}
        style={{ width: "640px", height: "480px", backgroundColor: "black" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <p style={{ marginTop: 20, fontSize: "20px" }}>
        現在の表情：<strong>{expression}</strong>
      </p>

      <div style={{ marginTop: 20 }}>
        <h3>この部屋にいる人：</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {members.map((m, idx) => (
            <div key={idx} style={{ display: "flex", gap: "10px" }}>
              <span style={{ fontWeight: m.user === username ? "bold" : "normal" }}>
                {m.user}
              </span>
              {m.troubled && (
                <span style={{ color: "red", fontWeight: "bold" }}>⚠️困っている</span>
              )}
              {m.troubled && m.user === username && (
                <button onClick={handleResolve}>解決</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
