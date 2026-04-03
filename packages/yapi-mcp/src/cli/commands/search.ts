import type { Options } from "../types";
import { runSimpleRequest } from "../simple-request";

export async function runSearch(options: Options): Promise<number> {
  return await runSimpleRequest(
    options,
    "/api/project/search",
    true,
    (opts) => {
      const keyword = String(opts.q || "").trim();
      if (!keyword) {
        console.error("missing --q for search");
        return { ok: false };
      }
      return { ok: true, queryItems: [["q", keyword]] };
    },
    (payload, opts) => {
      const filterProjectId = String(opts.projectId || "").trim();
      if (!filterProjectId) return payload;
      if (!payload || typeof payload !== "object") return payload;
      const record = payload as Record<string, any>;
      const data = record.data;
      if (!data || typeof data !== "object") return payload;

      const nextData: Record<string, unknown> = { ...data };
      if (Array.isArray(data.interface)) {
        nextData.interface = data.interface.filter((item: any) => {
          const projectId = item?.projectId ?? item?.project_id ?? item?.projectID ?? "";
          return String(projectId) === filterProjectId;
        });
      }
      if (Array.isArray(data.project)) {
        nextData.project = data.project.filter((item: any) => {
          const projectId = item?._id ?? item?.id ?? item?.project_id ?? item?.projectId ?? "";
          return String(projectId) === filterProjectId;
        });
      }
      return { ...record, data: nextData };
    },
  );
}
