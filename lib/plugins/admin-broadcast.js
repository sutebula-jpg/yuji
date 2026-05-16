import { getTelegramUsers } from "../lib/database.js";
import t from '../lib/datetime.js';

let handler = async ({
  bot,
  bot_id,
  chat_id,
  from,
  text,
  command,
  message_id,
}) => {
  let time = await t()
  try {
    let users = await getTelegramUsers();
    if (!text)
      return bot.reply(`*Format Broadcast 📢*
/${command} _pesan broadcast_

Broadcast akan dikirim ke *${users.length} Pengguna*`);

    await bot.reply(
      `*Memulai Broadcast...*\n` +
      `Target: ${users.length} pengguna\n` +
      `Estimasi Waktu: ${Math.ceil((users.length * 1.5) / 60)} menit`
    );

    let capt = `*📢 PESAN BROADCAST*\n\n`;
    capt += `*Selamat ${time.salam}*\n\n${text}\n\n━━━━━━━━━━━━━━━━━\nTerima kasih telah menggunakan layanan kami.`;

    let success = 0;
    let failed = 0;
    let blocked = 0;

    for (let user of users) {
      try {
        await bot.sendMessage(user.userId, esc(capt), {
          parse_mode: "MarkdownV2",
        });
        success++;
      } catch (e) {
        if (e.message.includes("blocked") || e.message.includes("Forbidden")) {
          blocked++;
        } else {
          failed++;
          console.log(`Gagal Broadcast ke ${user.userId}: ${e.message}`);
        }
      }
      await sleep(1500);
    }

    let report = `*📢 Laporan Broadcast Selesai*\n\n`;
    report += `✅ Sukses: ${success}\n`;
    report += `🚫 Diblokir User: ${blocked}\n`;
    report += `❌ Gagal: ${failed}\n`;
    report += `📊 Total Target: ${users.length}`;

    await bot.sendMessage(
      chat_id,
      esc(report),
      {
        parse_mode: "MarkdownV2",
        reply_to_message_id: message_id,
      }
    );
  } catch (e) {
    await bot.reply(`*Error pada fitur broadcast ❗️*`);
    console.log(e);
  }
};

handler.command = ["broadcast", "bc"];
handler.admin = true;

export default handler;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
