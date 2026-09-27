import { zidCatalogVisibleSql } from './zid-catalog-scope';
import { sallaCatalogVisibleSql } from './salla-catalog-scope';
export function catalogVisibleSql(alias='products') {
  return `(${zidCatalogVisibleSql(alias)} AND ${sallaCatalogVisibleSql(alias)})`;
}
