import fs from 'fs';
import path from 'path';
import { safeDeleteMessage } from './myfunc.js';

let sharpLoader;
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64'
);

async function getSharp() {
  if (!sharpLoader) {
    sharpLoader = import('sharp').then((mod) => mod.default).catch((err) => {
      console.warn(`[card-generator] sharp tidak tersedia, memakai gambar fallback: ${err.message}`);
      return null;
    });
  }
  return sharpLoader;
}

const TMP_DIR = './src/tmp/cards';
const W = 800;
const CARD_H = 400;
const F = 'Arial,Helvetica,sans-serif';

function ensureDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function e(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function svgHead(w, h) {
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#5B8EF0"/><stop offset="100%" stop-color="#3ECFA4"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#0B0E14" rx="20"/>
  <rect x="16" y="16" width="${w - 32}" height="${h - 32}" fill="#12161F" rx="14" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <rect x="16" y="16" width="${w - 32}" height="3" fill="url(#ac)" rx="1"/>`;
}

function svgTitle(title, y = 50) {
  return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" fill="#7B8099" letter-spacing="3">${e(title)}</text>`;
}

function svgSection(label, y) {
  return `<text x="50" y="${y}" font-family="${F}" font-size="10" fill="#5B8EF0" letter-spacing="2">${e(label)}</text>`;
}

function svgRow(label, value, y, valueColor = '#E8EAF0') {
  return `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">${e(label)}</text>
  <text x="300" y="${y}" font-family="${F}" font-size="14" font-weight="bold" fill="${valueColor}">${e(value)}</text>`;
}

function svgLine(y) {
  return `<line x1="50" y1="${y}" x2="${W - 50}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
}

function svgStatBox(x, y, w, value, label) {
  return `<rect x="${x}" y="${y}" width="${w}" height="70" fill="#1A1F2C" rx="10"/>
  <text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" font-family="${F}" font-size="20" font-weight="bold" fill="#3ECFA4">${e(value)}</text>
  <text x="${x + w / 2}" y="${y + 55}" text-anchor="middle" font-family="${F}" font-size="10" fill="#7B8099" letter-spacing="1">${e(label)}</text>`;
}

// ─── AVATAR HELPERS ───
const AVATAR_SIZE = 60;
const AVATAR_CX = 80;
const AVATAR_CY = 90;
const AVATAR_TTL = 10 * 60 * 1000; // 10 min cache
const avatarCache = new Map();
const circleMask = Buffer.from(
  `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/></svg>`
);

export async function fetchAvatar(bot, userId) {
  const cached = avatarCache.get(userId);
  if (cached && Date.now() - cached.ts < AVATAR_TTL) return cached.buf;
  try {
    ensureDir();
    const photos = await bot.getUserProfilePhotos(userId, { limit: 1 });
    if (!photos || !photos.photos || !photos.photos.length) { avatarCache.set(userId, { buf: null, ts: Date.now() }); return null; }
    const best = photos.photos[0];
    const fileId = best[best.length - 1].file_id;
    const dlPath = await bot.downloadFile(fileId, TMP_DIR);
    const raw = fs.readFileSync(dlPath);
    try { fs.unlinkSync(dlPath); } catch { }
    const sharp = await getSharp();
    if (!sharp) {
      avatarCache.set(userId, { buf: null, ts: Date.now() });
      return null;
    }
    const buf = await sharp(raw)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    avatarCache.set(userId, { buf, ts: Date.now() });
    return buf;
  } catch {
    avatarCache.set(userId, { buf: null, ts: Date.now() });
    return null;
  }
}

function svgAvatarRing(cx = AVATAR_CX, cy = AVATAR_CY) {
  const r = AVATAR_SIZE / 2 + 2;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1A1F2C" stroke="url(#ac)" stroke-width="2"/>
  <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-family="${F}" font-size="22" fill="#3B3F52">👤</text>`;
}

async function saveCard(svg, filename, avatarBuf = null) {
  const sharp = await getSharp();
  if (!sharp) return FALLBACK_PNG;

  let buf = await sharp(Buffer.from(svg)).png().toBuffer();
  if (avatarBuf) {
    try {
      buf = await sharp(buf)
        .composite([{ input: avatarBuf, left: AVATAR_CX - AVATAR_SIZE / 2, top: AVATAR_CY - AVATAR_SIZE / 2 }])
        .png()
        .toBuffer();
    } catch { }
  }
  return buf;
}

// Delete old message + send new photo (replaces editMessageMedia)
export async function editWithCard(bot, chat_id, message_id, cardBuffer, caption, reply_markup) {
  await safeDeleteMessage(bot, chat_id, message_id);
  return bot.sendPhoto(chat_id, cardBuffer, {
    caption,
    file_name: 'card.png',
    contentType: 'image/png',
    parse_mode: 'MarkdownV2',
    reply_markup: normalizeReplyMarkup(reply_markup)
  });
}

function normalizeReplyMarkup(reply_markup) {
  if (!reply_markup) return undefined;
  if (reply_markup.keyboard) {
    return {
      ...reply_markup,
      resize_keyboard: true,
      is_persistent: true,
      one_time_keyboard: false,
    };
  }
  if (reply_markup.inline_keyboard || reply_markup.remove_keyboard) {
    return reply_markup;
  }
  return { inline_keyboard: reply_markup };
}

// ─── START / MAIN MENU CARD ───
export async function generateStartCard(d) {
  const H = CARD_H;
  const { bot, from, pushname, username, balance, totalBeli, totalTransaksi,
    botTerjual, botRevenue, totalUsers, storeName, tanggal, jam } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const svg = `${svgHead(W, H)}
  ${svgTitle((storeName || 'STORE').toUpperCase() + ' · DIGITAL STORE')}
  ${svgAvatarRing()}
  <text x="125" y="82" font-family="${F}" font-size="22" font-weight="bold" fill="#E8EAF0">Halo, ${e(pushname)}</text>
  <text x="125" y="100" font-family="${F}" font-size="13" fill="#7B8099">@${e(username)} · ${from}</text>
  <text x="125" y="115" font-family="${F}" font-size="11" fill="#5B8EF0">${e(tanggal)} · ${e(jam)}</text>
  ${svgLine(130)}
  ${svgSection('PROFIL KAMU', 150)}
  ${svgRow('Saldo', balance, 172, '#3ECFA4')}
  ${svgRow('Total Beli', totalBeli + ' pcs', 197)}
  ${svgRow('Total Transaksi', totalTransaksi, 222)}
  ${svgLine(245)}
  ${svgSection('STATISTIK TOKO', 270)}
  ${svgStatBox(50, 285, 220, botTerjual + ' pcs', 'TERJUAL')}
  ${svgStatBox(290, 285, 220, botRevenue, 'REVENUE')}
  ${svgStatBox(530, 285, 220, totalUsers, 'PENGGUNA')}
</svg>`;

  return saveCard(svg, `start_${from}.png`, avatarBuf);
}

// ─── SALDO CARD ───
export async function generateSaldoCard(d) {
  const H = CARD_H;
  const { bot, from, pushname, balance, totalBeli, totalTransaksi, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const svg = `${svgHead(W, H)}
  ${svgTitle('💰 SALDO — ' + (storeName || 'STORE').toUpperCase())}
  ${svgAvatarRing()}
  <text x="125" y="85" font-family="${F}" font-size="18" font-weight="bold" fill="#E8EAF0">${e(pushname)}</text>
  <text x="125" y="107" font-family="${F}" font-size="12" fill="#7B8099">Saldo saat ini</text>
  ${svgLine(130)}
  <text x="${W / 2}" y="180" text-anchor="middle" font-family="${F}" font-size="36" font-weight="bold" fill="#3ECFA4">${e(balance)}</text>
  <text x="${W / 2}" y="210" text-anchor="middle" font-family="${F}" font-size="12" fill="#7B8099">Pilih nominal top-up dibawah</text>
  ${svgLine(230)}
  ${svgSection('PENGGUNAAN', 255)}
  ${svgStatBox(50, 270, 340, totalBeli + ' pcs', 'TOTAL PEMBELIAN')}
  ${svgStatBox(410, 270, 340, totalTransaksi, 'TOTAL TRANSAKSI')}
</svg>`;

  return saveCard(svg, `saldo_${from}.png`, avatarBuf);
}

// ─── MENU CARD (menulain) ───
export async function generateMenuCard(d) {
  const H = CARD_H;
  const { bot, from, pushname, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const svg = `${svgHead(W, H)}
  ${svgTitle((storeName || 'STORE').toUpperCase() + ' · MENU')}
  ${svgAvatarRing()}
  <text x="125" y="85" font-family="${F}" font-size="18" font-weight="bold" fill="#E8EAF0">${e(pushname)}</text>
  <text x="125" y="107" font-family="${F}" font-size="13" fill="#7B8099">Pilih menu dibawah ini</text>
</svg>`;

  return saveCard(svg, `menu_${from}.png`, avatarBuf);
}

// ─── INFO BOT CARD ───
export async function generateInfoCard(d) {
  const H = CARD_H;
  const { from, owner, channel, developer, price, storeName } = d;

  const svg = `${svgHead(W, H)}
  ${svgTitle('🤖 ' + (storeName || 'STORE').toUpperCase() + ' · INFO')}
  ${svgSection('DETAIL BOT', 80)}
  ${svgRow('Owner', '@' + owner, 105)}
  ${svgRow('Channel', '@' + channel, 130)}
  ${svgLine(150)}
  ${svgSection('DEVELOPER', 175)}
  ${svgRow('Contact', '@' + developer, 200)}
  ${svgLine(220)}
  ${svgSection('SEWA BOT', 245)}
  <text x="50" y="270" font-family="${F}" font-size="13" fill="#7B8099">Pembayaran otomatis · Multi metode bayar · Panel admin</text>
  <text x="50" y="292" font-family="${F}" font-size="13" fill="#7B8099">Statistik lengkap · Pengiriman otomatis</text>
  <rect x="50" y="308" width="700" height="30" fill="rgba(62,207,164,0.1)" rx="6"/>
  <text x="${W / 2}" y="328" text-anchor="middle" font-family="${F}" font-size="14" font-weight="bold" fill="#3ECFA4">Harga: ${e(price)}</text>
</svg>`;

  return saveCard(svg, `info_${from}.png`);
}

// ─── ADMIN CARD ───
export async function generateAdminCard(d) {
  const H = CARD_H;
  const { bot, from, pushname, botId, botUsername, tanggal, jam, maintenance,
    dailyPcs, dailyRevenue, totalSold, totalRevenue, totalUsers, totalProducts } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  const svg = `${svgHead(W, H)}
  ${svgTitle('👑 ADMIN PANEL')}
  ${svgAvatarRing()}
  <text x="125" y="82" font-family="${F}" font-size="18" font-weight="bold" fill="#E8EAF0">Halo, ${e(pushname || 'Admin')}</text>
  <text x="125" y="100" font-family="${F}" font-size="12" fill="${maintenance ? '#F07070' : '#3ECFA4'}">${maintenance ? '● MAINTENANCE' : '● AKTIF'}</text>
  <text x="125" y="115" font-family="${F}" font-size="11" fill="#5B8EF0">${e(tanggal)} · ${e(jam)}</text>
  ${svgLine(130)}
  ${svgSection('BOT INFO', 150)}
  ${svgRow('ID', botId, 162)}
  ${svgRow('Username', '@' + botUsername, 185)}
  ${svgLine(205)}
  ${svgSection('DATA HARIAN', 228)}
  ${svgRow('Terjual', dailyPcs + ' pcs', 252, '#3ECFA4')}
  ${svgRow('Pendapatan', dailyRevenue, 275, '#3ECFA4')}
  ${svgLine(295)}
  ${svgStatBox(50, 308, 165, totalSold + ' pcs', 'TERJUAL')}
  ${svgStatBox(230, 308, 185, totalRevenue, 'REVENUE')}
  ${svgStatBox(430, 308, 165, totalUsers, 'USER')}
  ${svgStatBox(610, 308, 140, totalProducts, 'PRODUK')}
</svg>`;

  return saveCard(svg, `admin_${from || 'default'}.png`, avatarBuf);
}

// ─── ORDER CONFIRMATION CARD ───
export async function generateOrderCard(d) {
  const { from, pushname, productName, variant, harga, stok, jumlah, subtotal, total,
    voucher, diskon, storeName } = d;

  const hasVoucher = !!voucher;
  let y = 80;
  let rows = '';
  rows += svgSection('DETAIL PESANAN', y); y += 28;
  rows += svgRow('Produk', productName, y); y += 25;
  rows += svgRow('Variasi', variant, y); y += 25;
  rows += svgRow('Harga', harga, y); y += 25;
  rows += svgRow('Stok', stok, y); y += 25;
  rows += svgRow('Jumlah', jumlah + ' pcs', y); y += 25;
  if (hasVoucher) {
    rows += svgRow('Voucher', voucher + ' (-' + diskon + ')', y, '#F0B95B'); y += 25;
  }
  rows += svgLine(y + 5); y += 25;
  rows += `<text x="50" y="${y}" font-family="${F}" font-size="16" fill="#7B8099">TOTAL</text>
  <text x="300" y="${y}" font-family="${F}" font-size="20" font-weight="bold" fill="#3ECFA4">${e(total)}</text>`;
  y += 30;

  const H = Math.max(CARD_H, y + 20);
  const svg = `${svgHead(W, H)}
  ${svgTitle('🛒 KONFIRMASI PESANAN — ' + e(storeName || 'STORE'))}
  ${rows}
</svg>`;

  return saveCard(svg, `order_${from}.png`);
}

// ─── CARA ORDER CARD ───
export async function generateCaraOrderCard(d) {
  const { from, storeName } = d;
  const steps = [
    'Buka List Produk dan pilih kategori',
    'Pilih varian yang ingin dibeli',
    'Atur jumlah dengan tombol +/- atau ketik manual',
    'Pilih metode pembayaran',
    'Scan QRIS atau bayar via Saldo',
    'Produk otomatis dikirim setelah bayar',
  ];

  let stepsText = '';
  let y = 90;
  steps.forEach((s, i) => {
    stepsText += `<circle cx="65" cy="${y - 4}" r="12" fill="${i === 5 ? '#3ECFA4' : '#1A1F2C'}"/>
    <text x="65" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" font-weight="bold" fill="${i === 5 ? '#0B0E14' : '#5B8EF0'}">${i + 1}</text>
    <text x="90" y="${y}" font-family="${F}" font-size="13" fill="#E8EAF0">${e(s)}</text>`;
    y += 38;
  });

  const H = Math.max(CARD_H, y + 20);
  const svg = `${svgHead(W, H)}
  ${svgTitle('❓ CARA ORDER — ' + (storeName || 'STORE').toUpperCase())}
  ${stepsText}
</svg>`;

  return saveCard(svg, `caraorder_${from}.png`);
}

// ─── PRODUK POPULER CARD ───
export async function generatePopulerCard(d) {
  const { from, storeName, items } = d;
  const itemCount = Math.min(items.length, 10);

  let rows = '';
  let y = 80;
  items.slice(0, 10).forEach((item, i) => {
    const num = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">${num}</text>
    <text x="90" y="${y}" font-family="${F}" font-size="14" font-weight="bold" fill="#E8EAF0">${e(item.name)}</text>
    <text x="550" y="${y}" font-family="${F}" font-size="13" fill="#3ECFA4">${e(item.sold)} pcs</text>
    <text x="650" y="${y}" font-family="${F}" font-size="13" fill="#7B8099">${e(item.revenue)}</text>`;
    y += 38;
  });

  const H = Math.max(CARD_H, y + 20);
  const svg = `${svgHead(W, H)}
  ${svgTitle('✨ PRODUK POPULER — ' + (storeName || 'STORE').toUpperCase())}
  ${rows}
</svg>`;

  return saveCard(svg, `populer_${from}.png`);
}

// ─── VOUCHER INPUT CARD ───
export async function generateVoucherCard(d) {
  const H = CARD_H;
  const { from, productName, variant, harga, jumlah, storeName } = d;

  const svg = `${svgHead(W, H)}
  ${svgTitle('🎫 INPUT VOUCHER — ' + e(storeName || 'STORE'))}
  ${svgSection('DETAIL', 80)}
  ${svgRow('Produk', productName, 105)}
  ${svgRow('Variasi', variant, 130)}
  ${svgRow('Harga', harga, 155)}
  ${svgRow('Jumlah', jumlah + ' pcs', 180)}
</svg>`;

  return saveCard(svg, `voucher_${from}.png`);
}

// ─── LIST PRODUK CARD ───
export async function generateListProdukCard(d) {
  const { bot, from, pushname, storeName, salam, categories, page, totalPages } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;
  const items = categories || [];
  let y = 145;
  let rows = '';
  rows += svgSection('KATEGORI PRODUK', y); y += 25;
  if (items.length === 0) {
    rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">Belum ada produk tersedia</text>`;
    y += 30;
  } else {
    items.forEach((cat, i) => {
      rows += `<text x="50" y="${y}" font-family="${F}" font-size="13" fill="#5B8EF0" font-weight="bold">${e(cat.num)}</text>
      <text x="90" y="${y}" font-family="${F}" font-size="14" fill="#E8EAF0">${e(cat.name)}</text>`;
      y += 28;
    });
  }
  y += 10;
  rows += svgLine(y); y += 22;
  rows += `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" fill="#7B8099">Halaman ${page} dari ${totalPages}</text>`;
  y += 25;

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('🛒 ' + (storeName || 'STORE').toUpperCase() + ' · LIST PRODUK')}
  ${svgAvatarRing()}
  <text x="125" y="85" font-family="${F}" font-size="14" font-weight="bold" fill="#E8EAF0">${e(pushname)}</text>
  <text x="125" y="105" font-family="${F}" font-size="12" fill="#7B8099">Selamat ${e(salam)}</text>
  ${rows}
</svg>`;

  return saveCard(svg, `listproduk_${from}.png`, avatarBuf);
}

// ─── RIWAYAT TRANSAKSI CARD ───
export async function generateRiwayatCard(d) {
  const { from, totalTransaksi, totalPcs, transactions, page, totalPages } = d;
  let y = 80;
  let rows = '';
  rows += svgSection('RINGKASAN', y); y += 25;
  rows += svgRow('Total Transaksi', totalTransaksi, y, '#3ECFA4'); y += 25;
  rows += svgRow('Total Dibeli', totalPcs + ' pcs', y); y += 15;
  rows += svgLine(y); y += 25;
  rows += svgSection('RIWAYAT', y); y += 25;

  if (transactions.length === 0) {
    rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">Belum ada transaksi</text>`;
    y += 30;
  } else {
    transactions.forEach((t, i) => {
      rows += `<text x="50" y="${y}" font-family="${F}" font-size="13" font-weight="bold" fill="#E8EAF0">${e(t.num)}. ${e(t.name)}</text>`;
      y += 22;
      rows += `<text x="70" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">ID: ${e(t.reffId)}</text>
      <text x="350" y="${y}" font-family="${F}" font-size="11" fill="#3ECFA4">${e(t.total)}</text>
      <text x="550" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">${e(t.qty)} pcs</text>
      <text x="650" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">${e(t.date)}</text>`;
      y += 28;
    });
  }
  y += 5;
  rows += svgLine(y); y += 20;
  rows += `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" fill="#7B8099">Halaman ${page} dari ${totalPages}</text>`;
  y += 25;

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('🔖 RIWAYAT TRANSAKSI')}
  ${rows}
</svg>`;

  return saveCard(svg, `riwayat_${from}.png`);
}

// ─── DAFTAR STOK CARD ───
export async function generateStokCard(d) {
  const { from, storeName, date, products, page, totalPages } = d;
  let y = 75;
  let rows = '';
  rows += `<text x="50" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">${e(date)}</text>`;
  y += 20;
  rows += svgLine(y); y += 25;

  if (products.length === 0) {
    rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">Belum ada produk tersedia</text>`;
    y += 30;
  } else {
    products.forEach(p => {
      const icon = p.stock > 0 ? '✅' : '❌';
      rows += `<text x="50" y="${y}" font-family="${F}" font-size="13" fill="${p.stock > 0 ? '#3ECFA4' : '#F07070'}">${icon}</text>
      <text x="80" y="${y}" font-family="${F}" font-size="13" fill="#E8EAF0">${e(p.name)}</text>
      <text x="${W - 80}" y="${y}" text-anchor="end" font-family="${F}" font-size="13" font-weight="bold" fill="${p.stock > 0 ? '#3ECFA4' : '#F07070'}">x${p.stock}</text>`;
      y += 26;
    });
  }
  y += 5;
  rows += svgLine(y); y += 20;
  rows += `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" fill="#7B8099">Halaman ${page} dari ${totalPages}</text>`;
  y += 25;

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('📦 STOCK — ' + (storeName || 'STORE').toUpperCase())}
  ${rows}
</svg>`;

  return saveCard(svg, `stok_${from || 'default'}.png`);
}

// ─── CATEGORY / SELECT PRODUCT CARD ───
export async function generateCategoryCard(d) {
  const { from, categoryName, sold, products, refreshLabel } = d;
  let y = 80;
  let rows = '';
  rows += svgSection(e((categoryName || '').toUpperCase()), y); y += 22;
  rows += `<text x="50" y="${y}" font-family="${F}" font-size="12" fill="#7B8099">Terjual: ${e(sold)} pcs</text>`;
  y += 15;
  rows += svgLine(y); y += 25;

  if (products && products.length > 0) {
    products.forEach(p => {
      rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" font-weight="bold" fill="#E8EAF0">${e(p.name)}</text>`;
      y += 22;
      rows += `<text x="70" y="${y}" font-family="${F}" font-size="12" fill="#3ECFA4">${e(p.price)}</text>
      <text x="300" y="${y}" font-family="${F}" font-size="12" fill="#7B8099">Stok: ${e(p.stock)}</text>
      <text x="450" y="${y}" font-family="${F}" font-size="12" fill="#7B8099">Terjual: ${e(p.sold)} pcs</text>`;
      y += 28;
    });
  }
  if (refreshLabel) {
    y += 5;
    rows += `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="10" fill="#5B8EF0">${e(refreshLabel)}</text>`;
    y += 20;
  }

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('🛒 PRODUK')}
  ${rows}
