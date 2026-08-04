-- ============================================================================
-- Stock Helper Cloud - 初始数据库迁移
-- 包含全部业务表结构、索引、RLS 策略和触发器
-- 业务模型从老版本 SQLite 迁移，适配 PostgreSQL + Supabase Auth + RLS
-- ============================================================================

-- 扩展
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. profiles - 用户资料（扩展 auth.users）
-- ============================================================================
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '',
    role text not null default 'user' check (role in ('user', 'admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 新用户注册时自动创建 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. module_entries - 投研日期工作区核心表（12模块 × 日期）
-- ============================================================================
create table if not exists public.module_entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    module_id smallint not null check (module_id >= 0 and module_id <= 11),
    record_date date not null,

    display_title text not null default '',
    text_content text not null default '',

    status text not null default 'draft',
    revision integer not null default 1,

    period_start date,
    period_end date,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    unique (user_id, record_date, module_id)
);

-- ============================================================================
-- 3. assets - 图片资产（去重，按 sha256）
-- ============================================================================
create table if not exists public.assets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    sha256 text not null,
    original_filename text,
    storage_path text not null,
    ai_storage_path text,
    thumbnail_path text,
    file_size integer not null,
    width integer,
    height integer,
    mime_type text,
    format text,
    is_orphan boolean not null default false,
    orphan_since timestamptz,
    created_at timestamptz not null default now(),

    unique (user_id, sha256)
);

-- ============================================================================
-- 4. entry_assets - 模块条目与图片的关联
-- ============================================================================
create table if not exists public.entry_assets (
    id uuid primary key default gen_random_uuid(),
    module_entry_id uuid not null references public.module_entries(id) on delete cascade,
    asset_id uuid not null references public.assets(id) on delete cascade,
    order_index integer not null default 0,
    caption text not null default '',

    unique (module_entry_id, asset_id)
);

-- ============================================================================
-- 5. combinations - 常用组合
-- ============================================================================
create table if not exists public.combinations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    module_ids jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 6. analyses - 分析记录
-- ============================================================================
create table if not exists public.analyses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    combination jsonb not null default '[]'::jsonb,
    combination_name text not null default '',
    analysis_request text not null default '',
    record_date date,
    status text not null default 'pending'
        check (status in ('pending', 'running', 'completed', 'completed_with_warning', 'failed', 'interrupted')),
    result_json text,
    raw_result text,
    error_message text,
    provider text,
    model text,
    token_usage jsonb,
    saved_to_review boolean not null default false,
    saved_to_advice boolean not null default false,
    review_content text not null default '',
    created_at timestamptz not null default now(),
    started_at timestamptz,
    completed_at timestamptz
);

-- ============================================================================
-- 7. analysis_snapshots - 分析输入快照（不可变）
-- ============================================================================
create table if not exists public.analysis_snapshots (
    id uuid primary key default gen_random_uuid(),
    analysis_id uuid not null references public.analyses(id) on delete cascade,
    module_id smallint not null,
    order_index integer not null,
    module_name text not null,
    display_title text not null default '',
    text_content text not null default ''
);

-- ============================================================================
-- 8. analysis_assets - 分析快照中的图片引用（不可变）
-- ============================================================================
create table if not exists public.analysis_assets (
    id uuid primary key default gen_random_uuid(),
    analysis_id uuid not null references public.analyses(id) on delete cascade,
    module_id smallint not null,
    order_index integer not null,
    image_order_index integer not null default 0,
    asset_id uuid,
    storage_path text not null,
    thumbnail_path text
);

-- ============================================================================
-- 9. analysis_notes - 分析备注
-- ============================================================================
create table if not exists public.analysis_notes (
    id uuid primary key default gen_random_uuid(),
    analysis_id uuid not null references public.analyses(id) on delete cascade,
    note text not null default '',
    created_at timestamptz not null default now()
);

-- ============================================================================
-- 10. user_settings - 用户设置
-- ============================================================================
create table if not exists public.user_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    font_size text not null default '18',
    updated_at timestamptz not null default now()
);

-- ============================================================================
-- 11. audit_logs - 审计日志
-- ============================================================================
create table if not exists public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    action text not null,
    resource_type text not null,
    resource_id text,
    detail jsonb,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- 索引
-- ============================================================================
create index if not exists idx_module_entries_user_date
    on public.module_entries(user_id, record_date, module_id);
create index if not exists idx_module_entries_user_module
    on public.module_entries(user_id, module_id);
create index if not exists idx_entry_assets_entry
    on public.entry_assets(module_entry_id, order_index);
create index if not exists idx_entry_assets_asset
    on public.entry_assets(asset_id);
create index if not exists idx_assets_user
    on public.assets(user_id);
create index if not exists idx_assets_orphan
    on public.assets(user_id, is_orphan) where is_orphan = true;
create index if not exists idx_combinations_user
    on public.combinations(user_id, updated_at desc);
create index if not exists idx_analyses_user_status
    on public.analyses(user_id, status);
create index if not exists idx_analyses_user_date
    on public.analyses(user_id, record_date);
create index if not exists idx_analyses_user_created
    on public.analyses(user_id, created_at desc);
create index if not exists idx_analysis_snapshots_analysis
    on public.analysis_snapshots(analysis_id, order_index);
create index if not exists idx_analysis_assets_analysis
    on public.analysis_assets(analysis_id, module_id, image_order_index);
create index if not exists idx_analysis_notes_analysis
    on public.analysis_notes(analysis_id, created_at desc);
create index if not exists idx_audit_logs_user
    on public.audit_logs(user_id, created_at desc);

-- ============================================================================
-- updated_at 自动更新触发器
-- ============================================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger trg_module_entries_updated
    before update on public.module_entries
    for each row execute function public.update_updated_at();

