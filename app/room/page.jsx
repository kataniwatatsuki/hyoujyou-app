"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);

  const [expression, setExpression] = useState("平常");
  const [members, setMembers] = useState([]);
  const [alreadyTroubled, setAlreadyTroubled] = useState(false);
  const [expressionHistory, setExpressionHistory] = useState([]);

  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];
  const API_BASE = "https://nonexperienced-patrice-unparcelling.ngrok-free.dev";

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  const [socket, setSocket] = useState(null);

  // ===== Socket.IO 接続 =====
  useEffect(() => {
    if (!username || !room) return;

    const s = io(API_BASE, {
      path: "/socket.io/",
      transports: ["websocket"],
    });


    setSocket(s);

    s.on("connect", () => {
      console.log("Socket.IO connected");
      s.emit("join_room", { room, user: username });
    });

    s.on("members", (data) => setMembers(data.users));
    s.on("join", (data) => console.log(`${data.user} joined.`));
    s.on("leave", (data) => console.log(`${data.user} left.`));
    s.on("trouble", (data) => {
      alert(`${data.user} さんが困っています！`);
    });

    return () => {
      if (s && s.connected) s.disconnect();
    };
  }, [username, room]);

  // ===== カメラ準備 =====
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
      videoRef.current.srcObject = stream;
      videoRef.current.play();
    });
  }, []);

  // ===== 表情認識 =====
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
          .then((res) => res.json())
          .then((data) => {
            setExpressionHistory((prev) => {
              const updated = [...prev, data.expression];
              if (updated.length > 5) updated.shift();

              const counts = {};
              updated.forEach((e) => (counts[e] = (counts[e] || 0) + 1));
              const stable = Object.keys(counts).reduce((a, b) =>
                counts[a] > counts[b] ? a : b
              );

              setExpression(stable);

              if (TROUBLED_EXPRESSIONS.includes(stable)) {
                if (!troubledTimerRef.current && !alreadyTroubled) {
                  troubledTimerRef.current = setTimeout(() => {
                    if (socket && socket.connected) {
                      socket.emit("trouble", { room, user: username });
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
          });
      }, "image/jpeg");
    }, 2000);

    return () => clearInterval(interval);
  }, [socket, alreadyTroubled, username]);

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
            <button
              onClick={() => {
                if (socket && socket.connected) {
                  socket.emit("resolved", { room, user: username });
                }
                setAlreadyTroubled(false);
              }}
              style={{ marginLeft: "10px" }}
            >
              解決
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
