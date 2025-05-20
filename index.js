const { Client, GatewayIntentBits, Partials, PermissionFlagsBits } = require('discord.js');
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

client.once('ready', () => {
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
  if (!message || !message.content || message.author?.bot || !message.guild) return;

  const content = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    const rawUrl = url.toLowerCase();

    const forceMatched = config.forceKickKeywords?.some(keyword =>
      rawUrl.includes(keyword.toLowerCase())
    );

    const expandedUrl = await expandUrl(url);
    const inviteMatched = config.bannedInvites?.some(invite =>
      expandedUrl.toLowerCase().includes(invite.toLowerCase())
    );

    if (forceMatched || inviteMatched) {
      try {
        if (message.deletable) await message.delete();
        console.log(`🗑️ Deleted message from ${message.author.tag}: ${url}`);

        try {
          await message.author.send("あなたが送信したメッセージは荒らし対策により削除されました。");
        } catch {
          console.warn(`⚠️ DM送信失敗: ${message.author.tag}`);
        }

        if (inviteMatched) {
          try {
            await message.guild.members.kick(message.author.id, 'Posted banned invite URL');
            console.log(`❌ Kicked ${message.author.tag} for posting: ${url}`);
          } catch (kickErr) {
            console.warn(`⚠️ キック失敗: ${message.author.tag}`, kickErr);
          }
        } else {
          console.log(`🚨 Force keyword matched for ${message.author.tag}, kick skipped.`);
        }

      } catch (err) {
        console.error(`⚠️ 処理失敗: ${message.author.tag}`, err);
      }

      return;
    }
  }
}

// スパム対策設定
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
  if (updatedLogs.length === 0) {
    messageLogs.delete(userId);
  } else {
    messageLogs.set(userId, updatedLogs);
  }
  return updatedLogs;
}

async function handleSpam(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const guild = message.guild;
  const logs = cleanupOldLogs(userId);
  logs.push(Date.now());
  messageLogs.set(userId, logs);

  if (logs.length >= spamConfig.maxMessages) {
    try {
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = fetched.filter(
        m => m.author.id === userId && Date.now() - m.createdTimestamp < spamConfig.interval
      );

      for (const msg of userMessages.values()) {
        if (msg.deletable) await msg.delete().catch(() => {});
      }

      try {
        await message.author.send('あなたの連続したメッセージはスパムと判断され、削除されました。30秒間メッセージを送信できなくなります。');
      } catch {
        console.warn(`⚠️ DM送信失敗: ${message.author.tag}`);
      }

      let member;
      try {
        member = await guild.members.fetch(userId);
      } catch (err) {
        console.warn(`⚠️ メンバー取得失敗: ${message.author.tag}`);
      }

      if (member?.moderatable && typeof member.timeout === 'function') {
        try {
          await member.timeout(spamConfig.timeoutDuration, 'スパム対策によるタイムアウト');
        } catch (err) {
          console.warn(`⚠️ タイムアウト失敗: ${message.author.tag}`, err);
        }
      } else {
        console.warn(`⚠️ タイムアウトできません: ${message.author.tag}`);
      }

      if (!config?.logChannelId) {
        console.warn('⚠️ logChannelId が設定されていません。');
      } else {
        const logChannel = guild.channels.cache.get(config.logChannelId);
        if (logChannel && logChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
          await logChannel.send(`🛑 **${message.author.tag}** がスパム投稿によりメッセージ削除および30秒間のタイムアウト処理を受けました。`);
        } else {
          console.warn('⚠️ ログチャンネルにメッセージを送信できません。');
        }
      }

    } catch (err) {
      console.error(`⚠️ スパム対処エラー: ${message.author.tag}`, err);
    }

    messageLogs.set(userId, []);
  }
}

// イベント登録
client.on('messageCreate', async (message) => {
  await checkAndKick(message);
  await handleSpam(message);
});

client.on('messageUpdate', (_, newMsg) => checkAndKick(newMsg));

// ログイン
client.login(config.token);
