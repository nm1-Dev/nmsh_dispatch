import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../html/style.css";
import "../html/full-dispatch.css";
import "../html/call-management.css";
import "./styles.css";
import App from "./App";
import { isNui } from "./lib/nui";

document.body.classList.add("is-nui-ready");
if (isNui) document.body.classList.add("is-nui");
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
