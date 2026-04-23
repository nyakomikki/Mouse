import React from "react";
import "@/App.css";
import Desktop from "./components/Desktop";
import OverlayApp from "./components/OverlayApp";

export default function App() {
  const isOverlay =
    (typeof window !== "undefined" && window.electronAPI?.isOverlay) ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("overlay") === "1");
  return (
    <div className="App">
      {isOverlay ? <OverlayApp /> : <Desktop />}
    </div>
  );
}
