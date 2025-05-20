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
  console.log(✅ Bot logged in as ${client.user.tag});
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

    // ✅ 強制キーワードに一致するか（展開せず）
    const forceMatched = config.forceKickKeywords?.some(keyword =>
      rawUrl.includes(keyword.toLowerCase())
    );

    // ✅ URLを展開して招待リンクなどと照合
    const expandedUrl = await expandUrl(url);
    const inviteMatched = config.bannedInvites?.some(invite =>
      expandedUrl.toLowerCase().includes(invite.toLowerCase())
    );

    if (forceMatched || inviteMatched) {
      try {
        await message.delete();
        console.log(🗑️ Deleted message from ${message.author.tag}: ${url});

        // ✅ DM送信（共通）
        try {
          await message.author.send("あなたが送信したメッセージは荒らし対策により削除されました。");
        } catch (dmErr) {
          console.warn(⚠️ DM送信失敗: ${message.author.tag});
        }

        if (inviteMatched) {
          // ✅ 招待リンクなどに一致 → キックする
          await message.guild.members.kick(message.author.id, Posted banned invite URL);
          console.log(❌ Kicked ${message.author.tag} for posting: ${url});
        } else if (forceMatched) {
          // ✅ forceキーワードに一致 → キックしない
          console.log(🚨 Force keyword matched for ${message.author.tag}, kick skipped.);
        }

      } catch (err) {
        console.error(⚠️ 処理失敗: ${message.author.tag}, err);
      }

      return; // 1件検出で処理終了
    }
  }
}

client.on('messageCreate', checkAndKick);
client.on('messageUpdate', (_, newMsg) => checkAndKick(newMsg));

const { PermissionFlagsBits } = require('discord.js');

// スパム対策設定
const spamConfig = {
  maxMessages: 5,
  interval: 10 * 1000,         // 10秒間
  timeoutDuration: 30 * 1000   // 30秒間タイムアウト
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

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const guild = message.guild;

  // ログ更新
  const logs = cleanupOldLogs(userId);
  logs.push(Date.now());
  messageLogs.set(userId, logs);

  if (logs.length >= spamConfig.maxMessages) {
    try {
      // メッセージ削除処理
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = fetched.filter(
        m => m.author.id === userId && Date.now() - m.createdTimestamp < spamConfig.interval
      );

      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
      }

      // DM通知
      try {
        await message.author.send('あなたの連続したメッセージはスパムと判断され、削除されました。30秒間メッセージを送信できなくなります。');
      } catch {
        console.warn(`⚠️ DM送信失敗: ${message.author.tag}`);
      }

      // タイムアウト処理
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

      // ログ送信
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

    // ログリセット
    messageLogs.set(userId, []);
  }
});
