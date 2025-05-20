const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch');

// HTTPサーバー（Render対策）
http.createServer((_, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

// Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// URLを展開（短縮リンク対応）
async function expandUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (AntiArashiBot)'
      }
    });

    const finalUrl = response.url || url;

    // metaリダイレクト対策
    const text = await response.text();
    const metaMatch = text.match(/http-equiv=["']refresh["'] content=["']\d+;\s*url=(.*?)["']/i);
    if (metaMatch) return metaMatch[1];

    return finalUrl;
  } catch {
    return url;
  }
}

// 不正URL検出＆Kick処理
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const content = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    const rawUrl = url.toLowerCase();

    // ✅ 展開せず強制Kick対象に含まれるか
    const forceMatched = config.forceKickKeywords?.some(keyword =>
      rawUrl.includes(keyword.toLowerCase())
    );

    // ✅ 展開して招待リンク含まれるか
    const expandedUrl = await expandUrl(url);
    const inviteMatched = config.bannedInvites?.some(invite =>
      expandedUrl.toLowerCase().includes(invite.toLowerCase())
    );

    if (forceMatched || inviteMatched) {
      try {
        await message.delete();
        await message.guild.members.kick(message.author.id, `Posted banned or forced keyword URL`);
        console.log(`❌ Kicked ${message.author.tag} for posting: ${url}`);
      } catch (err) {
        console.error(`⚠️ Kick failed: ${message.author.tag}`, err);
      }
      return; // 1件検出で処理終了
    }
  }
}

client.on('messageCreate', checkAndKick);
client.on('messageUpdate', (_, newMsg) => checkAndKick(newMsg));

client.login(process.env.BOT_TOKEN);
