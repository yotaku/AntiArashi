const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch'); // npm install node-fetch

// Renderの監視用サーバー
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
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// URL展開（短縮URLの展開処理）
async function expandUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.url || url;
  } catch (err) {
    return url; // 展開に失敗したら元のURLを返す
  }
}

// メッセージをチェックして違反者をキック
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const messageContent = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageContent.match(urlRegex) || [];

  for (const url of urls) {
    const expanded = await expandUrl(url); // 短縮URLを展開
    const allUrls = [url.toLowerCase(), expanded.toLowerCase()];

    const matchedInvite = config.bannedInvites.find(invite =>
      allUrls.some(u => u.includes(invite.toLowerCase()))
    );

    if (matchedInvite) {
      try {
        await message.delete();
        await message.guild.members.kick(message.author.id, `Posted banned invite: ${matchedInvite}`);
        console.log(`❌ Kicked ${message.author.tag} for banned invite`);
      } catch (error) {
        console.error(`⚠️ Failed to kick ${message.author.tag}:`, error);
      }
      return; // 最初の1件だけ処理
    }
  }
}

// 新規メッセージと編集済みメッセージの両方に対応
client.on('messageCreate', checkAndKick);
client.on('messageUpdate', async (_, newMsg) => checkAndKick(newMsg));

// Bot起動
client.login(process.env.BOT_TOKEN);
