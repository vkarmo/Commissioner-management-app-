import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findModule } from "../modules";
import { createResource, getResource, updateResource } from "../api/resources";
import { RecordForm } from "../components/RecordForm";

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
    </div>
  );
}
