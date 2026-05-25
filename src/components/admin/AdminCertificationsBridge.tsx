// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  addCertification,
  deleteCertification,
  fetchAllCertifications,
  normalizeCertifications,
  updateCertification,
} from "../../api/certifications";
import Certifications from "./Certifications";

export default function AdminCertificationsBridge() {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [remoteAvailable, setRemoteAvailable] = useState(true);

  const reload = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const { items, remoteCatalogAvailable } = await fetchAllCertifications({ activeOnly: false, pageSize: 200 });
      setRemoteAvailable(remoteCatalogAvailable !== false);
      setCatalog(normalizeCertifications(Array.isArray(items) ? items : []));
    } catch {
      setRemoteAvailable(false);
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const pager = useMemo(() => null, []);

  return (
    <Certifications
      certificationCatalog={catalog}
      localRegistryOnly={!remoteAvailable}
      catalogLoading={catalogLoading}
      pager={pager}
      onAddCertificationToCatalog={async (name) => {
        await addCertification({ name, listed: true });
        await reload();
      }}
      onEditCertificationInCatalog={async (id, name) => {
        await updateCertification(id, { name, listed: true });
        await reload();
      }}
      onSetCertificationListed={async (id, listed) => {
        const row = catalog.find((c) => String(c.id) === String(id));
        await updateCertification(id, { name: row?.name || "", listed });
        await reload();
      }}
      onDeleteCertificationFromCatalog={async (id) => {
        await deleteCertification(id);
        await reload();
      }}
      onImportComplete={reload}
    />
  );
}
