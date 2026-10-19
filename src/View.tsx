import {
  type CSSProperties,
  type ReactElement,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
// Types only: a value imported from the server entry would put NestJS into
// the browser's bundle.
import type {
  ApartmentGroup,
  ApartmentsResponse,
  Grouping,
  SummaryResponse,
} from "./server";

/**
 * The plugin's view, exposed as `./View` and loaded by the browser at runtime.
 *
 * Two rules make it a view the host can render rather than a page that happens
 * to work:
 *
 * - Every word on it is a key in the plugin's own namespace,
 *   `plugin-occupancy`, which the host merged from `locales/` into the store
 *   the shared i18next already holds. A missing key shows as the key.
 * - Every colour, radius, shadow and typeface is a `--obrf-*` design token, so
 *   a theme restyles the view with the rest of the interface. The styles are
 *   inline rather than utility classes because the host's stylesheet holds only
 *   the utilities the host itself uses.
 */

const BASE = "/api/plugin/occupancy";

const GROUPINGS: readonly Grouping[] = ["address", "floor"];

type Loaded<T> =
  { status: "loading" } | { status: "failed" } | { status: "ready"; data: T };

/**
 * Fetches one of the plugin's own routes.
 *
 * Same origin, so the session cookie travels with the request and the plugin
 * never handles a credential. A route the person may not read answers 403,
 * which is shown as the same failure as any other.
 */
function useRoute<T>(path: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    const load = async (): Promise<void> => {
      try {
        const response = await fetch(`${BASE}/${path}`, {
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${String(response.status)}`);
        }
        setState({ status: "ready", data: (await response.json()) as T });
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: "failed" });
        }
      }
    };

    void load();
    return () => {
      controller.abort();
    };
  }, [path]);

  return state;
}

const styles = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    padding: "1.25rem",
    background: "var(--obrf-surface-raised)",
    color: "var(--obrf-text-primary)",
    border: "1px solid var(--obrf-border-subtle)",
    borderRadius: "var(--obrf-radius-panel)",
    boxShadow: "var(--obrf-shadow-raised)",
    fontFamily: "var(--obrf-font-ui)",
  },
  heading: { margin: 0, fontSize: "1.125rem", fontWeight: 600 },
  muted: {
    margin: 0,
    fontSize: "0.8125rem",
    color: "var(--obrf-text-secondary)",
  },
  failed: {
    margin: 0,
    fontSize: "0.8125rem",
    color: "var(--obrf-status-danger)",
  },
  figures: { display: "flex", flexWrap: "wrap", gap: "1.5rem", margin: 0 },
  figure: { display: "flex", flexDirection: "column-reverse", gap: "0.25rem" },
  figureValue: {
    margin: 0,
    fontFamily: "var(--obrf-font-data)",
    fontSize: "1.5rem",
  },
  // Text stays on the raised surface: that pair, and status-warn on it, are
  // the ones a theme's contrast check guarantees. Text on status-warn-soft is
  // not among them.
  attention: {
    margin: 0,
    padding: "0.25rem 0.75rem",
    fontSize: "0.8125rem",
    color: "var(--obrf-text-primary)",
    borderLeft: "3px solid var(--obrf-status-warn)",
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5rem",
  },
  toggle: {
    padding: "0.25rem 0.75rem",
    font: "inherit",
    fontSize: "0.8125rem",
    color: "var(--obrf-text-primary)",
    background: "var(--obrf-surface-page)",
    border: "1px solid var(--obrf-border-strong)",
    borderRadius: "var(--obrf-radius-control)",
    cursor: "pointer",
  },
  toggleOn: {
    color: "var(--obrf-on-accent-trust)",
    background: "var(--obrf-accent-trust)",
    borderColor: "var(--obrf-accent-trust)",
  },
  // Fixed, so the columns line up from one group's table to the next.
  table: {
    width: "100%",
    tableLayout: "fixed",
    borderCollapse: "collapse",
    fontSize: "0.875rem",
  },
  caption: { textAlign: "left", fontWeight: 600, padding: "0.5rem 0" },
  th: {
    textAlign: "left",
    fontWeight: 600,
    padding: "0.375rem 0.5rem",
    borderBottom: "1px solid var(--obrf-border-strong)",
  },
  td: {
    padding: "0.375rem 0.5rem",
    borderBottom: "1px solid var(--obrf-border-subtle)",
  },
  data: { fontFamily: "var(--obrf-font-data)" },
  nobody: { color: "var(--obrf-status-warn)", fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

function Figure({
  label,
  value,
}: {
  label: string;
  value: number;
}): ReactElement {
  return (
    <div style={styles.figure}>
      <dt style={styles.muted}>{label}</dt>
      <dd style={styles.figureValue}>{value}</dd>
    </div>
  );
}

function GroupTable({ group }: { group: ApartmentGroup }): ReactElement {
  const { t } = useTranslation("plugin-occupancy");
  const caption =
    group.kind === "address"
      ? `${group.street} ${group.number}`
      : group.floor === null
        ? t("view.floorUnknown")
        : t("view.floor", { floor: group.floor });

  return (
    <table style={styles.table}>
      <caption style={styles.caption}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col" style={styles.th}>
            {t("view.column.apartment")}
          </th>
          <th scope="col" style={styles.th}>
            {t("view.column.residents")}
          </th>
          <th scope="col" style={styles.th}>
            {t("view.column.tenantOwners")}
          </th>
        </tr>
      </thead>
      <tbody>
        {group.apartments.map((apartment) => (
          <tr key={apartment.id}>
            <th
              scope="row"
              style={{
                ...styles.td,
                ...styles.data,
                textAlign: "left",
                fontWeight: 400,
              }}
            >
              {apartment.number}
            </th>
            <td style={{ ...styles.td, ...styles.data }}>
              {apartment.residents === 0 ? (
                <span style={styles.nobody}>{t("view.nobodyRegistered")}</span>
              ) : (
                apartment.residents
              )}
            </td>
            <td style={{ ...styles.td, ...styles.data }}>
              {apartment.tenantOwners}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ApartmentList(): ReactElement {
  const { t } = useTranslation("plugin-occupancy");
  // Null until the person picks one: the route then answers with the grouping
  // the board chose in the plugin's settings, and says which it was.
  const [picked, setPicked] = useState<Grouping | null>(null);
  const list = useRoute<ApartmentsResponse>(
    picked === null ? "apartments" : `apartments?grouping=${picked}`,
  );
  const current =
    picked ?? (list.status === "ready" ? list.data.grouping : null);

  return (
    <>
      <div style={styles.toolbar} role="group" aria-label={t("view.groupBy")}>
        <span style={styles.muted}>{t("view.groupBy")}</span>
        {GROUPINGS.map((option) => {
          const on = current === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              style={
                on ? { ...styles.toggle, ...styles.toggleOn } : styles.toggle
              }
              onClick={() => {
                setPicked(option);
              }}
            >
              {t(`settings.grouping.${option}`)}
            </button>
          );
        })}
      </div>

      {list.status === "loading" ? (
        <p style={styles.muted}>{t("view.loading")}</p>
      ) : null}
      {list.status === "failed" ? (
        <p role="alert" style={styles.failed}>
          {t("view.error")}
        </p>
      ) : null}
      {list.status === "ready" ? (
        <>
          {list.data.withoutResidents > 0 ? (
            <p style={styles.attention}>
              {t("view.withoutResidents", {
                count: list.data.withoutResidents,
              })}
            </p>
          ) : null}
          {list.data.groups.map((group) => (
            <GroupTable key={group.key} group={group} />
          ))}
          {list.data.shown < list.data.total ? (
            <p style={styles.muted}>
              {t("view.shown", {
                shown: list.data.shown,
                total: list.data.total,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export default function OccupancyView(): ReactElement {
  const { t } = useTranslation("plugin-occupancy");
  const summary = useRoute<SummaryResponse>("summary");

  if (summary.status !== "ready") {
    return (
      <section style={styles.panel} aria-busy={summary.status === "loading"}>
        <h2 style={styles.heading}>{t("view.title")}</h2>
        {summary.status === "loading" ? (
          <p style={styles.muted}>{t("view.loading")}</p>
        ) : (
          <p role="alert" style={styles.failed}>
            {t("view.error")}
          </p>
        )}
      </section>
    );
  }

  const { data } = summary;
  return (
    <section style={styles.panel}>
      <h2 style={styles.heading}>
        {data.heading === "" ? t("view.title") : data.heading}
      </h2>

      <dl style={styles.figures}>
        <Figure label={t("view.apartments")} value={data.apartments} />
        <Figure label={t("view.residents")} value={data.residents} />
        {data.members === null ? null : (
          <Figure label={t("view.members")} value={data.members} />
        )}
      </dl>

      <ApartmentList />
    </section>
  );
}
