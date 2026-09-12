import React from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceApp } from "./WorkspaceApp.jsx";
import "./workspace-tokens.css";
import "./workspace.css";
import "./proposal.css";
import "./platform.css";
import "./workspace-premium-system.css";
import "./workspace-flow-polish.css";
import "./catalog-record.css";
import "./workflow-craft.css";
import "./role-workspace.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkspaceApp />
  </React.StrictMode>,
);
