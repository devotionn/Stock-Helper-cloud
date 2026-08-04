-- ============================================================================
-- Stock Helper Cloud - 安全加固
-- 1. 阻止普通用户把 profiles.role 提升为 admin
-- 2. entry_assets 关联时同时校验模块和图片归属
-- 3. Storage 更新后仍必须位于用户自己的目录
-- ============================================================================

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
set search_path = public, auth
as $$
declare
    jwt_role text := coalesce(auth.jwt()->>'role', '');
begin
    if new.role is distinct from old.role
       and jwt_role <> 'service_role'
       and current_user not in ('postgres', 'supabase_admin', 'service_role') then
        raise exception '不允许修改用户角色';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_profiles_protect_role on public.profiles;
create trigger trg_profiles_protect_role
    before update of role on public.profiles
    for each row execute function public.protect_profile_role();

-- 用户只能把自己的图片关联到自己的模块，避免仅凭 UUID 产生跨用户关联。
drop policy if exists "用户管理自己模块的图片关联" on public.entry_assets;
create policy "用户管理自己模块的图片关联" on public.entry_assets
    for all
    using (
        exists (
            select 1
            from public.module_entries
            where module_entries.id = entry_assets.module_entry_id
              and module_entries.user_id = auth.uid()
        )
        and exists (
            select 1
            from public.assets
            where assets.id = entry_assets.asset_id
              and assets.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1
            from public.module_entries
            where module_entries.id = entry_assets.module_entry_id
              and module_entries.user_id = auth.uid()
        )
        and exists (
            select 1
            from public.assets
            where assets.id = entry_assets.asset_id
              and assets.user_id = auth.uid()
        )
    );

-- 更新 Storage 对象时，新路径也必须保持在当前用户目录下。
drop policy if exists "用户更新自己的图片" on storage.objects;
create policy "用户更新自己的图片" on storage.objects
    for update
    using (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'stock-helper-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
