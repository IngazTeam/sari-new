import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";

/** Store an account-inbox notification only while its current owner is authorized.
 * This does not send email, WhatsApp or push notifications. */
export async function writeUsageAlert(
  ownerId: number,
  merchantId: number,
  notice: {
    type: "warning" | "error";
    title: string;
    message: string;
    link: string;
  }
) {
  return withMerchantOwnerSettings(ownerId, merchantId, true, async tx => {
    const [ack] = await tx.execute<any>(
      `INSERT INTO notifications (userId,type,title,message,link)
      SELECT userId,?,?,?,? FROM merchants WHERE id=? AND userId=?`,
      [
        notice.type,
        notice.title,
        notice.message,
        notice.link,
        merchantId,
        ownerId,
      ]
    );
    if (
      ack?.affectedRows !== 1 ||
      !Number.isSafeInteger(ack?.insertId) ||
      ack.insertId < 1 ||
      ack.insertId > 2147483647
    )
      throw Error("usage_alerts:unconfirmed");
    return ack.insertId as number;
  });
}
