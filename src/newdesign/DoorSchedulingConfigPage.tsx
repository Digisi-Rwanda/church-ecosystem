import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  fetchCategoryServicePolicies,
  fetchChoirCategories,
  fetchChoirCategoryLinks,
  fetchConfigVersions,
  fetchProtocolDutyPolicy,
  fetchProtocolServiceRules,
  fetchSchedulingServices,
  retireSchedulingService,
  type CategoryServicePolicyApi,
  type ChoirCategoryApi,
  type ChoirCategoryLinkApi,
  type ConfigVersionApi,
  type ProtocolServiceRuleApi,
  type SchedulingServiceApi,
} from "../api/frontDoorApi";
import { useT } from "../i18n/I18nContext";
import { LoadState } from "./LoadState";
import { useLoad } from "./useLoad";
import { EmptyState, PageHeader } from "./kit";
import {
  CONFIG_TABS,
  configTabKey,
  extraDutyPolicyName,
  linkSummary,
  policySummary,
  ruleSummary,
  serviceSummary,
  versionSummary,
} from "./config";

export function DoorSchedulingConfigPage() {
  const t = useT();
  const { systemId = "" } = useParams();
  const [tab, setTab] = useState<(typeof CONFIG_TABS)[number]>("services");

  return (
    <section className="door-block" aria-labelledby="door-config-title">
      <div>
        <PageHeader id="door-config-title" title={t("door.config.title")} purpose={t("door.purpose.config")} />
      </div>
      <nav className="door-menu" aria-label={t("door.config.tabs")}>
        {CONFIG_TABS.map((k) => (
          <button
            key={k}
            type="button"
            className={"door-menu-link" + (tab === k ? " active" : "")}
            aria-current={tab === k ? "page" : undefined}
            onClick={() => setTab(k)}
          >
            {t(configTabKey(k))}
          </button>
        ))}
      </nav>
      {tab === "services" && <ServicesTab systemId={systemId} />}
      {tab === "categories" && <CategoriesTab systemId={systemId} />}
      {tab === "policies" && <PoliciesTab systemId={systemId} />}
      {tab === "links" && <LinksTab systemId={systemId} />}
      {tab === "protocol" && <ProtocolTab systemId={systemId} />}
      {tab === "duty" && <DutyTab systemId={systemId} />}
      {tab === "versions" && <VersionsTab systemId={systemId} />}
    </section>
  );
}

function ServicesTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchSchedulingServices(systemId, false), "sched-config-services|" + systemId);
  const [error, setError] = useState("");
  const run = async (job: () => Promise<unknown>) => {
    setError("");
    try {
      await job();
      list.reload();
    } catch {
      setError(t("door.config.err.server"));
    }
  };
  return (
    <>
      {error && <p className="door-error" role="alert">{error}</p>}
      <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
        {(list.data?.services ?? []).length === 0 ? (
          <EmptyState title={t("door.config.services.empty")} />
        ) : (
          <ul className="door-notices">
            {(list.data?.services ?? []).map((s: SchedulingServiceApi) => (
              <li key={s.id} className="panel door-notice">
                <div className="door-notice-main">
                  <strong>{s.name}</strong>
                  <p className="muted">{serviceSummary(s, t)}</p>
                  {s.active && (
                    <button type="button" className="btn ghost sm" onClick={() => void run(() => retireSchedulingService(s.id))}>
                      {t("door.config.form.retire")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </LoadState>
    </>
  );
}

function CategoriesTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchChoirCategories(systemId, false), "sched-config-cats|" + systemId);
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {(list.data?.categories ?? []).length === 0 ? (
        <EmptyState title={t("door.config.categories.empty")} />
      ) : (
        <ul className="door-notices">
          {(list.data?.categories ?? []).map((c: ChoirCategoryApi) => (
            <li key={c.id} className="panel door-notice">
              <div className="door-notice-main">
                <strong>{c.name}</strong>
                <p className="muted">{c.description || c.code}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}

function PoliciesTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchCategoryServicePolicies(systemId), "sched-config-policies|" + systemId);
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {(list.data?.policies ?? []).length === 0 ? (
        <EmptyState title={t("door.config.policies.empty")} />
      ) : (
        <ul className="door-notices">
          {(list.data?.policies ?? []).map((p: CategoryServicePolicyApi) => (
            <li key={p.id} className="panel door-notice">
              <div className="door-notice-main">
                <p className="muted">{policySummary(p, t)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}

function LinksTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchChoirCategoryLinks(systemId), "sched-config-links|" + systemId);
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {(list.data?.links ?? []).length === 0 ? (
        <EmptyState title={t("door.config.links.empty")} />
      ) : (
        <ul className="door-notices">
          {(list.data?.links ?? []).map((l: ChoirCategoryLinkApi) => (
            <li key={l.id} className="panel door-notice">
              <div className="door-notice-main">
                <p className="muted">{linkSummary(l, t)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}

function ProtocolTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchProtocolServiceRules(systemId), "sched-config-protocol|" + systemId);
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {(list.data?.rules ?? []).length === 0 ? (
        <EmptyState title={t("door.config.protocol.empty")} />
      ) : (
        <ul className="door-notices">
          {(list.data?.rules ?? []).map((r: ProtocolServiceRuleApi) => (
            <li key={r.id} className="panel door-notice">
              <div className="door-notice-main">
                <p className="muted">{ruleSummary(r, t)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}

function DutyTab({ systemId }: { systemId: string }) {
  const t = useT();
  const pol = useLoad(() => fetchProtocolDutyPolicy(systemId), "sched-config-duty|" + systemId);
  return (
    <LoadState loading={pol.loading} failed={pol.failed} retry={pol.reload}>
      {pol.data?.policy ? (
        <div className="panel">
          <ul className="door-list">
            <li><strong>{t("door.config.duty.preferTarget")}:</strong> {pol.data.policy.preferTarget}</li>
            <li><strong>{t("door.config.duty.softMax")}:</strong> {pol.data.policy.softMax}</li>
            <li><strong>{t("door.config.duty.hardMax")}:</strong> {pol.data.policy.hardMax}</li>
            <li><strong>{t("door.config.duty.extra")}:</strong> {extraDutyPolicyName(pol.data.policy.extraDutyPolicy, t)}</li>
            <li><strong>{t("door.config.duty.duplicate")}:</strong> {pol.data.policy.duplicateSameDayAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
            <li><strong>{t("door.config.duty.music")}:</strong> {pol.data.policy.musicCompatibilityRequired ? t("door.config.form.yes") : t("door.config.form.no")}</li>
            <li><strong>{t("door.config.duty.exceptions")}:</strong> {pol.data.policy.exceptionsAllowed ? t("door.config.form.yes") : t("door.config.form.no")}</li>
          </ul>
        </div>
      ) : (
        <EmptyState title={t("door.config.versions.empty")} />
      )}
    </LoadState>
  );
}

function VersionsTab({ systemId }: { systemId: string }) {
  const t = useT();
  const list = useLoad(() => fetchConfigVersions(systemId), "sched-config-versions|" + systemId);
  return (
    <LoadState loading={list.loading} failed={list.failed} retry={list.reload}>
      {(list.data?.versions ?? []).length === 0 ? (
        <EmptyState title={t("door.config.versions.empty")} />
      ) : (
        <ul className="door-notices">
          {(list.data?.versions ?? []).map((v: ConfigVersionApi) => (
            <li key={v.id} className="panel door-notice">
              <div className="door-notice-main">
                <strong>{v.label}</strong>
                <p className="muted">{versionSummary(v, t)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </LoadState>
  );
}