</svg>`;

  return saveCard(svg, `category_${from || 'default'}.png`);
}

// ─── INPUT JUMLAH PESANAN CARD ───
export async function generateInputQtyCard(d) {
  const H = CARD_H;
  const { from, productName, variant, harga, stok, storeName } = d;

  const svg = `${svgHead(W, H)}
  ${svgTitle('📜 JUMLAH PESANAN — ' + e(storeName || 'STORE'))}
  ${svgSection('DETAIL', 80)}
  ${svgRow('Produk', productName, 105)}
  ${svgRow('Variasi', variant, 130)}
  ${svgRow('Harga', harga, 155)}
  ${svgRow('Stok', stok, 180)}
</svg>`;

  return saveCard(svg, `inputqty_${from}.png`);
}

// ─── LEADERBOARD CARD ───
export async function generateLeaderboardCard(d) {
  const { from, botTerjual, botRevenue, totalUsers, users } = d;
  let y = 80;
  let rows = '';
  rows += svgSection('BOT INFO', y); y += 25;
  rows += svgRow('Terjual', botTerjual + ' pcs', y, '#3ECFA4'); y += 25;
  rows += svgRow('Total Transaksi', botRevenue, y); y += 25;
  rows += svgRow('Total Pengguna', totalUsers, y); y += 15;
  rows += svgLine(y); y += 25;
  rows += svgSection('TOP USER', y); y += 25;

  if (users && users.length > 0) {
    users.forEach((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      rows += `<text x="50" y="${y}" font-family="${F}" font-size="13" fill="#7B8099">${medal}</text>
      <text x="90" y="${y}" font-family="${F}" font-size="13" font-weight="bold" fill="#E8EAF0">${e(u.name)}</text>`;
      y += 22;
      rows += `<text x="90" y="${y}" font-family="${F}" font-size="11" fill="#3ECFA4">${e(u.revenue)}</text>
      <text x="320" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">${e(u.trx)} trx</text>
      <text x="450" y="${y}" font-family="${F}" font-size="11" fill="#7B8099">${e(u.pcs)} pcs</text>`;
      y += 28;
    });
  } else {
    rows += `<text x="50" y="${y}" font-family="${F}" font-size="14" fill="#7B8099">Belum ada data transaksi</text>`;
    y += 30;
  }

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('🏆 LEADERBOARD')}
  ${rows}
</svg>`;

  return saveCard(svg, `leaderboard_${from || 'default'}.png`);
}

