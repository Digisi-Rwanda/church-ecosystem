import { MusicParticipationEditor } from "./MusicParticipationEditor";
import { schedulingError } from "./schedulingForms";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { SchedulingSetupContext } from './SchedulingSetupContext';
import { MusicSetupReview } from './MusicSetupReview';
import { useParams, useSearchParams } from "react-router-dom";
import {
  activateConfigVersion, archiveConfigVersion, restoreConfigVersion, deleteConfigVersion,
  cloneConfigVersion,
  createConfigVersion,
  fetchConfigVersions,
  type ConfigVersionApi,
} from "../api/frontDoorApi";
import { useT } from "../i18n/I18nContext";
import { useFrontDoor } from "./FrontDoorContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import { ConfirmDialog, EmptyState, PageHeader, StatusChip } from "./kit";
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
  MUSIC_SETUP_STEPS, musicSetupStep,
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

export async function serviceWorkingDraft(systemId: string, label: string) {
  const current = await fetchConfigVersions(systemId);
  return current.versions.find((row) => row.status === "DRAFT")?.id
    ?? createdVersionId(await createDraftVersion(systemId, current.versions, label));
}

export function DoorSchedulingConfigPage() {
  const t = useT();
  const { capabilities } = useFrontDoor();
  const { systemId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = configTabsForSystem(systemId);
  const isMusic = systemId === 'sys-music';
  const [unsaved, setUnsaved] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [reviewReady, setReviewReady] = useState(false);
  const [confirmActivation, setConfirmActivation] = useState<ConfigVersionApi | null>(null);
  const [createError, setCreateError] = useState("");
  const [createWorking, setCreateWorking] = useState(false);
  const [serviceIntent, setServiceIntent] = useState<{ versionId: string; code: string | null } | null>(null);
  const [activationError, setActivationError] = useState("");
  const [activationWorking, setActivationWorking] = useState(false);
  const versions = useLoad(() => fetchConfigVersions(systemId), `sched-config-versions|${systemId}`);
  const rows = useMemo(() => versions.data?.versions ?? [], [versions.data?.versions]);
  const configAccess = capabilities?.systems.find((system) => system.id === systemId)
    ?.own?.find((block) => block.key === "config")?.letters ?? [];
  const canWrite = configAccess.includes("W");
  const requestedVersionId = searchParams.get("version");
  const selectedVersion = rows.find((version) => version.id === requestedVersionId)
    ?? (searchParams.get("draft") === "1" ? rows.find((version) => version.status === "DRAFT") : undefined)
    ?? rows.find((version) => version.status === "ACTIVE")
    ?? rows[0];
  const versionId = selectedVersion?.id ?? "";
  const editable = selectedVersion?.status === "DRAFT";
  const requestedTab = searchParams.get("tab");
  const tab = tabs.find((candidate) => candidate === requestedTab) ?? "services";
  const step = musicSetupStep(tab);
  const stepKeys = ['services','choirs','rules','review'] as const;

  useEffect(() => {
    if (requestedVersionId && !rows.some((version) => version.id === requestedVersionId)) return;
    if (!selectedVersion || selectedVersion.id === requestedVersionId) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("version", selectedVersion.id);
      return next;
    }, { replace: true });
  }, [requestedVersionId, rows, searchParams, selectedVersion, setSearchParams]);

  const selectVersion = (id: string) => {
    if (unsaved) {setNavigationError(t('door.config.setup.unsaved'));return;}
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id) next.set("version", id);
      else next.delete("version");
      return next;
    });
  };
  const selectTab = (nextTab: string) => {
    if (unsaved) { setNavigationError(t('door.config.setup.unsaved')); return; }
    setNavigationError('');
    setReviewReady(false);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", nextTab);
      return next;
    });
  };
  const createInitialDraft = async () => {
    if (!canWrite || createWorking) return;
    setCreateWorking(true);
    setCreateError("");
    try {
      const result = await createDraftVersion(systemId, rows, t("door.config.version.draftLabel"));
      versions.reload();
      const id = createdVersionId(result);
      if (id) selectVersion(id);
    } catch (reason) {
      setCreateError(schedulingError(reason) ?? t("door.config.err.server"));
    } finally {
      setCreateWorking(false);
    }
  };
  const beginSetup = async () => {
    if (!canWrite || createWorking) return;
    setCreateWorking(true);setCreateError('');
    try {
      const id = await serviceWorkingDraft(systemId,t('door.config.version.draftLabel'));
      versions.reload();if (id) selectVersion(id);
    } catch (reason) {setCreateError(schedulingError(reason) ?? t('door.config.err.server'));}
    finally {setCreateWorking(false);}
  };
  const editServices = async (code: string | null) => {
    if (!canWrite || createWorking) return;
    setCreateWorking(true);
    setCreateError("");
    try {
      // Reuse an existing working draft; historical versions are never edited in place.
      const id = await serviceWorkingDraft(systemId, t("door.config.version.draftLabel"));
      if (!id) throw new Error(t("door.config.err.server"));
      setServiceIntent({ versionId: id, code });
      selectVersion(id);
      versions.reload();
    } catch (reason) {
      setCreateError(schedulingError(reason) ?? t("door.config.err.server"));
    } finally {
      setCreateWorking(false);
    }
  };
  const systemName = systemId === "sys-music" ? t("door.config.system.music")
    : systemId === "sys-protocol" ? t("door.config.system.protocol")
      : t("door.config.system.unknown");
  const activeVersion = rows.find((version) => version.status === "ACTIVE");
  const tabCopyKey = `door.config.intro.${systemId === "sys-protocol" ? "protocol" : "music"}.${tab}` as Parameters<typeof t>[0];

  return (
    <section className="door-block scheduling-config" aria-labelledby="door-config-title">
      <PageHeader id="door-config-title" title={t("door.config.title")}
        meta={<StatusChip tone="info">{systemName}</StatusChip>} />
      <p><Link className="btn ghost sm" to={systemId === "sys-music" ? "/s/sys-music/monthplan" : "/s/sys-protocol/teams"}>{t("door.scheduling.workspace")}</Link></p>
      <p className="scheduling-config-intro">{t("door.config.intro")}</p>
      <LoadState loading={versions.loading} failed={versions.failed} retry={versions.reload}>
        {rows.length === 0 ? (
          <div className="panel scheduling-config-version">
            <div>
              <h3>{t("door.config.version.heading")}</h3>
              <p className="muted">{t("door.config.versions.empty")}</p>
            </div>
            {createError && <p className="door-error" role="alert">{createError}</p>}
            {canWrite && <button type="button" className="btn sm" disabled={createWorking} onClick={() => void createInitialDraft()}>
              {t("door.config.version.createDraft")}
            </button>}
          </div>
        ) : (
          <div className="panel scheduling-config-version">
            <div className="scheduling-config-version-heading">
              <div>
                <h3>{t("door.config.version.heading")}</h3>
                <p className="muted">{t("door.config.version.chooseHelp")}</p>
              </div>
              {selectedVersion && <StatusChip tone={selectedVersion.status === "ACTIVE" ? "success" : selectedVersion.status === "DRAFT" ? "warn" : "neutral"}>
                {t(`door.config.status.${selectedVersion.status}` as Parameters<typeof t>[0])}
              </StatusChip>}
            </div>
            <label>
              {t("door.config.selectedVersion")}
              <select value={versionId} onChange={(event) => selectVersion(event.currentTarget.value)}>
                {rows.map((version) => <option key={version.id} value={version.id}>{versionSummary(version, t)}</option>)}
              </select>
            </label>
            <p className="scheduling-config-version-note" role="status">
              {editable
                ? canWrite ? t("door.config.draftEditable") : t("door.config.versionReadOnly", { status: t("door.config.status.DRAFT") })
                : selectedVersion?.status === "ACTIVE"
                  ? t("door.config.activeInUse")
                  : selectedVersion?.status === "ARCHIVED"
                    ? t("door.config.archivedReadOnly")
                  : t("door.config.versionReadOnly", {
                    status: selectedVersion ? t(`door.config.status.${selectedVersion.status}` as Parameters<typeof t>[0]) : "",
                  })}
            </p>
            {activeVersion && selectedVersion?.id !== activeVersion.id && (
              <p className="muted">{t("door.config.activeVersion", { name: activeVersion.label })}</p>
            )}
            {isMusic && canWrite && !editable && <button type="button" className="btn sm" disabled={createWorking} onClick={() => void beginSetup()}>{t('door.config.setup.edit')}</button>}
            {canWrite && editable && selectedVersion && !isMusic && <button type="button" className="btn sm"
              disabled={activationWorking} onClick={() => { setActivationError(""); setConfirmActivation(selectedVersion); }}>
              {t("door.config.version.activate")}
            </button>}
          </div>
        )}
        {activationError && <p className="door-error" role="alert">{activationError}</p>}
        {rows.length > 0 && createError && <p className="door-error" role="alert">{createError}</p>}
      </LoadState>
      {isMusic ? <>
        <nav className="scheduling-steps" aria-label={t('door.config.setup.steps')}>
          {MUSIC_SETUP_STEPS.map((key,index) => <button key={key} type="button" className={'btn ' + (tab !== 'versions' && index === step ? '' : 'ghost')}
            aria-current={tab !== 'versions' && index === step ? 'step' : undefined} onClick={() => selectTab(key)}>
            <span>{index + 1}</span> {t(`door.config.step.${stepKeys[index]}`)}
          </button>)}
        </nav>
        <button type="button" className="btn ghost sm" onClick={() => selectTab('versions')}>{t('door.config.tab.versions')}</button>
      </> : <nav className="door-menu" aria-label={t("door.config.tabs")}>
        {tabs.map((key) => (
          <button key={key} type="button" className={"door-menu-link" + (tab === key ? " active" : "")}
            aria-current={tab === key ? "page" : undefined} onClick={() => selectTab(key)}>
            {t(configTabKey(key))}
          </button>
        ))}
      </nav>}
      {navigationError && <p className="door-error" role="alert">{navigationError}</p>}
      <header className="scheduling-config-section">
        <h3>{isMusic && tab !== 'versions' ? t(`door.config.setup.question.${stepKeys[step]}`) : t(configTabKey(tab))}</h3>
        {isMusic && tab !== 'versions' ? <p>{t('door.config.setup.progress',{step:step + 1})}</p> : <p className="muted">{t(tabCopyKey)}</p>}
      </header>
      <SchedulingSetupContext.Provider value={{saved:() => {setUnsaved(false);setNavigationError('');},changed:() => setUnsaved(true)}}>
      <div onChangeCapture={() => setUnsaved(true)}>
      {tab === "services" && <ServicesEditor key={versionId} systemId={systemId} version={selectedVersion} canWrite={canWrite}
        onRequestEdit={editServices} preparing={createWorking}
        intent={serviceIntent?.versionId === versionId ? serviceIntent : null}
        onIntentHandled={() => setServiceIntent(null)} />}
      {isMusic && step === 1 && tab !== 'versions' && <>
        <LinksEditor key={'links' + versionId} systemId={systemId} version={selectedVersion} canWrite={canWrite} />
        <details open={tab === 'categories'} className="scheduling-config-advanced"><summary>{t('door.config.setup.categories')}</summary>
          <CategoriesEditor key={'cats' + versionId} systemId={systemId} version={selectedVersion} canWrite={canWrite} />
        </details>
      </>}
      {isMusic && step === 2 && tab !== 'versions' && <>
        <PoliciesEditor key={'policies' + versionId} systemId={systemId} version={selectedVersion} canWrite={canWrite} />
        {(['fixed','availability'] as const).map(mode => <details key={mode} className="scheduling-config-advanced" open={tab === mode}>
          <summary>{t(configTabKey(mode))}</summary><MusicParticipationEditor key={mode + versionId} mode={mode} version={selectedVersion} canWrite={canWrite} />
        </details>)}
      </>}
      {isMusic && tab === 'review' && versionId && <MusicSetupReview key={versionId} versionId={versionId} edit={selectTab} ready={setReviewReady} />}
      {tab === "protocol" && <ProtocolRulesEditor systemId={systemId} version={selectedVersion} canWrite={canWrite} />}
      {tab === "duty" && <ProtocolDutyEditor systemId={systemId} version={selectedVersion} canWrite={canWrite} />}
      {tab === "versions" && (
        <VersionsTab systemId={systemId} rows={rows} selectedId={versionId} reload={versions.reload}
          selectVersion={selectVersion} canWrite={canWrite}
          onActivate={(version) => {
            setActivationError('');
            if (isMusic) {
              setReviewReady(false);
              setSearchParams(previous => {const next = new URLSearchParams(previous);next.set('version',version.id);next.set('tab','review');return next;});
            } else setConfirmActivation(version);
          }} />
      )}
      </div>
      </SchedulingSetupContext.Provider>
      {isMusic && tab !== 'versions' && <div className="door-row scheduling-step-actions">
        {step > 0 && <button type="button" className="btn ghost" onClick={() => selectTab(MUSIC_SETUP_STEPS[step - 1])}>{t('door.config.setup.back')}</button>}
        {step < 3 && <button type="button" className="btn" onClick={() => selectTab(MUSIC_SETUP_STEPS[step + 1])}>{t('door.config.setup.continue')}</button>}
        {step === 3 && canWrite && editable && selectedVersion && <button type="button" className="btn" disabled={activationWorking || !reviewReady} onClick={() => {setActivationError('');setConfirmActivation(selectedVersion);}}>{t('door.config.version.activate')}</button>}
      </div>}
      <ConfirmDialog
        open={!!confirmActivation}
        title={t("door.config.version.activateTitle", { name: confirmActivation?.label ?? "" })}
        body={t("door.config.version.activateBody")}
        confirmLabel={t("door.config.version.activate")}
        busy={activationWorking}
        onConfirm={() => {
          if (!confirmActivation || !canWrite || activationWorking) return;
          setActivationError("");
          setActivationWorking(true);
          void activateConfigVersion(confirmActivation.id).then(() => {
            setConfirmActivation(null);
            versions.reload();
          }).catch((reason: unknown) => {
            setActivationError(schedulingError(reason) ?? (reason instanceof Error && reason.message ? reason.message : t("door.config.err.server")));
            setConfirmActivation(null);
          }).finally(() => setActivationWorking(false));
        }}
        onCancel={() => { if (!activationWorking) setConfirmActivation(null); }}
      />
    </section>
  );
}

