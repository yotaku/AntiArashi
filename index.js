const { Client, GatewayIntentBits, Partials, REST, Routes, Collection, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');
const fetch = require('node-fetch');
const config = require('./config.json');
const token = process.env.DISCORD_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

// keep-alive for Render
http.createServer((_, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

// コマンド読み込み
client.commands = new Collection();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// スラッシュコマンド登録
client.once('ready', async () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    const guilds = client.guilds.cache.map(g => g.id);
    for (const guildId of guilds) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
        body: client.commands.map(cmd => cmd.data.toJSON())
      });
      console.log(`🔧 コマンド登録完了: ${guildId}`);
    }
  } catch (err) {
    console.error('❌ コマンド登録失敗:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (command) await command.execute(interaction);
});
// 送信者特定
function getSenderTag(message) {
  if (message.webhookId) return 'Webhook';
  if (message.author.bot) return `@${message.author.username}`; // Bot → @Bot名
  return `@${message.member?.displayName || message.author.username}`; // ユーザー → @表示名
}

// URL展開
async function expandUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (AntiArashiBot)' }
    });
    const text = await response.text();
    const metaMatch = text.match(/http-equiv=["']refresh["'] content=["']\d+;\s*url=(.*?)["']/i);
    return metaMatch ? metaMatch[1] : response.url || url;
  } catch {
    return url;
  }
}

// 不正リンク検出と処理
function isUserMessage(message) {
  return (
    message &&
    message.author &&
    message.guild &&
    message.author.id !== client.user.id // 自分自身のBotは除外するが、それ以外のBotやWebhookは含める
  );
}

async function checkAndKick(message) {
  if (!isUserMessage(message) || !message.content || !message.guild) return;

  const content = message.content.toLowerCase();
  const urls = content.match(/https?:\/\/[^\s]+/g) || [];

  for (const url of urls) {
    const expandedUrl = await expandUrl(url);
    const forceMatched = config.forceKickKeywords.some(k => url.includes(k));
    const inviteMatched = config.bannedInvites.some(i => expandedUrl.includes(i));

    if (forceMatched || inviteMatched) {
      try {
        if (message.deletable) await message.delete();
        try { await message.author.send('あなたが送信したメッセージは荒らし対策により削除されました。'); } catch {}

        if (inviteMatched) {
          try { await message.guild.members.kick(message.author.id, '招待リンク投稿'); } catch {}
        }

        const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        const logChannelId = db[message.guild.id];
        if (logChannelId) {
          const logChannel = message.guild.channels.cache.get(logChannelId);
          const sender = getSenderTag(message);
          if (logChannel?.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            await logChannel.send(`🚨 ${sender} のメッセージを削除しました: ${url}`);
          }
        }

      } catch (err) {
        console.error('❌ 処理中エラー:', err);
      }
      return;
    }
  }
}


// スパム検出
const spamConfig = {
  maxMessages: 5,
  interval: 10 * 1000,
  timeoutDuration: 30 * 1000
};

const messageLogs = new Map();

function cleanupOldLogs(userId) {
  const now = Date.now();
  const logs = messageLogs.get(userId) || [];
  const updatedLogs = logs.filter(ts => now - ts < spamConfig.interval);
  messageLogs.set(userId, updatedLogs);
  return updatedLogs;
}

async function handleSpam(message, userData, logChannel) {
  const { author } = message;
  const sender = getSenderTag(message);

  if (!message.member) {
    console.error(`❌ スパム処理エラー: ${author.tag} はメンバー情報が取得できません`);
    return;
  }

  // DM通知
  try {
    await author.send("あなたのメッセージはスパム検出により削除されました。");
  } catch (e) {
    console.warn(`⚠️ ${author.tag} へのDMに失敗: ${e.message}`);
  }

  // タイムアウト
  try {
    await message.member.timeout(30_000, "スパム防止");
  } catch (e) {
    console.error(`❌ ${author.tag} のタイムアウト失敗: ${e.message}`);
  }

  // ログ送信
  if (logChannel?.permissionsFor(message.guild.members.me).has(PermissionFlagsBits.SendMessages)) {
    await logChannel.send(`🛑 ${sender} がスパム検出により削除・タイムアウトされました。`);
  }
}


client.on('messageCreate', async (message) => {
  await checkAndKick(message);
  await handleSpam(message);
});

client.on('messageUpdate', (_, newMsg) => checkAndKick(newMsg));

client.login(token);
