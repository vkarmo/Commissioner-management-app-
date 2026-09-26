import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findModule } from "../modules";
import { createResource, getResource, updateResource } from "../api/resources";
import { RecordForm } from "../components/RecordForm";
import { FireIncidentActions } from "../components/FireIncidentActions";
import { ParcelDetailPanel } from "../components/ParcelDetailPanel";
import { ContractorLinkPanel } from "../components/ContractorLinkPanel";

export function ResourceFormPage() {
  const { moduleKey = "", id } = useParams();
  const module = findModule(moduleKey);
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [initial, setInitial] = useState<Record<string, unknown> | undefined>(isNew ? {} : undefined);

  useEffect(() => {
    if (!module || isNew || !id) return;
    getResource(module, id).then((item) => setInitial(item ?? {}));
  }, [module, id, isNew]);

  if (!module) return <p>Unknown module.</p>;

  if (isNew && module.createDisabled) {
    return (
      <div>
        <h1>New {module.label.replace(/s$/, "")}</h1>
        <p className="form-error">{module.createDisabled}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>
        {isNew ? "New" : "Edit"} {module.label.replace(/s$/, "")}
      </h1>
      {initial === undefined ? (
        <p className="muted">Loading…</p>
      ) : (
        <RecordForm
          fields={module.fields}
          initial={initial}
          submitLabel={isNew ? "Create" : "Save changes"}
          onSubmit={async (values) => {
            if (isNew) {
              await createResource(module, values);
            } else if (id) {
              await updateResource(module, id, values);
            }
            navigate(`/${module.key}`);
          }}
        />
      )}
      {/* Online-only conveniences layered on the offline-first form above:
          dispatch actions and cross-record lookups both need a live
          connection to create relationships/read joined data, unlike the
          base form which always works from the local queue/cache. */}
      {!isNew && id && module.key === "fire-incidents" && <FireIncidentActions incidentId={id} />}
      {!isNew && id && module.key === "parcels" && <ParcelDetailPanel parcelId={id} />}
      {!isNew && id && module.key === "public-works" && <ContractorLinkPanel mode="public-works" recordId={id} />}
      {!isNew && id && module.key === "expenditures" && <ContractorLinkPanel mode="expenditure" recordId={id} />}
    </div>
  );
}
