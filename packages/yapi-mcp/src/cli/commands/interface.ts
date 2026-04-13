import type { Options } from "../types";
import { resolveLimit } from "../utils";
import { runSimpleRequest } from "../simple-request";

export async function runInterface(action: string, subAction: string, options: Options, subOptions: Options): Promise<number> {
  if (action === "list") {
    return await runSimpleRequest(
      options,
      "/api/interface/list",
      true,
      (opts) => {
        const projectId = String(opts.projectId || "").trim();
        if (!projectId) {
          console.error("missing --project-id for interface list");
          return { ok: false };
        }
        const page = Number.isFinite(opts.page ?? NaN) ? String(opts.page) : "1";
        const limit = resolveLimit(opts.limit, "20");
        return {
          ok: true,
          queryItems: [
            ["project_id", projectId],
            ["page", page],
            ["limit", limit],
          ],
        };
      },
    );
  }
  if (action === "list-menu" || action === "menu" || action === "list_menu") {
    return await runSimpleRequest(
      options,
      "/api/interface/list_menu",
      true,
      (opts) => {
        const projectId = String(opts.projectId || "").trim();
        if (!projectId) {
          console.error("missing --project-id for interface list-menu");
          return { ok: false };
        }
        return { ok: true, queryItems: [["project_id", projectId]] };
      },
      (payload, opts) => {
        const pathFilter = String(opts.path || "").trim().toLowerCase();
        const methodFilter = String(opts.method || "").trim().toUpperCase();
        if (!pathFilter && !methodFilter) return payload;

        if (!payload || typeof payload !== "object") return payload;
        const record = payload as Record<string, any>;
        const cats = record.data;
        if (!Array.isArray(cats)) return payload;

        const matches: Array<Record<string, unknown>> = [];
        for (const cat of cats) {
          const list = Array.isArray(cat?.list) ? cat.list : [];
          for (const item of list) {
            const itemPath = String(item?.path || "").toLowerCase();
            const itemMethod = String(item?.method || "").toUpperCase();
            if (pathFilter && !itemPath.includes(pathFilter)) continue;
            if (methodFilter && itemMethod !== methodFilter) continue;
            matches.push({
              project_id: item?.project_id,
              catid: item?.catid,
              cat_name: cat?.name,
              _id: item?._id,
              title: item?.title,
              path: item?.path,
              method: item?.method,
            });
          }
        }
        return {
          errcode: record.errcode ?? 0,
          errmsg: record.errmsg ?? "ok",
          data: { matches, total: matches.length },
        };
      },
    );
  }
  if (action === "get") {
    return await runSimpleRequest(
      options,
      "/api/interface/get",
      true,
      (opts) => {
        const id = String(opts.id || "").trim();
        if (!id) {
          console.error("missing --id for interface get");
          return { ok: false };
        }
        return { ok: true, queryItems: [["id", id]] };
      },
    );
  }
  if (action === "cat" || action === "category") {
    if (subAction === "add") {
      return await runSimpleRequest(
        subOptions,
        "/api/interface/add_cat",
        true,
        (opts) => {
          const projectId = String(opts.projectId || "").trim();
          const name = String(opts.name || "").trim();
          if (!projectId || !name) {
            console.error("missing --project-id/--name for interface cat add");
            return { ok: false };
          }
          const payload: Record<string, unknown> = {
            project_id: projectId,
            name,
          };
          if (opts.desc !== undefined) {
            payload.desc = opts.desc;
          }
          return { ok: true, method: "POST", data: payload };
        },
      );
    }
    if (subAction === "update" || subAction === "up") {
      return await runSimpleRequest(
        subOptions,
        "/api/interface/up_cat",
        true,
        (opts) => {
          const catId = String(opts.catId || "").trim();
          const name = String(opts.name || "").trim();
          if (!catId || !name) {
            console.error("missing --cat-id/--name for interface cat update");
            return { ok: false };
          }
          const payload: Record<string, unknown> = {
            catid: catId,
            name,
          };
          if (opts.desc !== undefined) {
            payload.desc = opts.desc;
          }
          return { ok: true, method: "POST", data: payload };
        },
      );
    }
    if (subAction === "delete" || subAction === "del" || subAction === "remove") {
      return await runSimpleRequest(
        subOptions,
        "/api/interface/del_cat",
        true,
        (opts) => {
          const catId = String(opts.catId || "").trim();
          if (!catId) {
            console.error("missing --cat-id for interface cat delete");
            return { ok: false };
          }
          return { ok: true, method: "POST", data: { catid: catId } };
        },
      );
    }

    console.error(`unknown interface cat action: ${subAction || "(missing)"}`);
    return 2;
  }

  console.error(`unknown interface action: ${action || "(missing)"}`);
  return 2;
}
