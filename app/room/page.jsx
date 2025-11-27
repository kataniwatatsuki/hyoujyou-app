import { useEffect, useRef, useState } from "react";


export default function RoomPage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const troubledTimerRef = useRef(null);
  const [expression, setExpression] = useState("平常");


  const [ws, setWs] = useState(null);
  const [members, setMembers] = useState([]);


  const TROUBLED_EXPRESSIONS = ["angry", "disgust", "fear", "sad"];


  // ======== ここを ngrok の URL に変更！ ========
  const API_BASE = "https://nonexperienced-patrice-unparcelling.ngrok-free.dev";
 
  // ↑ ngrok 実行時に出た URL に変えてください


  // URLパラメータ取得
  const searchParams = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const username = searchParams.get("name");
  const room = searchParams.get("room");


  // WebSocket 接続
  useEffect(() => {
    if (!username || !room) return;


    // ========= wss:// にするのが重要！ =========
    const socket = new WebSocket(`${API_BASE.replace("https", "wss")}/ws/${room}/${username}`);


    socket.onopen = () => {
      console.log("WebSocket connected");
    };


    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);


      if (data.type === "members") setMembers(data.users);


      if (data.type === "join") console.log(`${data.user} joined.`);
      if (data.type === "leave") console.log(`${data.user} left.`);


      if (data.type === "trouble") {
        alert(`${data.user} さんが困っています！`);
      }
    };


    setWs(socket);


    return () => socket.close();
  }, [username, room]);


  // カメラ準備
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      })
      .catch(err => console.error("カメラ取得失敗:", err));
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


      canvas.toBlob((blob) => {
        if (!blob) return;


        const form = new FormData();
        form.append("file", blob, "frame.jpg");


        // ← ngrok の URL に変更
        fetch(`${API_BASE}/predict`, {
          method: "POST",
          body: form,
        })
          .then(res => res.json())
          .then(data => {
            setExpression(data.expression);


            if (TROUBLED_EXPRESSIONS.includes(data.expression)) {
              if (!troubledTimerRef.current) {
                troubledTimerRef.current = setTimeout(() => {
                  if (ws) {
                    ws.send(JSON.stringify({
                      type: "trouble",
                      user: username
                    }));
                  }
                  troubledTimerRef.current = null;
                }, 2000);
              }
            } else {
              if (troubledTimerRef.current) {
                clearTimeout(troubledTimerRef.current);
                troubledTimerRef.current = null;
              }
            }
          })
          .catch(err => console.error(err));


      }, "image/jpeg");


    }, 2000);


    return () => clearInterval(interval);
  }, [ws]);


  return (
    <div style={{ textAlign: "center" }}>
      <h1>ルーム：{room}</h1>
      <h2>名前：{username}</h2>


      <video ref={videoRef} style={{ width: "640px", height: "480px", backgroundColor: "black" }} />
      <canvas ref={canvasRef} style={{ display: "none" }} />


      <p style={{ marginTop: 20, fontSize: "20px" }}>
        現在の表情：<strong>{expression}</strong>
      </p>


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
                justifyContent: "flex-start",
                padding: "2px 0"
              }}
            >
              <span style={{ fontWeight: m.user === username ? "bold" : "normal" }}>
                {m.user}
              </span>
              {m.troubled && (
                <span style={{ color: "red", fontWeight: "bold" }}>⚠️困っている</span>
              )}
              {m.troubled && m.user === username && (
                <button
                  onClick={() => {
                    if (ws) {
                      ws.send(JSON.stringify({ type: "resolved", user: username }));
                    }
                  }}
                >
                  解決
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
