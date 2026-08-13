import { lazy, Suspense } from "react";
import { SmallHud } from "./features/small-hud/SmallHud";
import { useNuiBridge } from "./hooks/use-nui-bridge";

const FullDispatch = lazy(() =>
  import("./features/full-dispatch/FullDispatch").then((module) => ({
    default: module.FullDispatch,
  })),
);

export default function App() {
  useNuiBridge();
  return location.pathname.endsWith("full-dispatch.html") ? (
    <Suspense>
      <FullDispatch />
    </Suspense>
  ) : (
    <>
      <SmallHud />
      <Suspense>
        <FullDispatch />
      </Suspense>
    </>
  );
}
