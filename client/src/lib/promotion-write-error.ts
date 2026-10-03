export function promotionWriteError(error:unknown,t:(key:string)=>string){
 const message=(error as any)?.message;
 switch(message){
  case 'promotion_write:code_scope':return t('merchantUx.promotionWrites.code_scope');
  case 'promotion_write:code_start':return t('merchantUx.promotionWrites.code_start');
  case 'promotion_write:code_quantity':return t('merchantUx.promotionWrites.code_quantity');
  case 'promotion_write:code_expired':return t('merchantUx.promotionWrites.code_expired');
  case 'promotion_write:invalid':return t('merchantUx.promotionWrites.invalid');
  case 'promotion_write:limit':return t('merchantUx.promotionWrites.limit');
  case 'promotion_write:forbidden':return t('merchantUx.promotionWrites.forbidden');
  case 'promotion_write:missing':return t('merchantUx.promotionWrites.missing');
  case 'promotion_write:unknown':return t('merchantUx.promotionWrites.unknown');
  default:return t('merchantUx.promotionWrites.unavailable');
 }
}
