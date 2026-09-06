import React from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./WorkspaceApp.jsx";
import "./workspace.css";
import "./proposal.css";
import "./platform.css";
import "./workspace-premium-system.css";
import "./workspace-flow-polish.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkspaceApp />
  </React.StrictMode>,
);
