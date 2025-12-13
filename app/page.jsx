"use client";




import { useState } from "react";
import { useRouter } from "next/navigation";




export default function HomePage() {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const router = useRouter();




  const handleJoin = () => {
    if (!name || !room) {
      alert("名前とルームIDを入力してください");
      return;
    }




    router.push(`/room?name=${name}&room=${room}`);
  };




  return (
    <div style={{ textAlign: "center", marginTop: 80 }}>
      <h1>表情認識ルームへ入室</h1>




      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: "10px", width: "250px", fontSize: "16px" }}
        />
      </div>




      <div style={{ marginTop: 20 }}>
        <input
          type="text"
          placeholder="ルームID"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          style={{ padding: "10px", width: "250px", fontSize: "16px" }}
        />
      </div>




      <button
  onClick={handleJoin}
  style={{
    marginTop: 30,
    padding: "12px 30px",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#333",
    background: "#ffffff",
    border: "2px solid #ddd",
    borderRadius: "10px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
    transition: "all 0.2s ease",
  }}
  onMouseOver={(e) => {
    e.currentTarget.style.background = "#f5f5f5";
    e.currentTarget.style.borderColor = "#bbb";
  }}
  onMouseOut={(e) => {
    e.currentTarget.style.background = "#ffffff";
    e.currentTarget.style.borderColor = "#ddd";
  }}
>
  入室する
</button>

    </div>
  );
}
