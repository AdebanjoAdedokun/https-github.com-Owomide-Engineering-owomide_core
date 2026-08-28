import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./reframe.css";
import "./motion-story.css";
import "./premium-motion.css";
import "./architecture-pass.css";
import "./navbar-team-pass.css";
import "./roadmap-integration-refinement.css";
import "./intelligence-progressive-reveal.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