create trigger trg_combinations_updated
    before update on public.combinations
    for each row execute function public.update_updated_at();

create trigger trg_user_settings_updated
    before update on public.user_settings
    for each row execute function public.update_updated_at();

create trigger trg_profiles_updated
    before update on public.profiles
    for each row execute function public.update_updated_at();

-- ============================================================================
-- RLS - 行级安全策略
-- 所有用户数据表启用 RLS，用户只能访问自己的数据
-- ============================================================================

-- profiles
alter table public.profiles enable row level security;
create policy "用户读取自己的资料" on public.profiles
    for select using (auth.uid() = id);
create policy "用户修改自己的资料" on public.profiles
    for update using (auth.uid() = id) with check (auth.uid() = id);

-- module_entries
alter table public.module_entries enable row level security;
create policy "用户读取自己的模块" on public.module_entries
    for select using (auth.uid() = user_id);
create policy "用户创建自己的模块" on public.module_entries
    for insert with check (auth.uid() = user_id);
create policy "用户修改自己的模块" on public.module_entries
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "用户删除自己的模块" on public.module_entries
    for delete using (auth.uid() = user_id);

-- assets
alter table public.assets enable row level security;
create policy "用户读取自己的图片" on public.assets
    for select using (auth.uid() = user_id);
create policy "用户创建自己的图片" on public.assets
    for insert with check (auth.uid() = user_id);
create policy "用户修改自己的图片" on public.assets
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "用户删除自己的图片" on public.assets
    for delete using (auth.uid() = user_id);

-- entry_assets（通过 module_entries 的 user_id 间接隔离）
alter table public.entry_assets enable row level security;
create policy "用户读取自己模块的图片关联" on public.entry_assets
    for select using (
        exists (select 1 from public.module_entries
                where id = entry_assets.module_entry_id
                and user_id = auth.uid())
    );
create policy "用户管理自己模块的图片关联" on public.entry_assets
    for all using (
        exists (select 1 from public.module_entries
                where id = entry_assets.module_entry_id
                and user_id = auth.uid())
    ) with check (
        exists (select 1 from public.module_entries
                where id = entry_assets.module_entry_id
                and user_id = auth.uid())
    );

-- combinations
alter table public.combinations enable row level security;
create policy "用户读取自己的组合" on public.combinations
    for select using (auth.uid() = user_id);
create policy "用户创建自己的组合" on public.combinations
    for insert with check (auth.uid() = user_id);
create policy "用户修改自己的组合" on public.combinations
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "用户删除自己的组合" on public.combinations
    for delete using (auth.uid() = user_id);

-- analyses
alter table public.analyses enable row level security;
create policy "用户读取自己的分析" on public.analyses
    for select using (auth.uid() = user_id);
create policy "用户创建自己的分析" on public.analyses
    for insert with check (auth.uid() = user_id);
create policy "用户修改自己的分析" on public.analyses
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "用户删除自己的分析" on public.analyses
    for delete using (auth.uid() = user_id);

-- analysis_snapshots（通过 analyses 的 user_id 间接隔离）
alter table public.analysis_snapshots enable row level security;
create policy "用户读取自己的分析快照" on public.analysis_snapshots
    for select using (
        exists (select 1 from public.analyses
                where id = analysis_snapshots.analysis_id
                and user_id = auth.uid())
    );
create policy "用户创建自己的分析快照" on public.analysis_snapshots
    for insert with check (
        exists (select 1 from public.analyses
                where id = analysis_snapshots.analysis_id
                and user_id = auth.uid())
    );

-- analysis_assets（通过 analyses 的 user_id 间接隔离）
alter table public.analysis_assets enable row level security;
create policy "用户读取自己的分析图片" on public.analysis_assets
    for select using (
        exists (select 1 from public.analyses
                where id = analysis_assets.analysis_id
                and user_id = auth.uid())
    );
create policy "用户创建自己的分析图片" on public.analysis_assets
    for insert with check (
        exists (select 1 from public.analyses
                where id = analysis_assets.analysis_id
                and user_id = auth.uid())
    );

-- analysis_notes（通过 analyses 的 user_id 间接隔离）
alter table public.analysis_notes enable row level security;
create policy "用户读取自己的分析备注" on public.analysis_notes
    for select using (
        exists (select 1 from public.analyses
                where id = analysis_notes.analysis_id
                and user_id = auth.uid())
    );
create policy "用户管理自己的分析备注" on public.analysis_notes
    for all using (
        exists (select 1 from public.analyses
                where id = analysis_notes.analysis_id
                and user_id = auth.uid())
    ) with check (
        exists (select 1 from public.analyses
                where id = analysis_notes.analysis_id
                and user_id = auth.uid())
    );

-- user_settings
alter table public.user_settings enable row level security;
create policy "用户读取自己的设置" on public.user_settings
    for select using (auth.uid() = user_id);
create policy "用户修改自己的设置" on public.user_settings
    for insert with check (auth.uid() = user_id);
create policy "用户更新自己的设置" on public.user_settings
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- audit_logs
alter table public.audit_logs enable row level security;
create policy "用户读取自己的审计日志" on public.audit_logs
    for select using (auth.uid() = user_id);

-- ============================================================================
-- Storage Bucket 策略
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('stock-helper-assets', 'stock-helper-assets', false)
on conflict (id) do nothing;

-- Storage 对象策略：用户只能管理自己目录下的文件
-- 路径格式：{user_id}/{record_date}/{module_id}/{uuid}.webp
create policy "用户上传自己的图片" on storage.objects
    for insert with check (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "用户读取自己的图片" on storage.objects
    for select using (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "用户删除自己的图片" on storage.objects
    for delete using (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

create policy "用户更新自己的图片" on storage.objects
    for update using (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
