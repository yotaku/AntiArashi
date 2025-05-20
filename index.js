const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch'); // 要インストール: npm install node-fetch
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(process.env.PORT || 3000);

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

// 🔍 URLを正規化（短縮URLの場合、展開）
async function expandUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return response.url || url;
  } catch {
    return url; // エラーがあれば元URLで処理
  }
}

// 🔒 招待リンクチェック処理（新規メッセージ or 編集）
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const messageContent = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = messageContent.match(urlRegex) || [];

  for (const url of urls) {
    const expanded = await expandUrl(url);

    const matchedInvite = config.bannedInvites.find(invite =>
      expanded.toLowerCase().includes(invite.toLowerCase())
    );

    if (matchedInvite) {
      try {
        await message.delete();
        await message.guild.members.kick(message.author.id, `Posted banned invite: ${matchedInvite}`);
        console.log(`❌ Kicked ${message.author.tag} for banned invite`);
      } catch (error) {
        console.error(`⚠️ Failed to kick ${message.author.tag}:`, error);
      }
      return; // 1つ検出で十分
    }
  }
}

client.on('messageCreate', checkAndKick);
client.on('messageUpdate', async (oldMsg, newMsg) => checkAndKick(newMsg));

client.login(process.env.BOT_TOKEN);
