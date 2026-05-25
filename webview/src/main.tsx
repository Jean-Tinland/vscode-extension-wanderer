import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "reactflow/dist/style.css";
import "./styles/base.module.css";
import "./styles/design-system.module.css";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
