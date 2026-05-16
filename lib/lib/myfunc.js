import "../config.js";
import t from '../lib/datetime.js';
var createQr;
if (global.paymentgateway.midtrans) {
  createQr = (await import("./midtrans.js")).createQr;
} else if (global.paymentgateway.pakasir) {
  createQr = (await import("./pakasir.js")).createQr;
} else if (global.paymentgateway.cashify) {
  createQr = (await import("./cashify.js")).createQr;
} else if (global.paymentgateway.binancepay) {
  createQr = (await import("./binancepay.js")).createQr;
} else {
  createQr = null;
}

export async function createDeposit(bot, from, nominal, ref_id, creditAmount = nominal) {
let { tanggal, jam } = await t();
  try {
    if (!createQr) {
      return bot.sendMessage(from, esc("Payment gateway belum dikonfigurasi."), {
        parse_mode: "MarkdownV2",
      });
    }

    const payableAmount = Number(nominal);
    const balanceAmount = Number(creditAmount);

    if (!Number.isFinite(payableAmount) || payableAmount < 1000 || !Number.isInteger(payableAmount)) {
      return bot.sendMessage(from, esc("Nominal top-up tidak valid."), {
        parse_mode: "MarkdownV2",
      });
    }

    if (!Number.isFinite(balanceAmount) || balanceAmount < 1000 || !Number.isInteger(balanceAmount)) {
      return bot.sendMessage(from, esc("Nominal saldo tidak valid."), {
        parse_mode: "MarkdownV2",
      });
    }

    const loadingMsg = await bot.sendMessage(from, esc("_Sedang membuat QRIS top-up, mohon tunggu..._"), {
      parse_mode: "MarkdownV2",
    });

    let qrisImage = await withTimeout(createQr(payableAmount, ref_id), 30000);
    await safeDeleteMessage(bot, from, loadingMsg?.message_id);

    if (!qrisImage)
      return bot.sendMessage(from, esc(global.mess.error), {
        parse_mode: "MarkdownV2",
      });
    let caption = `*TOP-UP SALDO QRIS ✅*
╭ - - - - - - - - - - - - - - - - - - - - - ╮
┊ *Jenis:* Top-Up Saldo
┊ *Saldo Masuk:* ${rupiah(balanceAmount)}
┊ *Total Bayar:* ${rupiah(payableAmount)}
┊ *Waktu:* ${tanggal} ${jam}
┊ *ID Transaksi:*
┊ \`${ref_id}\`
╰ - - - - - - - - - - - - - - - - - - - - - ╯

Silakan scan *QRIS* dan bayar sesuai *Total Bayar* agar sistem bisa mendeteksi pembayaran otomatis.`;
    const sentPayment = await bot.sendPhoto(from, qrisImage, {
      caption: esc(caption),
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ Sudah Bayar",
              callback_data: `cekdeposit ${payableAmount} ${ref_id} ${balanceAmount}`,
              style: "success",
            },
          ],
          [
            {
              text: "❌ Batalkan Top-Up",
              callback_data: `canceldeposit`,
              style: "danger",
            },
          ],
        ],
      },
    });

    if (!global.depositPaymentContext) global.depositPaymentContext = new Map();
    global.depositPaymentContext.set(from, {
      chatId: from,
      messageId: sentPayment?.message_id,
      refId: ref_id,
      payableAmount,
      balanceAmount,
    });
  } catch (e) {
    console.error("Error in createDeposit:", e);
    await bot.sendMessage(from, esc(global.mess.error), { parse_mode: "MarkdownV2" }).catch(() => {});
  }
}

export async function safeDeleteMessage(bot, chatId, messageId, options = {}) {
  const { logUnexpected = true } = options;
  if (!bot || !chatId || !messageId) return false;

  try {
    await bot.deleteMessage(chatId, messageId);
    return true;
  } catch (err) {
    const message = String(
      err?.message ||
      err?.response?.body?.description ||
      err?.response?.data?.description ||
      err?.response?.description ||
      err ||
      ""
    ).toLowerCase();

    const isIgnorable =
      message.includes("message to delete not found") ||
      message.includes("message can't be deleted") ||
      message.includes("message identifier is not specified") ||
      message.includes("message_id_invalid") ||
      message.includes("message is not found") ||
      message.includes("message not found");

    if (!isIgnorable && logUnexpected) {
      console.warn("Could not delete message:", err?.message || err);
    }

    return false;
  }
}

export function rupiah(data) {
  return (
    "Rp. " +
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
    }).format(parseInt(data))
  );
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}
