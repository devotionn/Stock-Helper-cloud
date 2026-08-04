import { supabase } from '@/lib/supabase'
import type { Combination, CombinationRow } from '@/types'

function mapRow(row: CombinationRow): Combination {
  return {
    id: row.id,
    name: row.name,
    module_ids: row.module_ids,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function listCombinations(): Promise<Combination[]> {
  const { data, error } = await supabase
    .from('combinations')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []).map((r) => mapRow(r as unknown as CombinationRow))
}

export async function createCombination(name: string, moduleIds: number[]): Promise<Combination> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { data, error } = await supabase
    .from('combinations')
    .insert({ user_id: user.id, name, module_ids: moduleIds })
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data as unknown as CombinationRow)
}

export async function updateCombination(
  id: string,
  name: string,
  moduleIds: number[],
): Promise<Combination> {
  const { data, error } = await supabase
    .from('combinations')
    .update({ name, module_ids: moduleIds })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error
  return mapRow(data as unknown as CombinationRow)
}

export async function deleteCombination(id: string): Promise<void> {
  const { error } = await supabase.from('combinations').delete().eq('id', id)
  if (error) throw error
}
