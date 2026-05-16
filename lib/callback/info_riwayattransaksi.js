import { getUserTransactionHistory } from "../lib/database.js";
import { generateRiwayatCard, editWithCard } from "../lib/card-generator.js";

const ITEMS_PER_PAGE = 5;

let handler = async ({ bot, chat_id, from, data, message_id }) => {
  let page = 1;
  const args = data.data.split(" ");
  if (args[1]) {
    page = Math.max(1, parseInt(args[1]) || 1);
  }

  const skip = (page - 1) * ITEMS_PER_PAGE;
  let dataTrx = await getUserTransactionHistory(from, ITEMS_PER_PAGE, skip);

  if (!dataTrx.success) {
    return bot.answerCallbackQuery(data.id, { text: `Error: ${dataTrx.error}`, show_alert: true });
  } else if (dataTrx.total === 0) {
    return bot.answerCallbackQuery(data.id, { text: "Kamu belum memiliki riwayat transaksi.", show_alert: true });
  }

  const transactions = dataTrx.data;
  const totalItems = dataTrx.total;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (page > totalPages) page = totalPages;

  let caption = `*🔖 RIWAYAT TRANSAKSI*

*- Total Transaksi :* ${totalItems} transaksi\n\n`;

  let num = (page - 1) * ITEMS_PER_PAGE + 1;
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

  let buttons = [];
  if (page > 1) {
    buttons.push({
      text: "◀️ Sebelumnya",
      callback_data: `riwayattransaksi ${page - 1}`,
      style: "primary",
    });
  }
  if (page < totalPages) {
    buttons.push({
      text: "Berikutnya ▶️",
      callback_data: `riwayattransaksi ${page + 1}`,
      style: "primary",
    });
  }

  let inlineKeyboard = [];
  if (buttons.length > 0) inlineKeyboard.push(buttons);
  inlineKeyboard.push([{ text: "↩️ Kembali ke Menu", callback_data: "main_menu", style: "danger" }]);

  const cardBuf = await generateRiwayatCard({
    from,
    totalTransaksi: rupiah(0),
    totalPcs: totalItems,
    transactions: transactions.map((item, i) => ({
      num: (page - 1) * ITEMS_PER_PAGE + i + 1,
      name: item.productName,
      reffId: item.reffId,
      total: rupiah(item.totalAmount),
      qty: item.quantity,
      date: new Date(item.createdAt).toLocaleDateString('id-ID')
    })),
    page,
    totalPages
  });

  await editWithCard(bot, chat_id, message_id, cardBuf, esc(caption), {
    inline_keyboard: inlineKeyboard,
  });
};

handler.key = "riwayattransaksi";

export default handler;
