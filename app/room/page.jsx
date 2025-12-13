"use client";
import { useEffect, useRef, useState } from "react";

export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);
  const [expression, setExpression] = useState("検出不可");

  const [ws, setWs] = useState(null);
  const [members, setMembers] = useState([]);
  const [alreadyTroubled, setAlreadyTroubled] = useState(false);
  const [expressionHistory, setExpressionHistory] = useState([]);

  const [autoDetected, setAutoDetected] = useState(false);

  // ★ A案用：YES/NOを促す通知を一度だけ出すため
  const [confirmNotified, setConfirmNotified] = useState(false);

  // ★ B案用：確認UI表示フラグ
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      Notification.requestPermission();
    }
  }, []);

  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];
  const API_BASE = "http://localhost:8000";

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  // WebSocket 接続
  useEffect(() => {
    if (!username || !room) return;

    const socket = new WebSocket(
      `${API_BASE.replace("https", "wss")}/ws/${room}/${username}`
    );

    socket.onopen = () => console.log("WebSocket connected");

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "members") setMembers(data.users);
      if (data.type === "join") console.log(`${data.user} joined.`);
      if (data.type === "leave") console.log(`${data.user} left.`);

      if (data.type === "trouble") {
        if (Notification.permission === "granted") {
          new Notification("困っています！", {
            body: `${data.user} さんが困っています！`,
          });
        } else {
          alert(`${data.user} さんが困っています！`);
        }
      }
    };

    setWs(socket);
    return () => socket.close();
  }, [username, room]);

  // カメラ準備
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      })
      .catch((err) => console.error("カメラ取得失敗:", err));
  }, []);

  // 表情認識ループ
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

                const counts = {};
                updated.forEach((e) => (counts[e] = (counts[e] || 0) + 1));
                const stableExpression = Object.keys(counts).reduce((a, b) =>
                  counts[a] > counts[b] ? a : b
                );

                setExpression(stableExpression);

                // ★ B案：困り検出 → UI表示のみ（自動通知しない）
                if (TROUBLED_EXPRESSIONS.includes(stableExpression)) {
                  if (!alreadyTroubled && !showConfirm && !autoDetected) {
                    
                fetch(`${API_BASE}/log`, {  
                  method: "POST",
                  headers: { "Content-Type": "application/json" },  
                  body: JSON.stringify({    
                    type: "auto_detect",   
                    user: username,    
                    room: room,   
                    expression: stableExpression  
                  }),
                });
                setAutoDetected(true);  
                setShowConfirm(true);
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
  }, [ws, alreadyTroubled, username, showConfirm]);

// ★ A案：YES / NO を促す OSレベル通知
useEffect(() => {
  if (showConfirm && !confirmNotified) {
    if (Notification.permission === "granted") {
      new Notification("確認してください", {
        body: "困っているのではないでしょうか？。画面で YES / NO を選択してください。",
      });
    }
    setConfirmNotified(true);
  }
}, [showConfirm, confirmNotified]);


  return (
    <div style={{ textAlign: "center" }}>
      <h1>ルーム：{room}</h1>
      <h2>名前：{username}</h2>

      <video
        ref={videoRef}
        style={{
          width: "640px",
          height: "480px",
          backgroundColor: "black",
          display: "block",
          margin: "0 auto",
        }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <p style={{ marginTop: 20, fontSize: "20px" }}>
        現在の表情：<strong>{expression}</strong>
      </p>
      <div style={{ marginTop: 20 }}>
  <button
    style={{
      background: alreadyTroubled ? "#aaa" : "#ff4d4f",
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "10px 20px",
      fontSize: "16px",
      cursor: alreadyTroubled ? "not-allowed" : "pointer",
    }}
    disabled={alreadyTroubled}
    onClick={() => {
      if (alreadyTroubled) return;

      fetch(`${API_BASE}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "manual_trouble",
          user: username,
          room: room,
        }),
      });

      if (ws) {
        ws.send(
          JSON.stringify({
            type: "trouble",
            user: username,
          })
        );
      }
      setAlreadyTroubled(true);
    }}
  >
    🚨 困っています（手動）
  </button>

  {alreadyTroubled && (
    <p style={{ marginTop: 8, fontSize: "13px", color: "#666" }}>
      ※ 解決ボタンを押すまで再通知されません
    </p>
  )}
</div>

      <div style={{ marginTop: 20 }}>
        <h3>この部屋にいる人：</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {members.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                justifyContent: "center",
                padding: "2px 0",
              }}
            >
              <span style={{ fontWeight: m.user === username ? "bold" : "normal" }}>
                {m.user}
              </span>

              {m.troubled && (
                <span style={{ color: "red", fontWeight: "bold" }}>
                  ⚠️困っている
                </span>
              )}

              {m.troubled && m.user === username && (
  <button
    style={{
      background: "#1677ff",       // ← 青色
      color: "#fff",
      border: "none",
      borderRadius: "8px",
      padding: "6px 14px",
      fontSize: "14px",
      fontWeight: "bold",
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(22,119,255,0.4)",
    }}
    onClick={() => {
      fetch(`${API_BASE}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "resolved",
          user: username,
         room: room
        }),
      });
      if (ws) {
        ws.send(
          JSON.stringify({
            type: "resolved",
            user: username,
          })
        );
      }
      setAlreadyTroubled(false);
      setShowConfirm(false);
      setAutoDetected(false);
    }}
  >
    ✔ 解決
  </button>
)}

            </div>
          ))}
        </div>
      </div>

      {/* ★ B案：右下常駐 YES / NO UI */}
      {showConfirm && !alreadyTroubled && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            width: "260px",
            background: "#fff",
            border: "2px solid #ff4d4f",
            borderRadius: "12px",
            padding: "15px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 9999,
            textAlign: "center",
          }}
        >
          <p style={{ fontWeight: "bold", marginBottom: "10px" }}>
            困っていますか？
          </p>
          <p style={{ fontSize: "14px", marginBottom: "15px" }}>
            周囲に通知しますか
          </p>

          <div style={{ display: "flex", justifyContent: "space-around" }}>
            <button
              style={{
                background: "#ff4d4f",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
              onClick={() => {
                fetch(`${API_BASE}/log`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({  
                    type: "confirm",   
                    result: "yes",  
                    user: username, 
                    room: room 
                  }),
                });

                if (ws) {
                  ws.send(
                    JSON.stringify({
                      type: "trouble",
                      user: username,
                    })
                  );
                }
                setAlreadyTroubled(true);
                setShowConfirm(false);
                setAutoDetected(false);
                setConfirmNotified(false);
              }}
            >
              YES
            </button>

            <button
              style={{
                background: "#e0e0e0",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
              onClick={() => {
                fetch(`${API_BASE}/log`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    type: "confirm",
                    result: "no",
                    user: username,
                    room: room
                  }),
                });  
                setShowConfirm(false);
                setAutoDetected(false);
                setConfirmNotified(false);              
              }}
            >
              NO
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
