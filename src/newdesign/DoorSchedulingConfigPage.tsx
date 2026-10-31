import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  activateConfigVersion,
  cloneConfigVersion,
  createConfigVersion,
  fetchConfigVersions,
  type ConfigVersionApi,
} from "../api/frontDoorApi";
import { useT } from "../i18n/I18nContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import { EmptyState, PageHeader } from "./kit";
import {
  CategoriesEditor,
  LinksEditor,
  PoliciesEditor,
  ProtocolDutyEditor,
  ProtocolRulesEditor,
  ServicesEditor,
} from "./SchedulingConfigEditors";
import {
  configTabsForSystem,
  configTabKey,
  versionSummary,
} from "./config";

type VersionCreateResult = { version?: ConfigVersionApi | string };

async function createDraftVersion(systemId: string, rows: ConfigVersionApi[], label: string): Promise<VersionCreateResult> {
  if (rows.some((version) => version.status === "ACTIVE")) {
    return await cloneConfigVersion(systemId, label) as VersionCreateResult;
  }
  const nextVersion = rows.reduce((max, version) => Math.max(max, version.version), 0) + 1;
  return await createConfigVersion({ systemId, version: nextVersion, label, status: "DRAFT" }) as VersionCreateResult;
}

const createdVersionId = (result: VersionCreateResult) =>
  typeof result.version === "string" ? result.version : result.version?.id;

export function DoorSchedulingConfigPage() {
  const t = useT();
  const { systemId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = configTabsForSystem(systemId);
  const [createError, setCreateError] = useState("");
  const versions = useLoad(() => fetchConfigVersions(systemId), `sched-config-versions|${systemId}`);
  const rows = useMemo(() => versions.data?.versions ?? [], [versions.data?.versions]);
  const requestedVersionId = searchParams.get("version");
  const selectedVersion = rows.find((version) => version.id === requestedVersionId)
    ?? rows.find((version) => version.status === "ACTIVE")
    ?? rows[0];
  const versionId = selectedVersion?.id ?? "";
  const editable = selectedVersion?.status === "DRAFT";
  const requestedTab = searchParams.get("tab");
  const tab = tabs.find((candidate) => candidate === requestedTab) ?? "services";

  useEffect(() => {
    if (requestedVersionId && !rows.some((version) => version.id === requestedVersionId)) return;
    if (!selectedVersion || selectedVersion.id === requestedVersionId) return;
    const next = new URLSearchParams(searchParams);
    next.set("version", selectedVersion.id);
    setSearchParams(next, { replace: true });
  }, [requestedVersionId, rows, searchParams, selectedVersion, setSearchParams]);

  const selectVersion = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("version", id);
    else next.delete("version");
    setSearchParams(next);
  };
  const selectTab = (nextTab: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next);
  };
  const createInitialDraft = async () => {
    setCreateError("");
    try {
      const result = await createDraftVersion(systemId, rows, t("door.config.version.draftLabel"));
      versions.reload();
      const id = createdVersionId(result);
      if (id) selectVersion(id);
    } catch (reason) {
      setCreateError(reason instanceof Error && reason.message ? reason.message : t("door.config.err.server"));
    }
  };

  return (
    <section className="door-block" aria-labelledby="door-config-title">
      <div>
        <PageHeader id="door-config-title" title={t("door.config.title")} purpose={t("door.purpose.config")} />
      </div>
      <LoadState loading={versions.loading} failed={versions.failed} retry={versions.reload}>
        {rows.length === 0 ? (
          <div className="panel door-form">
            <p className="muted">{t("door.config.versions.empty")}</p>
            {createError && <p className="door-error" role="alert">{createError}</p>}
            <button type="button" className="btn sm" onClick={() => void createInitialDraft()}>
              {t("door.config.version.createDraft")}
            </button>
          </div>
        ) : (
          <>
            <label className="door-config-version">
              {t("door.config.selectedVersion")}
              <select value={versionId} onChange={(event) => selectVersion(event.currentTarget.value)}>
                {rows.map((version) => <option key={version.id} value={version.id}>{versionSummary(version, t)}</option>)}
              </select>
            </label>
            <p className="muted" role="status">
              {editable ? t("door.config.draftEditable") : t("door.config.versionReadOnly", {
                status: selectedVersion ? t(`door.config.status.${selectedVersion.status}` as Parameters<typeof t>[0]) : "",
              })}
            </p>
          </>
        )}
      </LoadState>
      <nav className="door-menu" aria-label={t("door.config.tabs")}>
        {tabs.map((key) => (
          <button key={key} type="button" className={"door-menu-link" + (tab === key ? " active" : "")}
            aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
            {t(configTabKey(key))}
          </button>
        ))}
      </nav>
      {tab === "services" && <ServicesEditor systemId={systemId} version={selectedVersion} />}
      {tab === "categories" && <CategoriesEditor systemId={systemId} version={selectedVersion} />}
      {tab === "policies" && <PoliciesEditor systemId={systemId} version={selectedVersion} />}
      {tab === "links" && <LinksEditor systemId={systemId} version={selectedVersion} />}
      {tab === "protocol" && <ProtocolRulesEditor systemId={systemId} version={selectedVersion} />}
      {tab === "duty" && <ProtocolDutyEditor systemId={systemId} version={selectedVersion} />}
      {tab === "versions" && (
        <VersionsTab systemId={systemId} rows={rows} selectedId={versionId} reload={versions.reload} selectVersion={selectVersion} />
      )}
    </section>
  );
}

function VersionsTab({ systemId, rows, selectedId, reload, selectVersion }: {
  systemId: string;
  rows: ConfigVersionApi[];
  selectedId: string;
  reload: () => void;
  selectVersion: (id: string) => void;
}) {
  const t = useT();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const run = async (job: () => Promise<unknown>) => {
    setError("");
    setWorking(true);
    try {
      await job();
      reload();
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t("door.config.err.server"));
    } finally {
      setWorking(false);
    }
  };
  const createDraft = async () => {
    setError("");
    setWorking(true);
    try {
      const result = await createDraftVersion(systemId, rows, t("door.config.version.draftLabel"));
      reload();
      const id = createdVersionId(result);
      if (id) selectVersion(id);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : t("door.config.err.server"));
    } finally {
      setWorking(false);
    }
  };
  return (
    <div>
      {error && <p className="door-error" role="alert">{error}</p>}
      <button type="button" className="btn sm" disabled={working} onClick={() => void createDraft()}>
        {t("door.config.version.createDraft")}
      </button>
      {rows.length === 0 ? <EmptyState title={t("door.config.versions.empty")} /> : (
        <ul className="door-notices">
          {rows.map((version) => (
            <li key={version.id} className="panel door-notice">
              <div className="door-notice-main">
                <strong>{version.label}</strong>
                <p className="muted">{versionSummary(version, t)}</p>
                <div className="door-row">
                  <button type="button" className="btn ghost sm" onClick={() => selectVersion(version.id)}>
                    {version.id === selectedId ? t("door.config.version.selected") : t("door.config.version.select")}
                  </button>
                  {version.status === "DRAFT" && (
                    <button type="button" className="btn ghost sm" disabled={working}
                      onClick={() => void run(() => activateConfigVersion(version.id))}>
                      {t("door.config.version.activate")}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
