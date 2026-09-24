/**
 * Prisma DMMF 取得：Node（library engine）有 Prisma.dmmf；Cloudflare Workers（wasm client）沒有，退回建置期落地的 dmmf.json。
 */
import dmmfJson from './dmmf.json';

export interface DmmfField { name: string; kind: string; type: string; isList: boolean; isRequired: boolean; isId: boolean; isUnique: boolean; relationName: string | null; relationFromFields: string[]; relationToFields: string[]; hasDefaultValue: boolean; isUpdatedAt: boolean }
export interface DmmfModel { name: string; dbName: string | null; fields: DmmfField[]; primaryKey: unknown; uniqueFields: string[][] }
export interface DmmfLike { datamodel: { models: DmmfModel[] } }

/** 全部模型的 DateTime 欄位名（D1 adapter 型別修正用） */
export const DATETIME_FIELDS: ReadonlySet<string> = new Set<string>((dmmfJson as { dateTimeFields: string[] }).dateTimeFields);

export function getDmmf(): DmmfLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Prisma } = require('@prisma/client') as { Prisma?: { dmmf?: DmmfLike } };
    if (Prisma?.dmmf?.datamodel?.models?.length) return Prisma.dmmf;
  } catch {
    /* edge：沒有 dmmf */
  }
  return dmmfJson as unknown as DmmfLike;
}
