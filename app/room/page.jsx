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
  // ngrok の公開 URL を使う（あなたの既存の値）
  const API_BASE = "https://nonexperienced-patrice-unparcelling.ngrok-free.dev";

  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");

  // ===== Join (POST /join) & SSE 接続 =====
  useEffect(() => {
    if (!username || !room) return;

    let mounted = true;

    async function joinAndListen() {
      try {
        // join して sid をもらう
        const res = await fetch(`${API_BASE}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room, user: username }),
        });
        const data = await res.json();
        if (!mounted) return;
        setSid(data.sid);

        // SSE 接続
        const url = `${API_BASE}/events?room=${encodeURIComponent(room)}`;
        const evt = new EventSource(url);
        evtSourceRef.current = evt;

        evt.onopen = () => {
          console.log("SSE connected");
        };

        evt.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            handleServerEvent(payload);
          } catch (err) {
            console.warn("invalid SSE payload:", e.data);
          }
        };

        evt.onerror = (err) => {
          console.error("SSE error", err);
          // 自動再接続はEventSourceがブラウザ側でやるが、必要なら再作成を検討
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
      // サーバ側の会話上は SID を残します（optional: /leave を実装すれば呼べます）
    };
  }, [username, room]);

  // ===== SSE で受け取ったイベント処理 =====
  function handleServerEvent(payload) {
    // payload は { type: "...", ... } を想定
    if (!payload || !payload.type) return;

    if (payload.type === "members") {
      setMembers(payload.users || []);
    } else if (payload.type === "join") {
      console.log(`${payload.user} joined`);
    } else if (payload.type === "trouble") {
      alert(`${payload.user} さんが困っています！`);
    } else if (payload.type === "message") {
      // 汎用
      console.log("message", payload);
    } else {
      // その他
      console.log("SSE event:", payload);
    }
  }

  // ===== カメラ準備 =====
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      })
      .catch((err) => {
        console.error("camera error", err);
      });

    return () => {
      // stop tracks on unmount
      try {
        const stream = videoRef.current?.srcObject;
        if (stream && stream.getTracks) {
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch (e) {}
    };
  }, []);

  // ===== 表情認識 (POST /predict) と "困った" ロジック =====
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

                // 困った判定
                if (TROUBLED_EXPRESSIONS.includes(stable)) {
                  if (!troubledTimerRef.current && !alreadyTroubled) {
                    troubledTimerRef.current = setTimeout(() => {
                      // POST /trouble を送る（sid 必須）
                      if (sid) {
                        fetch(`${API_BASE}/trouble`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ room, sid }),
                        }).catch((e) => console.error("trouble post failed", e));
                      } else {
                        // sid が未取得なら join が遅れている -> retry after small delay
                        setTimeout(() => {
                          if (sid) {
                            fetch(`${API_BASE}/trouble`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ room, sid }),
                            }).catch((e) => console.error("trouble post failed", e));
                          }
                        }, 500);
                      }
                      setAlreadyTroubled(true);
                      troubledTimerRef.current = null;
                    }, 2000);
                  }
                } else {
                  // 安定が戻ったらタイマー解除
                  if (troubledTimerRef.current) {
                    clearTimeout(troubledTimerRef.current);
                    troubledTimerRef.current = null;
                  }
                }

                return updated;
              });
            })
            .catch((err) => {
              console.error("predict failed", err);
            });
        },
        "image/jpeg",
        0.9
      );
    }, 2000);

    return () => clearInterval(interval);
  }, [sid, alreadyTroubled, username]);

  // ===== 解決ボタン押下時の処理 =====
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
      console.error("resolved post failed", e);
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
            <button onClick={handleResolved} style={{ marginLeft: "10px" }}>
              解決
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