// ─── BROADCAST CARD ───
export async function generateBroadcastCard(d) {
  const H = CARD_H;
  const { storeName, salam } = d;

  const svg = `${svgHead(W, H)}
  ${svgTitle('📢 BROADCAST — ' + (storeName || 'STORE').toUpperCase())}
  <text x="${W / 2}" y="90" text-anchor="middle" font-family="${F}" font-size="18" font-weight="bold" fill="#E8EAF0">Selamat ${e(salam)}</text>
  <text x="${W / 2}" y="120" text-anchor="middle" font-family="${F}" font-size="13" fill="#7B8099">Pesan dari ${e(storeName || 'Store')}</text>
  ${svgLine(145)}
  <text x="${W / 2}" y="165" text-anchor="middle" font-family="${F}" font-size="11" fill="#5B8EF0">Terima kasih telah menggunakan layanan kami</text>
</svg>`;

  return saveCard(svg, `broadcast.png`);
}

// ─── NOTIF TRANSAKSI CARD (untuk GC notif admin) ───
export async function generateNotifCard(d) {
  const { bot, from, username, pushname, productName, jumlah, hargaSatuan,
    totalBayar, metode, reffId, voucher, storeName } = d;
  const avatarBuf = bot ? await fetchAvatar(bot, from) : null;

  let y = 145;
  let rows = '';
  rows += svgSection('INFORMASI TRANSAKSI', y); y += 25;
  rows += svgRow('Username', '@' + (username || '-'), y); y += 25;
  rows += svgRow('Produk', productName, y); y += 25;
  rows += svgRow('Harga Satuan', hargaSatuan, y); y += 25;
  rows += svgRow('Jumlah', jumlah + ' pcs', y); y += 25;
  rows += svgRow('Total Bayar', totalBayar, y, '#3ECFA4'); y += 25;
  rows += svgRow('Metode', metode, y); y += 25;
  if (voucher) {
    rows += svgRow('Voucher', voucher, y, '#F0B95B'); y += 25;
  }
  rows += svgRow('Ref ID', reffId, y, '#5B8EF0'); y += 15;
  rows += svgLine(y); y += 22;
  rows += `<text x="${W / 2}" y="${y}" text-anchor="middle" font-family="${F}" font-size="11" fill="#7B8099">${e(storeName || 'Store')} · Notifikasi Transaksi</text>`;
  y += 25;

  const H = Math.max(CARD_H, y + 16);
  const svg = `${svgHead(W, H)}
  ${svgTitle('� TRANSAKSI BARU — ' + (storeName || 'STORE').toUpperCase())}
  ${svgAvatarRing()}
  <text x="125" y="82" font-family="${F}" font-size="18" font-weight="bold" fill="#E8EAF0">${e(pushname || username)}</text>
  <text x="125" y="100" font-family="${F}" font-size="12" fill="#7B8099">ID: ${from}</text>
  <text x="125" y="115" font-family="${F}" font-size="11" fill="#3ECFA4">✅ Pembayaran Diterima</text>
  ${rows}
</svg>`;

  return saveCard(svg, `notif_${from}.png`, avatarBuf);
}
