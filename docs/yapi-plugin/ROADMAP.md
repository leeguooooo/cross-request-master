# YApi CLI / Plugin 改进需求单

本文档整理 YApi CLI（`packages/yapi-mcp`）与 Skill / Plugin 的改进需求。
来源是实际使用中 agent 与人类提的反馈，每条经过一次复查。

## 已有能力（提案时避免重复提）

- ✅ `yapi interface list-menu --path <substring> --method <METHOD>`（v0.4.2 起，CLI 内客户端过滤）
- ✅ `yapi docs-sync --dry-run`（预览 per-file payload + 最大 Mermaid 块）
- ✅ `yapi docs-sync bind {list|get|add|update|remove}`（`bind show` 不存在，见 P0.4）
- ✅ 413 错误自动重试（先 `--mermaid-classic`，再 `--no-mermaid` 降级，并记忆到 mapping）
- ✅ 目录迁移时 `docs-sync` 会用仓库根做 "auto-recovers old relative dir"（已覆盖单测）
- ✅ 浏览器登录（`yapi login --browser`）与全局 Cookie 缓存

---

## P0 — 血泪直击，下次还会撞

### P0.1 docs-sync 不维护接口顺序（index）

**现状**：`docs-sync` 同步后所有接口 `index=0`，YApi UI 只能按 `_id` 或创建时间排，没法按"首次加入 git 的时间"或"文件名"排。agent 想排序只能绕过 CLI 直调 `/api/interface/up_index`。

**建议**：

```bash
yapi docs-sync --binding projectA --order-by git-added
yapi docs-sync --binding projectA --order-by filename
yapi docs-sync --binding projectA --order-by front-matter-date
```

binding 里增加 `order_strategy` 字段，sync 时额外调一次 `/api/interface/up_index` 按策略下发 index。

**复杂度**：M（需要多一次 API + 策略解析；git-added 策略需要 `git log --diff-filter=A --reverse -- <file>`）。

---

### P0.2 docs-sync 没有标题模板，只会吃第一个 `# heading`

**现状**：title 固定从 md 第一个 heading 取。想加 `[YYYY-MM-DD] 前缀` 只能在 YApi UI 手改，下次 sync 会被覆盖。

**建议**：

```bash
yapi docs-sync --binding projectA \
  --title-template '[{git_added_date}] {md_title}'
```

或在 md front-matter 支持 `yapi_title:` 覆盖，或在 binding 里存 `title_template`。

占位符至少：`{md_title}`、`{git_added_date}`、`{git_updated_date}`、`{filename}`、`{index}`。

**复杂度**：S-M（title 生成函数已经在 `docs-sync.ts` 里，抽成 template 即可；git 日期需要子进程调 `git log`）。

---

### P0.3 binding 路径是绝对/仓库内相对死路径，仓库换位置就挂

**现状**：`bind add --dir docs/yapi/abc` 存的是"仓库根到目录"的相对路径。如果整个仓库从 `~/work/ai-girls/` 挪到 `~/work/foo/ai-girls-project/ai-girls/`，binding 报 `dir not found` 但不提示具体怎么修。

**注意**：已经有单测 `docs-sync binding run auto-recovers old relative dir against current repo` 覆盖了"相对路径 → 当前 git root 解析"，所以这条的严重程度**没有 agent 描述得那么重**。真正的 gap 是 **binding 被 `$HOME/.yapi/docs-sync.json` 这类全局 home 存储时，agent 看不到绝对路径但缺失提示**。

**建议**（小修）：

- 报错时直接给修复命令：
  `hint: yapi docs-sync bind update --name <name> --dir <current-relative-path>`
- `bind update --auto-repair`：遍历当前 git root，按 binding 里记录的 `files.*` 文件名反查唯一匹配目录，自动 fix。

**复杂度**：S（只是错误信息优化 + 一个 scan helper）。

---

### P0.4 `bind` 子命令没有 `--help`、没有 `show`

**现状**：

- `yapi docs-sync bind --help` 只印 docs-sync 主命令的 help，不列 bind 子动作（add/list/get/update/remove）
- `bind show` 返回 `unknown docs-sync bind action: show`（其实应该是 `bind get --name X`，但 `show` 是更直觉的词）

**建议**：

- `bind get` 继续存在，同时接受 `show` 作为别名
- `bind get --name X` 的输出结构化：除 dir/project_id/catid 外，加 `files` 映射、每个文件的 `hash`、`last_synced_at`、`doc_id`
- 在 yargs 层给 `docs-sync bind` 单独挂一个 help command（或直接改 describe 字段列全子命令）

**复杂度**：S。**这条是全部里最便宜的**，可以直接啃。

---

## P1 — 会很快再踩的设计缺陷

### P1.1 文件重命名会产生孤儿 doc

**问题**：本地 `foo.md` 改名成 `2026-04-07-foo.md`，sync 会新建 doc（新 `_id`），旧 doc 留在 YApi 变成孤儿，得手动删。

**建议**：binding 的 `files.*` 已经有 `hash`，sync 时检测"本地多了一个文件，但它的 content hash 等于某个旧 binding 里的 hash"就判 rename，保留旧 `doc_id` 只改 `path/title`。