function VersionsTab({ systemId, rows, selectedId, reload, selectVersion, canWrite, onActivate }: {
  systemId: string;
  rows: ConfigVersionApi[];
  selectedId: string;
  reload: () => void;
  selectVersion: (id: string) => void;
  canWrite: boolean;
  onActivate: (version: ConfigVersionApi) => void;
}) {
  const t = useT();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [operation, setOperation] = useState<{ version: ConfigVersionApi; action: 'archive' | 'restore' | 'delete' } | null>(null);
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
      {canWrite && <button type="button" className="btn sm" disabled={working} onClick={() => void createDraft()}>
        {t("door.config.version.createDraft")}
      </button>}
      <ConfirmDialog open={!!operation} busy={working} title={operation ? t(`door.config.version.${operation.action}`) + ': ' + operation.version.label : ''}
        body={operation ? t(`door.config.version.${operation.action}Body`) : ''} confirmLabel={operation ? t(`door.config.version.${operation.action}`) : ''}
        onCancel={() => { if (!working) setOperation(null); }} onConfirm={() => {
          if (!operation || working || !canWrite) return;
          setWorking(true); setError('');
          const {version,action}=operation;
          const job=action === 'archive' ? archiveConfigVersion : action === 'restore' ? restoreConfigVersion : deleteConfigVersion;
          void job(version.id).then(() => {
            setOperation(null);
            if (action === 'delete' && selectedId === version.id) selectVersion(rows.find(row => row.id !== version.id && row.status === 'ACTIVE')?.id ?? rows.find(row => row.id !== version.id)?.id ?? '');
            reload();
          }).catch((reason: unknown) => { setError(schedulingError(reason) ?? t('door.config.err.server')); setOperation(null); }).finally(() => setWorking(false));
        }} />
      <p className="muted">{t("door.config.version.allDrafts")}</p>
      {rows.length === 0 ? <EmptyState title={t("door.config.versions.empty")} /> : (
        <ul className="door-notices">
          {rows.map((version) => (
            <li key={version.id} className="panel door-notice" aria-label={versionSummary(version, t)}>
              <div className="door-notice-main">
                <div className="scheduling-config-version-heading">
                  <strong>{version.label}</strong>
                  <StatusChip tone={version.status === "ACTIVE" ? "success" : version.status === "DRAFT" ? "warn" : "neutral"}>
                    {t(`door.config.status.${version.status}` as Parameters<typeof t>[0])}
                  </StatusChip>
                </div>
                <p className="muted">{versionSummary(version, t)}</p>
                {version.status === "ACTIVE" && <p className="muted">{t("door.config.activeInUse")}</p>}
                <div className="door-row">
                  <button type="button" className="btn ghost sm" onClick={() => selectVersion(version.id)}>
                    {version.id === selectedId ? t("door.config.version.selected") : t("door.config.version.select")}
                  </button>
                  {canWrite && version.status === "DRAFT" && (
                      <button type="button" className="btn ghost sm" disabled={working}
                      onClick={() => onActivate(version)}>
                      {t("door.config.version.activate")}
                    </button>
                  )}
                  {canWrite && (version.status === 'DRAFT' || version.status === 'ARCHIVED') && <>
                    <button type="button" className="btn ghost sm" disabled={working} onClick={() => setOperation({version,action:version.status === 'DRAFT' ? 'archive' : 'restore'})}>{t(version.status === 'DRAFT' ? 'door.config.version.archive' : 'door.config.version.restore')}</button>
                    {version.status === 'DRAFT' && <button type="button" className="btn ghost sm" disabled={working} onClick={() => setOperation({version,action:'delete'})}>{t('door.config.version.delete')}</button>}
                  </>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
