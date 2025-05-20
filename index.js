const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch'); // npm install node-fetch

// Render用 HTTP keepalive
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(process.env.PORT || 3000);

// Discordクライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Message, Partials.Channel],
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// 🔍 URL展開（x.gd専用処理含む）
async function expandUrl(url) {
  try {
    // x.gd はGETでしか展開できない
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (AntiArashiBot)'
      }
    });
    const finalUrl = response.url || url;

    // x.gdのように中間ページで止まる場合は、本文からmetaリダイレクトを取得（保険）
    const text = await response.text();
    const match = text.match(/http-equiv=["']refresh["'] content=["']\d+;\s*url=(.*?)["']/i);
    if (match) {
      return match[1];
    }

    return finalUrl;
  } catch (err) {
    console.warn(`⚠️ URL展開失敗: ${url}`);
    return url;
  }
}

// 🔒 招待リンク検出処理
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const content = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    const expanded = await expandUrl(url);

    const matched = config.bannedInvites.find(invite =>
      expanded.toLowerCase().includes(invite.toLowerCase()) ||
      url.toLowerCase().includes("x.gd") // 明示的にx.gdが含まれているだけで処理
    );

    if (matched) {
      try {
        await message.delete();
        await message.guild.members.kick(message.author.id, `Posted banned invite: ${matched}`);
        console.log(`❌ Kicked ${message.author.tag} for banned invite or x.gd usage`);
      } catch (err) {
        console.error(`⚠️ Kick失敗: ${message.author.tag}`, err);
      }
      return;
    }
  }
}

// メッセージ作成＆編集に対応
client.on('messageCreate', checkAndKick);
client.on('messageUpdate', async (_, newMsg) => checkAndKick(newMsg));

// Discordログイン
client.login(process.env.BOT_TOKEN);