**复杂度**：M（需要加 hash-to-docid 反查 + rename 路径）。

---

### P1.2 YApi 侧手动编辑会被下次 sync 默默覆盖

**问题**：运营在 YApi UI 里改了标题/描述，下一次 `docs-sync` 无感知直接覆盖。

**建议**：sync 前先 `interface/get` 拿远端 `up_time`，与 binding 里记录的 `last_synced_at` 比较。如果远端更新 → 标记冲突并停下来，要求 `--force` 或 `--overwrite-remote` 才覆盖；`--stash-remote` 选项可以把远端内容拉回本地做三方合并。

**复杂度**：M-L（三方合并是 full feature，但 conflict detection + force 是 S）。

---

### P1.3 子目录 → 子分类不支持

**问题**：`docs/yapi/*.md` 全部平铺到一个 `catid`，不能按 `docs/yapi/ability/*.md` / `docs/yapi/ops/*.md` 映射到父 cat 下的子 cat。

**建议**：binding 支持 `--nested`（或 `--structure subdir-as-cat`），sync 时自动建立/维护父 cat 下的子分类。

**复杂度**：L（涉及 cat 的增删改，跟 P0.1 的 up_index 策略耦合）。

---

### P1.4 md 内部链接不重写

**问题**：`[架构](./architecture.md)` 在 YApi 里是死链（`./architecture.md` 不是 YApi URL）。

**建议**：sync 后拿到所有 `md_file → doc_id` 映射，在 render markdown 时把 `./xxx.md` 重写成 `/project/<pid>/interface/api/<doc_id>`。需要在 render 前先收集全量映射。

**复杂度**：M（两遍扫：先收映射，再 render）。

---

## P2 — 长期体验

### P2.1 post-sync hook / 插件机制

agent 手写的"加日期前缀"脚本本质是 sync 流程里缺少的一个扩展点。如果有：

```js
// .yapi/hooks/after-render.mjs
export default function ({ title, markdown, doc_id, path }) {
  return { title: `[${today()}] ${title}`, markdown };
}
```

就不用每个人自己维护旁挂脚本。

**复杂度**：L（要考虑 sandboxing、失败隔离、版本钉死）。

---

### P2.2 `yapi docs-sync --watch`

草稿期改文件自动 sync，舒服。受 `--dry-run` 保护可以 `--watch --dry-run` 组合。

**复杂度**：S-M（`chokidar` + 已有的 sync 流程）。

---

### P2.3 反向同步 `yapi docs-sync pull`

从 YApi 拉回本地 md，处理"运营在 UI 里改了"的场景。与 P1.2 的冲突检测形成闭环。

**复杂度**：L。

---

### P2.4 密码明文存 `~/.yapi/config.toml`

**现状**：`password = "123456"` 直接落盘。

**建议**：macOS keychain / Linux secret service / Windows credential manager。config 里只存 `{source: "keychain", id: "yapi-your-domain"}`。Fallback 回明文（ENV `YAPI_ALLOW_PLAINTEXT_PASSWORD=1`）。

**注意**：这一条要看用户群体里多少人真用 `auth-mode=global + 密码`；浏览器 cookie 登录（`yapi login --browser`）已经不需要落盘密码，推荐大家走那条路可能比加 keychain 支持更划算。

**复杂度**：M-L（跨平台 secret store）。

---

### P2.5 `skill update available` 每次命令第一行都印

**现状**：每次 `yapi` 命令 stderr/stdout 第一行都有 skill update 提醒，脚本解析麻烦。

**建议**：

- `config.toml` 新增 `skill_update_reminder = never | daily | always`，默认 `daily`（一天最多提醒一次）
- 或者只有在 CLI 版本差距 ≥ minor 时才提醒，patch 差距不提醒
- 环境变量 `YAPI_NO_SKILL_UPDATE_CHECK=1` 已经能关，但得文档化

**复杂度**：S。

---

## 判断不做 / 待商榷

### ❌ 把 `bind` 存储改成"按 git remote URL + git_root 内相对路径"

agent 提的方案，但会引入新的复杂度：

- 多 remote、fork 场景怎么处理？
- checkout 没 origin 的工作副本（`git init` 直接起步）怎么办？
- 现有 `.yapi/docs-sync.json` 的向后兼容

当前 P0.3 的"错误信息给修复命令 + `--auto-repair`"已经能解决 95% 的场景，再做"按 remote URL 索引"不划算。

---

## 下一步可快速啃掉的（≤ 半天）

按复杂度排序，想即刻动手可以挑：

1. **P0.4 `bind` 的 `show` 别名 + 结构化输出**
2. **P2.5 skill update 提醒频率可配**
3. **P0.3 报错给修复命令**（不做 `--auto-repair`，只改文案）
4. **P2.2 `--watch` 模式**（基于现有 sync）

上述 4 项合起来一个 PR 就能搞定，作为 v0.5.0 的小更新合理。

---

## 引用 / 背景

- v0.4.2 CHANGELOG：`feat(yapi-mcp): 给 interface list-menu 加 --path/--method 过滤`
- 相关 SKILL.md 章节：`Find interface by HTTP path`（教 agent 不要 pipe 到 python、不要暴力枚举）
- Agent 原始提案见对应 issue / 聊天记录
