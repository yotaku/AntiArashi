const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch'); // 必要: npm install node-fetch

// Render用のHTTPサーバー（常時稼働維持）
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(process.env.PORT || 3000);

// Discordクライアントの初期化
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

// 🔍 短縮URLを展開する関数（GETでリダイレクト追跡）
async function expandUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (AntiArashiBot)', // 一部サービスで必須
      },
    });
    return response.url || url;
  } catch (err) {
    console.warn(`⚠️ URL展開失敗: ${url}`);
    return url; // 展開失敗したらそのまま使用
  }
}

// 🔒 招待リンクチェック & Kick処理
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const content = message.content.toLowerCase();

  // 全URL抽出
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    const expanded = await expandUrl(url);

    const matched = config.bannedInvites.find(inv =>
      expanded.toLowerCase().includes(inv.toLowerCase())
    );

    if (matched) {
      try {
        await message.delete();
        await message.guild.members.kick(message.author.id, `Posted banned invite: ${matched}`);
        console.log(`❌ Kicked ${message.author.tag} for banned invite`);
      } catch (err) {
        console.error(`⚠️ Kick失敗: ${message.author.tag}`, err);
      }
      return; // 一つ見つけたら終了
    }
  }
}

// 新規メッセージと編集メッセージの両方に対応
client.on('messageCreate', checkAndKick);
client.on('messageUpdate', async (_, newMsg) => checkAndKick(newMsg));

// Botログイン
client.login(process.env.BOT_TOKEN);
