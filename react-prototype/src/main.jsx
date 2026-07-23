import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WrestlingWorkoutTimer from "./WrestlingWorkoutTimer";
import "./WrestlingWorkoutTimer.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WrestlingWorkoutTimer />
  </StrictMode>,
);
