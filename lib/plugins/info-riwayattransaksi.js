import { getUserTransactionHistory } from "../lib/database.js";

const ITEMS_PER_PAGE = 5;

export default async function ({ bot, chat_id, body, from }) {
  if (body.slice(3).toLowerCase() === "riwayat transaksi") {
    let dataTrx = await getUserTransactionHistory(from, ITEMS_PER_PAGE, 0);
    if (!dataTrx.success) {
      bot.sendMessage(chat_id, `Terjadi kesalahan saat mengambil data ❗️`);
      (await import('../lib/logger.js')).logger.error(`Error getUserTransactionHistory: ${dataTrx.error}`);
      return;
    } else if (dataTrx.total === 0) {
      bot.sendMessage(chat_id, `Kamu belum memiliki riwayat transaksi.`);
      return;
    }

    const transactions = dataTrx.data;
    const totalItems = dataTrx.total;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const page = 1;

    let caption = `*🔖 RIWAYAT TRANSAKSI*

*- Total Transaksi :* ${totalItems} transaksi\n\n`;

    let num = 1;
    for (let item of transactions) {
      caption += `*${num++}. ${item.productName}*\n`;
      caption += `➜ ID Transaksi : \`${item.reffId}\`\n`;
      caption += `➜ Harga : ${rupiah(item.price)}\n`;
      caption += `➜ Jumlah : ${item.quantity} pcs\n`;
      caption += `➜ Total : ${rupiah(item.totalAmount)}\n`;
      caption += `➜ Tanggal : ${new Date(item.createdAt).toLocaleString("id-ID")}\n\n`;
    }

    caption += `Ketik *_/cektrx ID Transaksi_* untuk melihat detail transaksi.\n`;
    caption += `_Halaman ${page} dari ${totalPages}_`;

    const inlineKeyboard = [];
    if (page < totalPages) {
      inlineKeyboard.push([
        {
          text: "Berikutnya ▶️",
          callback_data: `riwayattransaksi ${page + 1}`,
          style: "primary",
        },
      ]);
    }
    inlineKeyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]);

    bot.sendMessage(chat_id, esc(caption), {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: inlineKeyboard,
      },
    });
  }
}
