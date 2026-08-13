import { Command } from "cmdk";
import { ClipboardList, Radio, Search, Users, X } from "lucide-react";
import { isNui, nui } from "../../lib/nui";
import { useDispatchStore } from "../../stores/dispatch-store";

export function DispatchHeader() {
  const service = useDispatchStore((state) => state.service);
  const calls = useDispatchStore((state) => state.calls);
  const units = useDispatchStore((state) => state.units);
  const dispatcher = useDispatchStore((state) => state.dispatcher);
  const canBecome = useDispatchStore((state) => state.canBecomeDispatcher);
  const query = useDispatchStore((state) => state.query);
  const setQuery = useDispatchStore((state) => state.setQuery);
  const toggleDispatcher = useDispatchStore((state) => state.toggleDispatcher);
  return (
    <header className="topbar">
      <div className="service-identity">
        <span className="service-mark">
          <Radio />
        </span>
        <div>
          <h1>
            <span>{service?.department || "LSPD"}</span> <span>Dispatch</span>
          </h1>
          <p>{service?.channel || "Los Santos Emergency Communications"}</p>
        </div>
      </div>
      <Command className="global-search" shouldFilter={false}>
        <Search />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search calls, locations, units..."
          aria-label="Search calls, locations, and units"
        />
        <kbd>/</kbd>
      </Command>
      <div className="header-metrics">
        {(dispatcher || canBecome) && (
          <button
            className={`dispatcher-role ${dispatcher ? "is-active" : ""}`}
            onClick={toggleDispatcher}
          >
            {dispatcher ? "Leave Dispatch" : "Become Dispatcher"}
          </button>
        )}
        {dispatcher && (
          <button
            className="dispatcher-create"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("nmsh:create-call"))
            }
          >
            Create call
          </button>
        )}
        <div className="metric">
          <ClipboardList />
          <span>
            <b>
              {
                calls.filter(
                  (call) => call.status === "NEW" || call.status === "ACTIVE",
                ).length
              }
            </b>{" "}
            Active calls
          </span>
        </div>
        <div className="metric">
          <Users />
          <span>
            <b>{units.length}</b> Online units
          </span>
        </div>
        <button
          className="full-dispatch-close"
          aria-label="Close Full Dispatch"
          title="Close"
          onClick={() =>
            isNui
              ? void nui.fullClose()
              : useDispatchStore.getState().setOpen(false)
          }
        >
          <X />
        </button>
      </div>
    </header>
  );
}
